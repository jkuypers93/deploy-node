import os
import requests
import mimetypes
from pathlib import Path
import subprocess
from server import PromptServer
from aiohttp import web
import hashlib
from typing import List


MODEL_EXTENSIONS = (
    ".safetensors",
    ".sft",
    ".pkl",
    ".ckpt",
    ".onnx",
    ".pt",
    ".pth",
    ".bin",
    ".pb",
    ".h5",
    ".tflite",
)
base_dir = os.getcwd()
models_dir = os.path.join(base_dir, "models")
custom_nodes_dir = os.path.join(base_dir, "custom_nodes")
SEARCH_DIRS = [models_dir, custom_nodes_dir]


def get_git_version_info(repo_path):
    if not os.path.exists(repo_path):
        print("error", f"The path '{repo_path}' does not exist")

    # Check if it's a git repository by looking for .git directory
    if not os.path.exists(os.path.join(repo_path, ".git")):
        print("error", f"The path '{repo_path}' is not a git repository")

    try:
        # Get remote URL
        result = subprocess.run(
            ["git", "config", "--get", "remote.origin.url"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=True,
        )
        remote_url = result.stdout.strip()

        # Convert SSH URL to HTTPS URL if needed
        if remote_url.startswith("git@github.com:"):
            remote_url = remote_url.replace(":", "/")
            remote_url = remote_url.replace("git@", "https://")

        # Get commit SHA
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=True,
        )
        commit_sha = result.stdout.strip()

        # Get short SHA
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=True,
        )
        short_sha = result.stdout.strip()

        # Get version from tags
        result = subprocess.run(
            ["git", "tag", "--points-at", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=True,
        )
        tags = result.stdout.strip().split("\n") if result.stdout.strip() else []
        version = tags[0] if tags and tags[0] != "" else None

        return {
            "remote_url": remote_url,
            "commit_sha": commit_sha,
            "short_sha": short_sha,
            "version": version,
        }

    except subprocess.CalledProcessError as e:
        return {"error": f"Git command failed: {e.stderr.strip()}"}
    except Exception as e:
        return {"error": f"An error occurred: {str(e)}"}


def extract_models_from_workflow(workflow):
    """Extract model filenames from a workflow JSON file."""
    # with open(workflow_path, 'r') as f:
    #     workflow = json.load(f)

    models = []

    # Look for model loaders and their inputs
    for node_id, node in workflow.items():
        if "class_type" in node:
            # Check for checkpoint loaders
            if (
                "CheckpointLoader" in node["class_type"]
                and "inputs" in node
                and "ckpt_name" in node["inputs"]
            ):
                models.append(node["inputs"]["ckpt_name"])

            # Check for CLIP loaders
            elif (
                node["class_type"] == "CLIPLoader"
                and "inputs" in node
                and "clip_name" in node["inputs"]
            ):
                models.append(node["inputs"]["clip_name"])

            # Check for VAE loaders
            elif (
                "VAELoader" in node["class_type"]
                and "inputs" in node
                and "vae_name" in node["inputs"]
            ):
                models.append(node["inputs"]["vae_name"])

            # Check for LoRA loaders
            elif (
                "LoraLoader" in node["class_type"]
                and "inputs" in node
                and "lora_name" in node["inputs"]
            ):
                models.append(node["inputs"]["lora_name"])

            # Add more model types as needed

    return models


def find_model_file(model_name, search_dirs):
    """Find a model file in the given directories."""
    # Handle Windows-style paths in the JSON
    model_name = model_name.replace("\\", "/")

    # First, try direct path if it seems to be a relative path
    for search_dir in search_dirs:
        direct_path = os.path.join(search_dir, model_name)
        if os.path.exists(direct_path):
            return direct_path

    # If not found, try to find by filename in any subdirectory
    filename = os.path.basename(model_name)
    for search_dir in search_dirs:
        for root, dirs, files in os.walk(search_dir):
            if filename in files:
                return os.path.join(root, filename)

    # If still not found, try case-insensitive search
    lower_filename = filename.lower()
    for search_dir in search_dirs:
        for root, dirs, files in os.walk(search_dir):
            for file in files:
                if file.lower() == lower_filename:
                    return os.path.join(root, file)

    return None


def contains_model_file(value):
    """Recursively check if a value contains a model file."""
    if isinstance(value, str) and value.lower().endswith(MODEL_EXTENSIONS):
        return [value]
    elif isinstance(value, list):
        return [item for sublist in value for item in contains_model_file(sublist)]
    elif isinstance(value, dict):
        return [
            item
            for item in value.values()
            if isinstance(item, str) and item.lower().endswith(MODEL_EXTENSIONS)
        ]
    return []


def find_model_filenames(workflow):
    """Extract all model filenames from workflow inputs."""
    model_names = []
    for node in workflow.values():
        if "inputs" in node:
            model_names.extend(contains_model_file(node["inputs"]))
    return model_names


def find_model_filepath(model_name):
    """Find a model file in the given directories."""
    model_name = model_name.replace("\\", "/")  # Normalize Windows-style paths
    filename = os.path.basename(model_name)
    lower_filename = filename.lower()

    for search_dir in SEARCH_DIRS:
        direct_path = os.path.join(search_dir, model_name)
        if os.path.exists(direct_path):
            return direct_path

        for root, _, files in os.walk(search_dir):
            file_map = {file.lower(): file for file in files}
            if filename in files:
                return os.path.join(root, filename)
            elif lower_filename in file_map:
                return os.path.join(root, file_map[lower_filename])

    return None


def split_file_into_chunks(file_path, chunk_size):
    chunks = []

    with open(file_path, "rb") as file:
        while True:
            chunk = file.read(chunk_size)
            if not chunk:
                break
            chunks.append(chunk)

    return chunks


def upload_chunk(url, chunk_data, content_type, fields):
    try:
        headers = {"Content-Type": content_type}
        response = requests.put(url, data=chunk_data, headers=headers)

        if not response.ok:
            raise Exception(
                f"Network response was not ok. Status code: {response.status_code}"
            )

        return response.headers.get("ETag")

    except Exception as error:
        print("Error", error)
        raise


def upload_to_s3(file_path, file_type, chunk_size, urls, fields):
    etags = []

    chunks = split_file_into_chunks(file_path, chunk_size)
    for i, chunk in enumerate(chunks):
        try:
            etag = upload_chunk(urls[i], chunk, file_type, fields)
            etags.append(etag)
            print(f"Chunk {i + 1} of {len(chunks)} uploaded successfully")
        except Exception as error:
            print(f"Error uploading chunk {i + 1}:", error)
            break

    return etags


def complete_multipart_upload(
    headers: dict, key: str, upload_id: str, etags: List[str]
):

    payload = {
        "key": key,
        "upload_id": upload_id,
        "etags": etags,
    }

    url = "https://sdibavx1oh.execute-api.eu-central-1.amazonaws.com/staging/complete-upload"
    try:
        response = requests.request("POST", url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        raise Exception(f"Failed to complete multipart upload: {str(e)}")
    except KeyError:
        raise Exception("Invalid response format received from server")



def get_file_hash(path, algo="sha256", chunk_size=8192):
    h = hashlib.new(algo)
    with open(path, "rb") as f:
        while chunk := f.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()


# def get_node_info():
#     try:
#         response = requests.get("http://127.0.0.1:8188/object_info")
#         return response.json()
#     except requests.RequestException as e:
#         print(f"Error accessing ComfyUI API: {e}")
#         return None


@PromptServer.instance.routes.post("/deploy/generate_requirements")
async def generate_requirements(request):
    print("Generating Requirements")

    data = await request.json()
    workflow = data["workflow"]
    node_info = data["object_info"]
    custom_nodes = {}

    for node, node_metadata in node_info.items():
        if (
            "python_module" in node_metadata
            and "custom_nodes" in node_metadata["python_module"]
        ):
            repo_name = node_metadata["python_module"].split("custom_nodes.")[1]
            custom_nodes[node] = {
                "repo_name": repo_name,
                # "custom_node_path": str(Path("./custom_nodes/", repo_name)),
                "display_name": node_metadata["display_name"],
            }

    workflow_nodes = set()
    for node in workflow.values():
        if isinstance(node, dict) and "class_type" in node:
            workflow_nodes.add(node["class_type"])

    required_custom_nodes = [
        node_metadata["repo_name"]
        for node, node_metadata in custom_nodes.items()
        if node in workflow_nodes
    ]

    required_custom_nodes_with_git_info = {}
    for custom_node in set(required_custom_nodes):
        custom_node_path = str(Path("./custom_nodes/", custom_node))
        git_info = get_git_version_info(custom_node_path)
        required_custom_nodes_with_git_info[custom_node] = {
            "custom_node_path": custom_node_path,
            "git_info": git_info,
        }

    model_info = []

    model_names = find_model_filenames(workflow)
    for model_name in model_names:
        local_path = find_model_filepath(model_name)
        relative_path = os.path.relpath(local_path, base_dir)
        model_hash = get_file_hash(local_path)
        file_name = os.path.basename(local_path)
        file_size = os.path.getsize(local_path)
        content_type, encoding = mimetypes.guess_type(local_path)
        if not content_type:
            content_type = "application/octet-stream"
        model_info.append(
            {
                "name": model_name,
                "file_name": file_name,
                "file_size": file_size,
                "model_hash": model_hash,
                "content_type": content_type,
                "relative_path": relative_path,
            }
        )

    package_object = {
        "custom_nodes": required_custom_nodes_with_git_info,
        "models": model_info,
    }

    deployment_requirements = {
        "workflow_name": data["product_name"],
        "package": package_object,
        "workflow": workflow,
    }

    headers = {
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "x-api-key": data["secret_key"],
        "x-user-id": data["user_id"],
        "Content-Type": "application/json",
    }

    url = "https://sdibavx1oh.execute-api.eu-central-1.amazonaws.com/staging/package"
    try:
        response = requests.request(
            "POST", url, json=deployment_requirements, headers=headers
        )

        # Parse response JSON
        response_data = response.json()
        # Handle different status codes
        if response.status_code != 200:
            # Return error message from API to frontend
            return web.json_response(
                {
                    "status": "error",
                    "status_code": response.status_code,
                    "message": response_data.get("message", "Unknown error occurred"),
                },
                status=response.status_code,
            )

        presigned_urls = response_data

        if presigned_urls["files"]:
            for presigned_url in presigned_urls["files"]:
                etags = upload_to_s3(
                    presigned_url["file_path"],
                    presigned_url["content_type"],
                    presigned_url["presigned_url"]["chunk_size"],
                    presigned_url["presigned_url"]["urls"],
                    presigned_url["presigned_url"]["fields"],
                )

                location = complete_multipart_upload(
                    headers,
                    presigned_url["presigned_url"]["key"],
                    presigned_url["presigned_url"]["upload_id"],
                    etags,
                )

        print("Package Saved")
        return web.json_response(
            {
                "status": "success",
                "package_object": package_object,
                "message": response_data.get("message", "Deployment successful"),
            }
        )

    except requests.RequestException as e:
        print(f"Request error: {e}")
        return web.json_response(
            {
                "status": "error",
                "status_code": 500,
                "message": f"Failed to connect to deployment service: {str(e)}",
            },
            status=500,
        )
    except Exception as e:
        print(f"Unexpected error: {e}")
        return web.json_response(
            {
                "status": "error",
                "status_code": 500,
                "message": f"An unexpected error occurred: {str(e)}",
            },
            status=500,
        )
