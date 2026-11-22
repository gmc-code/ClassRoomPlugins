"""
clean_pycache.py

Deletes Python cache files from a docs folder:
  * every __pycache__ folder (e.g. docs/_ext/foodweb/__pycache__)
  * any loose .pyc / .pyo files

These are made automatically by Python each time Sphinx builds, so deleting
them is safe - they are simply re-created on the next build.

Usage:
    python clean_pycache.py                  # cleans ../../docs (RTD_TESTING/docs)
    python clean_pycache.py path/to/docs     # or name the folder to clean
    python clean_pycache.py path/to/docs -y  # delete without asking
"""

import shutil
import sys
from pathlib import Path


def main():
    args = [a for a in sys.argv[1:] if a not in ("-y", "--yes")]
    no_prompt = len(args) != len(sys.argv[1:])

    script_dir = Path(__file__).resolve().parent
    # Script lives in <project>/ignore/py_tools, so the docs folder is two levels up.
    target = Path(args[0]).resolve() if args else script_dir.parents[1] / "docs"

    if not target.is_dir():
        sys.exit(f"Folder not found: {target}")

    print(f"Cleaning: {target}\n")

    cache_dirs = sorted(p for p in target.rglob("__pycache__") if p.is_dir())
    # Loose .pyc/.pyo files that are NOT inside a __pycache__ folder
    loose = sorted(
        p
        for ext in ("*.pyc", "*.pyo")
        for p in target.rglob(ext)
        if p.is_file() and "__pycache__" not in p.parts
    )

    if not cache_dirs and not loose:
        print("Nothing to delete - already clean.")
        return

    for d in cache_dirs:
        count = sum(1 for _ in d.rglob("*") if _.is_file())
        print(f"  [folder] {d.relative_to(target)}  ({count} files)")
    for f in loose:
        print(f"  [file]   {f.relative_to(target)}")

    print(f"\n{len(cache_dirs)} __pycache__ folder(s) and {len(loose)} loose file(s).")

    if not no_prompt:
        answer = input("Delete these? (y/n): ").strip().lower()
        if answer not in ("y", "yes"):
            print("Cancelled - nothing deleted.")
            return

    deleted, failed = 0, []
    for path in cache_dirs + loose:
        try:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
            deleted += 1
        except OSError as err:
            failed.append((path, err))

    print(f"\nDeleted {deleted} item(s).")
    if failed:
        print("Could not delete (is something still using them?):")
        for path, err in failed:
            print(f"  {path.relative_to(target)} - {err}")


if __name__ == "__main__":
    main()
