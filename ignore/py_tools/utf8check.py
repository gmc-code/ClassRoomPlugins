from pathlib import Path
import codecs

def check_file_encoding(file_path_str):
    path = Path(file_path_str)
    if not path.exists():
        print(f"File not found: {path.absolute()}")
        return

    # Read the first 4 bytes to check for BOMs
    raw_data = path.read_bytes()

    if raw_data.startswith(codecs.BOM_UTF16_LE) or raw_data.startswith(codecs.BOM_UTF16_BE):
        print(f"File '{path.name}' is UTF-16 (contains BOM).")
    elif raw_data.startswith(codecs.BOM_UTF8):
        print(f"File '{path.name}' is UTF-8 (contains BOM).")
    else:
        # Check if it can be decoded as UTF-8
        try:
            raw_data.decode('utf-8')
            print(f"File '{path.name}' is valid UTF-8 (no BOM detected).")
        except UnicodeDecodeError:
            print(f"File '{path.name}' is in an unknown or different encoding.")

# Replace with the path to your specific .txt file
check_file_encoding(r"C:\Users\gmccarthy\Documents\PC_RTD_GITHUB_resources\RTD_TESTING\docs\info\diagrams\Microscope.txt")