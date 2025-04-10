import os
import subprocess


class GeneratePackageRequirements:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},  # No inputs needed
        }

    RETURN_TYPES = ()  # No outputs needed
    FUNCTION = "process"
    CATEGORY = "custom"

    def process(self):
        # Trigger the generate_requirements.py script
        try:
            script_path = os.path.join(
                os.path.dirname(os.path.realpath(__file__)), "generate_requirements.py"
            )
            subprocess.run(["python", script_path], check=True)
            print("generate_requirements.py executed successfully!")
        except Exception as e:
            print(f"Error executing generate_requirements.py: {e}")

        return ()  # Return an empty tuple

    @classmethod
    def IS_CHANGED(cls, *args, **kwargs):
        # Force the node to be re-executed when the button is pressed
        return float("nan")

    @classmethod
    def WEB_DIRECTORY(cls):
        # Point to the directory containing our web assets
        return os.path.join(os.path.dirname(os.path.realpath(__file__)), "web")




NODE_CLASS_MAPPINGS = {
    "GeneratePackageRequirements": GeneratePackageRequirements,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GeneratePackageRequirements": "Generate Package Requirements",
}
