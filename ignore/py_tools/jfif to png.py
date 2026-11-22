from pathlib import Path
from PIL import Image

def convert_jfif_to_png_pathlib(folder_path_str: str):
    # Convert string to a Path object
    folder_path = Path(folder_path_str)

    # Check if directory exists
    if not folder_path.is_dir():
        print(f"Error: Folder does not exist at {folder_path}")
        return

    # Find all .jfif files (case-insensitive)
    jfif_files = [f for f in folder_path.iterdir() if f.suffix.lower() == ".jfif"]

    if not jfif_files:
        print("No .jfif files found in the folder.")
        return

    # Process each file
    for file_path in jfif_files:
        # Define output path with .png extension
        output_path = file_path.with_suffix(".png")

        try:
            with Image.open(file_path) as img:
                img.save(output_path, "PNG")
            print(f"Converted: {file_path.name} -> {output_path.name}")
        except Exception as e:
            print(f"Failed to convert {file_path.name}: {e}")

# Target directory
folder_to_process = r"C:\Users\gmccarthy\Documents\PC_RTD_GITHUB_resources\RTD_TESTING\docs\_static\images"

convert_jfif_to_png_pathlib(folder_to_process)