"""
check_extensions.py

Scans docs/_ext for Sphinx extensions and prints the text to paste into
docs/conf.py.

An extension is any .py file in docs/_ext that has a top-level setup() function:

    _ext/christmas/christmas.py   ->  "christmas.christmas"
    _ext/labels.py                ->  "labels"
    _ext/foo/__init__.py          ->  "foo"

Extensions already listed in conf.py that are NOT in _ext (sphinx.ext.*,
sphinx_copybutton, sphinx_design, ...) are kept, and checked to see whether
they are installed.

Usage (from anywhere):
    python check_extensions.py                 # finds the nearest docs/_ext above this script
    python check_extensions.py path/to/docs    # or name the docs folder
"""

import ast
import importlib.util
import sys
from pathlib import Path

SKIP_DIRS = {"__pycache__", "_static", "_templates", "static", "templates"}


def has_setup(py_file):
    """True if the file defines a top-level function called setup."""
    try:
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
    except (SyntaxError, UnicodeDecodeError) as err:
        print(f"  ! Could not read {py_file.name}: {err}")
        return False
    return any(
        isinstance(node, ast.FunctionDef) and node.name == "setup" for node in tree.body
    )


def find_local_extensions(ext_dir):
    """Return (extension names, skipped files) found in _ext.

    Files whose names are not valid Python module names (e.g. "__init__-1.py",
    "crossword - Copy.py", "cloze (1).py") can't be imported by Sphinx, so they
    are skipped and reported instead.
    """
    found, skipped = [], []

    def check(py, name):
        if not all(part.isidentifier() for part in name.split(".")):
            skipped.append(py)
        elif has_setup(py):
            found.append(name)

    for item in sorted(ext_dir.iterdir()):
        if item.name.startswith(".") or item.name in SKIP_DIRS:
            continue
        if item.is_file() and item.suffix == ".py" and item.stem != "__init__":
            check(item, item.stem)
        elif item.is_dir():
            init = item / "__init__.py"
            if init.exists() and item.name.isidentifier() and has_setup(init):
                found.append(item.name)
            for py in sorted(item.glob("*.py")):
                if py.stem != "__init__":
                    check(py, f"{item.name}.{py.stem}")
    return found, skipped


def read_conf_extensions(conf_file):
    """Return the extensions list from conf.py, or [] if it can't be found."""
    if not conf_file.exists():
        return []
    tree = ast.parse(conf_file.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "extensions":
                    try:
                        return list(ast.literal_eval(node.value))
                    except ValueError:
                        return []
    return []


def is_installed(name):
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def main():
    if len(sys.argv) > 1:
        docs = Path(sys.argv[1]).resolve()
    else:
        # Walk up from the script's folder until we find a docs folder with _ext in it,
        # so this works from ignore/ or ignore/py_tools/ (or any depth).
        script_dir = Path(__file__).resolve().parent
        docs = next(
            (p / "docs" for p in [script_dir, *script_dir.parents] if (p / "docs" / "_ext").is_dir()),
            None,
        )
        if docs is None:
            sys.exit("Cannot find a docs/_ext folder above this script. "
                     "Give the docs folder: python check_extensions.py path/to/docs")
    ext_dir = docs / "_ext"
    conf_file = docs / "conf.py"

    if not ext_dir.is_dir():
        sys.exit(f"Cannot find the _ext folder: {ext_dir}")

    print(f"Docs folder: {docs}\n")

    local, skipped = find_local_extensions(ext_dir)
    local_tops = {p.name if p.is_dir() else p.stem for p in ext_dir.iterdir()}
    in_conf = read_conf_extensions(conf_file)

    # Anything in conf.py whose top-level name is not in _ext is a package/Sphinx extension.
    external = [e for e in in_conf if e.split(".")[0] not in local_tops]
    stale = [e for e in in_conf if e.split(".")[0] in local_tops and e not in local]

    print("Local extensions in _ext:")
    for name in local:
        note = "" if name in in_conf else "   <- NEW (not in conf.py yet)"
        print(f"  {name}{note}")
    if not local:
        print("  (none found)")

    if external:
        print("\nOther extensions from conf.py:")
        for name in external:
            status = "installed" if is_installed(name) else "NOT INSTALLED (pip install it)"
            print(f"  {name}  - {status}")

    if skipped:
        print("\nSkipped - file name can't be imported (stray copies? delete or rename):")
        for py in skipped:
            print(f"  {py.relative_to(ext_dir)}")

    if stale:
        print("\nIn conf.py but not found in _ext (left out below):")
        for name in stale:
            print(f"  {name}")

    # ---- Text for conf.py ----
    lines = [
        "import os",
        "import sys",
        "",
        "# Ensure custom extension path is available",
        'sys.path.append(os.path.abspath("./_ext"))',
        "",
        "extensions = [",
    ]
    lines += [f'    "{name}",' for name in external]
    if local:
        lines.append("    # custom directives in _ext")
        lines += [f'    "{name}",' for name in local]
    lines.append("]")

    print("\n" + "=" * 60)
    print("Paste this into conf.py (replacing the old extensions list):")
    print("=" * 60 + "\n")
    print("\n".join(lines))
    print()


if __name__ == "__main__":
    main()
