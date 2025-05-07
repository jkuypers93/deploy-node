import os
import requests
import mimetypes
from pathlib import Path
import subprocess
from server import PromptServer
from aiohttp import web
import hashlib
from typing import List
import datetime


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
        print("Direct path:", direct_path)
        if os.path.exists(direct_path):
            return direct_path

        for root, _, files in os.walk(search_dir):
            file_map = {file.lower(): file for file in files}
            if filename in files:
                print("Found filename in files:", filename)
                return os.path.join(root, filename)
            elif lower_filename in file_map:
                print("Found lower filename in file_map:", lower_filename)
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


def get_comfyui_version():
    result = subprocess.run(
        ["git", "tag", "--points-at", "HEAD"],
        cwd=base_dir,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


@PromptServer.instance.routes.post("/deploy/get_initial_models")
async def get_initial_models(request):
    try:
        data = await request.json()
        workflow = data.get("workflow")
        if not workflow:
            return web.json_response(
                {"status": "error", "message": "Workflow data not provided"}, status=400
            )

        model_names = find_model_filenames(workflow)
        model_paths = []
        for model_name in model_names:
            print(model_name)
            model_path = find_model_filepath(model_name)
            if model_path and os.path.isfile(model_path):
                model_paths.append(model_path)
        return web.json_response({"status": "success", "models": model_paths})
    except Exception as e:
        print(f"Error in /deploy/get_initial_models: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)


def search_for_folder_in_search_dirs(folder_name):
    """Search for a folder within SEARCH_DIRS and return its absolute path if found."""
    for search_dir in SEARCH_DIRS:
        potential_path = os.path.join(search_dir, folder_name)
        if os.path.isdir(potential_path):
            return os.path.abspath(potential_path)
    return None


def find_all_model_files_in_folder(abs_folder_path):
    """Return a list of absolute paths for all model files within a given folder (recursive)."""
    model_files = []
    if not os.path.isdir(abs_folder_path):
        return model_files
    for root, _, files in os.walk(abs_folder_path):
        for file in files:
            if file.lower().endswith(MODEL_EXTENSIONS):
                model_files.append(os.path.abspath(os.path.join(root, file)))
    return model_files


@PromptServer.instance.routes.post("/deploy/validate_and_get_model_paths")
async def validate_and_get_model_paths(request):
    try:
        data = await request.json()
        print("Received data:", data)
        input_path = data.get("path")
        if not input_path:
            return web.json_response(
                {"status": "error", "message": "Path not provided"}, status=400
            )

        found_model_paths = []

        # 1. Try to find it as a direct model file path using existing logic
        model_file_direct = find_model_filepath(input_path)
        if model_file_direct and os.path.isfile(model_file_direct):
            found_model_paths.append(os.path.abspath(model_file_direct))
            print(f"Found as direct model file: {model_file_direct}")
        else:
            # 2. If not a direct file, try to find it as a folder name in SEARCH_DIRS
            print(
                f"'{input_path}' not found as a direct model file. Trying as folder name."
            )
            folder_abs_path = search_for_folder_in_search_dirs(input_path)
            if folder_abs_path:
                print(
                    f"Found folder '{input_path}' at '{folder_abs_path}'. Scanning for model files."
                )
                model_files_in_folder = find_all_model_files_in_folder(folder_abs_path)
                if model_files_in_folder:
                    found_model_paths.extend(model_files_in_folder)
                    print(f"Found models in folder: {model_files_in_folder}")
                else:
                    print(f"No model files found in folder: {folder_abs_path}")
            else:
                # 3. If input_path is an absolute or relative path to a directory
                normalized_input_path = os.path.abspath(
                    os.path.join(base_dir, input_path)
                    if not os.path.isabs(input_path)
                    else input_path
                )
                if os.path.isdir(normalized_input_path):
                    print(
                        f"Input path '{normalized_input_path}' is a directory. Scanning for model files."
                    )
                    model_files_in_folder = find_all_model_files_in_folder(
                        normalized_input_path
                    )
                    if model_files_in_folder:
                        found_model_paths.extend(model_files_in_folder)
                        print(f"Found models in directory: {model_files_in_folder}")
                    else:
                        print(
                            f"No model files found in directory: {normalized_input_path}"
                        )
                else:
                    print(
                        f"Could not resolve '{input_path}' as a model file, a known folder, or a direct directory path."
                    )

        if found_model_paths:
            # Remove duplicates that might arise if a direct file is also in a specified folder
            unique_paths = sorted(list(set(found_model_paths)))
            print(f"Returning found model paths: {unique_paths}")
            return web.json_response({"status": "success", "model_paths": unique_paths})
        else:
            print(f"Model path or folder not found for input: {input_path}")
            message = f"Could not find model file or folder: '{input_path}'. Searched in standard model directories and as a direct path."
            if (
                not any(input_path.lower().endswith(ext) for ext in MODEL_EXTENSIONS)
                and not os.path.sep in input_path
            ):
                message += f" If '{input_path}' is a folder, ensure it exists within {SEARCH_DIRS} or provide a full path."
            return web.json_response(
                {"status": "error", "message": message}, status=404
            )

    except Exception as e:
        print(f"Error in /deploy/validate_and_get_model_paths: {e}")


@PromptServer.instance.routes.post("/deploy/generate_requirements")
async def generate_requirements(request):
    print("Generating Requirements")

    data = await request.json()
    workflow = data["workflow"]
    node_info = data["object_info"]
    # Get additional model paths provided by the user - this is now the definitive list of ABSOLUTE model file paths
    additional_model_paths = data.get("additional_model_paths", [])
    # Get the original model names as detected from the workflow by the frontend, if provided
    workflow_original_model_names = data.get("workflow_original_model_names", [])

    custom_nodes = {}
    comfyui_version = get_comfyui_version()
    print(f"ComfyUI Version: {comfyui_version}")
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

    # The additional_model_paths from the request is now the source of truth for model files.
    # These paths should already be validated and resolved to absolute file paths by the frontend
    # calling /deploy/validate_and_get_model_paths.
    # We will perform a final validation here.

    print(f"Processing provided model paths: {additional_model_paths}")
    if workflow_original_model_names:
        print(
            f"Using workflow original model names for display name matching: {workflow_original_model_names}"
        )

    unique_model_files = sorted(
        list(set(additional_model_paths))
    )  # Ensure uniqueness and consistent order

    for local_path in unique_model_files:
        try:
            # Path should be absolute, but ensure it and normalize
            abs_local_path = os.path.abspath(os.path.normpath(local_path))

            if not os.path.exists(abs_local_path):
                print(
                    f"Warning: Provided model path {abs_local_path} does not exist. Skipping."
                )
                continue
            if not os.path.isfile(abs_local_path):
                print(
                    f"Warning: Provided model path {abs_local_path} is not a file. Skipping."
                )
                continue
            if not abs_local_path.lower().endswith(MODEL_EXTENSIONS):
                print(
                    f"Warning: Provided model path {abs_local_path} does not have a recognized model extension. Skipping."
                )
                continue

            relative_path = os.path.relpath(abs_local_path, base_dir)
            model_hash = get_file_hash(abs_local_path)
            file_name = os.path.basename(abs_local_path)
            file_size = os.path.getsize(abs_local_path)
            content_type, encoding = mimetypes.guess_type(abs_local_path)
            if not content_type:
                content_type = "application/octet-stream"

            original_model_name = file_name  # Default to filename
            if workflow_original_model_names:
                for w_name in workflow_original_model_names:
                    # Heuristic: if basename matches, and resolving w_name (if it's a relative path from workflow) points to the same file
                    if os.path.basename(w_name) == file_name:
                        # find_model_filepath can resolve names like 'model.safetensors' or 'folder/model.safetensors'
                        resolved_w_name_path = find_model_filepath(w_name)
                        if (
                            resolved_w_name_path
                            and os.path.normpath(resolved_w_name_path) == abs_local_path
                        ):
                            original_model_name = w_name
                            print(
                                f"Matched {abs_local_path} to original workflow name: {w_name}"
                            )
                            break

            model_info.append(
                {
                    "name": original_model_name,
                    "file_name": file_name,
                    "file_size": file_size,
                    "model_hash": model_hash,
                    "content_type": content_type,
                    "relative_path": relative_path,
                }
            )
        except Exception as e:
            print(f"Error processing model file {local_path}: {e}")

    package_object = {
        "comfyui_version": comfyui_version,
        "custom_nodes": required_custom_nodes_with_git_info,
        "models": model_info,
    }

    current_time = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    version = data["version"] if "version" in data else "v1"
    deployment_requirements = {
        "workflow_name": data["product_name"],
        "package": package_object,
        "workflow": workflow,
        "version": version,
        "current_time": current_time,
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
        build_requirements = {
            "workflow_name": data["product_name"],
            "version": version,
            "current_time": current_time,
            "product_id": response_data["product_id"],
        }

        url = "https://sdibavx1oh.execute-api.eu-central-1.amazonaws.com/staging/trigger-package-build"
        build_response = requests.request(
            "POST", url, json=build_requirements, headers=headers
        )
        build_response_data = build_response.json()
        print(f"Build Response: {build_response_data}")

        return web.json_response(
            {
                "status": "success",
                "package_object": package_object,
                "message": response_data.get("message", "Deployment successful"),
            }
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
