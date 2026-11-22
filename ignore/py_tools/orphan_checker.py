"""

This script checks for orphaned .rst files in a nested folder structure.

"""


from pathlib import Path


# Set your documentation directory
docs_root = Path(r'C:\Users\gmccarthy\Documents\PC_RTD_GITHUB_resources\RTD_TESTING\docs')  # Update this to your doc folder name
index_file = docs_root / 'index.rst'

# --- Config ---
docs_root = Path('./docs')  # change if needed
index_file = docs_root / 'index.rst'


def extract_toctree_entries(text):
    """
    Extract file references from a toctree in index.rst
    Handles:
    - simple entries: page
    - nested paths: folder/page
    - titled entries: Title <page>
    """
    entries = set()
    in_toctree = False

    for line in text.splitlines():
        stripped = line.strip()

        # Start of toctree
        if stripped.startswith(".. toctree::"):
            in_toctree = True
            continue

        if in_toctree:
            # Skip options and blank lines
            if stripped.startswith(":") or stripped == "":
                continue

            # End of toctree block (no longer indented)
            if not line.startswith(" "):
                in_toctree = False
                continue

            # Handle "Title <path>"
            if "<" in stripped and ">" in stripped:
                path = stripped.split("<")[-1].split(">")[0].strip()
            else:
                path = stripped

            # entries.add(Path(path))
            entries.add(Path(path).with_suffix(''))
    return entries


def check_for_orphans():
    if not index_file.exists():
        print(f"Could not find index file at {index_file}")
        return

    # --- All .rst files (excluding index) ---
    all_rst_files = {
        p.relative_to(docs_root).with_suffix('')
        for p in docs_root.rglob('*.rst')
        if p != index_file
    }

    # --- Extract references from index.rst ---
    content = index_file.read_text(encoding='utf-8')
    referenced_files = extract_toctree_entries(content)

    # --- Compare ---
    orphans = sorted(all_rst_files - referenced_files)

    # --- Output ---
    print(f"\n Total .rst files (excluding index): {len(all_rst_files)}")
    print(f"Referenced in toctree: {len(referenced_files)}\n")

    if orphans:
        print(f"Found {len(orphans)} orphaned files:\n")
        for orphan in orphans:
            print(f"  - {orphan}.rst")
    else:
        print("No orphaned files found.")


if __name__ == "__main__":
    check_for_orphans()
