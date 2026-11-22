from pathlib import Path

def fix_text_files_robust(folder_path):
    folder = Path(folder_path)

    for file_path in folder.glob("*.txt"):
        print(f"Processing: {file_path.name}")
        try:
            # 'latin-1' is a 1-to-1 mapping that never raises a UnicodeDecodeError
            # This will read every single byte successfully
            raw_content = file_path.read_text(encoding='latin-1')

            # Now we have a string, write it out as standard UTF-8
            # This strips any weird BOMs encountered in the latin-1 read
            file_path.write_text(raw_content, encoding='utf-8')
            print(f"Successfully sanitized: {file_path.name}")
        except Exception as e:
            print(f"Failed to process {file_path.name}: {e}")

if __name__ == "__main__":
    target_folder = r"C:\Users\gmccarthy\Documents\SCIENCE DIAGRAMS f\Data\DiagramData"
    fix_text_files_robust(target_folder)
