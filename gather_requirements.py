r"""Scan every .py file in a docs folder (recursively), collect the third-party
imports, and write them to a requirements.txt file.

HOW TO USE: open this file in VS Code and press the Run button (▶) or F5.
Put it in your project folder (next to docs) or inside the docs folder.
Change the SETTINGS below if you need to.

What it does:
- Reads imports with the ast module (doesn't run any of your code)
- Skips the Python standard library (os, sys, json, ...)
- Skips your own local modules (any .py file or folder inside docs, e.g. _ext\circuit)
- Also picks up Sphinx extensions and the theme named as strings in conf.py
- Converts import names to pip names (e.g. PIL -> Pillow, yaml -> PyYAML)
- Adds the installed version (==x.y.z) where it can find one
"""
import ast
import sys
import warnings
from importlib import metadata
from pathlib import Path

# ---------------- SETTINGS ----------------
# Folder to scan. None = find it automatically:
#   - a "docs" folder next to this script, or
#   - the folder this script is in (if the script is inside docs)
# Or give a full path,
DOCS_FOLDER = r"C:\Users\gmccarthy\Documents\PC_RTD_GITHUB_resources\ClassRoomPlugins\docs"

# Where to save. None = requirements.txt in the same folder as this script
OUTPUT_FILE = None

# Add ==version for packages installed in this Python
PIN_VERSIONS = False
# ------------------------------------------

SKIP_DIRS = {"_build", ".venv", "venv", "env", "__pycache__", ".git", "node_modules"}

# Import name -> pip package name, for packages where they differ
KNOWN_NAMES = {
    "PIL": "Pillow",
    "yaml": "PyYAML",
    "bs4": "beautifulsoup4",
    "cv2": "opencv-python",
    "sklearn": "scikit-learn",
    "docx": "python-docx",
    "pptx": "python-pptx",
    "dateutil": "python-dateutil",
    "dotenv": "python-dotenv",
    "serial": "pyserial",
    "win32com": "pywin32",
    "win32api": "pywin32",
    "sphinx_rtd_theme": "sphinx-rtd-theme",
    "sphinx_copybutton": "sphinx-copybutton",
    "sphinx_design": "sphinx-design",
    "sphinx_togglebutton": "sphinx-togglebutton",
    "sphinx_tabs": "sphinx-tabs",
    "sphinx_book_theme": "sphinx-book-theme",
    "sphinxcontrib": None,  # namespace: handled by the full dotted name below
    "myst_parser": "myst-parser",
}

# Built-in Sphinx extensions (sphinx.ext.*) come with Sphinx itself
BUILTIN_THEMES = {"alabaster", "classic", "sphinxdoc", "scrolls", "agogo",
                  "traditional", "nature", "haiku", "pyramid", "bizstyle",
                  "epub", "basic", "default"}


def py_files(root):
    for path in root.rglob("*.py"):
        if not any(part in SKIP_DIRS for part in path.parts):
            yield path


def local_names(root):
    """Names of your own modules/packages anywhere under docs."""
    names = set()
    for path in root.rglob("*"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.is_dir():
            names.add(path.name)
        elif path.suffix == ".py":
            names.add(path.stem)
    return names


def imports_in(path):
    """Top-level module names imported by one file."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")   # e.g. "\W" escape warnings in your files
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), str(path))
    except SyntaxError as err:
        print(f"  ! Skipped {path} (syntax error line {err.lineno})")
        return set(), set()

    found, dotted = set(), set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                found.add(alias.name.split(".")[0])
                dotted.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module:   # skip relative imports
                found.add(node.module.split(".")[0])
                dotted.add(node.module)
    return found, dotted


def conf_strings(path):
    """Extensions and theme listed as strings in conf.py."""
    names = set()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"), str(path))
    except SyntaxError:
        return names
    for node in ast.walk(tree):
        if isinstance(node, (ast.Assign, ast.AugAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            ids = {t.id for t in targets if isinstance(t, ast.Name)}
            value = node.value
            if "extensions" in ids and isinstance(value, (ast.List, ast.Tuple)):
                names |= {e.value for e in value.elts
                          if isinstance(e, ast.Constant) and isinstance(e.value, str)}
            if "html_theme" in ids and isinstance(value, ast.Constant):
                if value.value not in BUILTIN_THEMES:
                    names.add(value.value)
    return names


def pip_name(module, dist_map):
    if module in KNOWN_NAMES and KNOWN_NAMES[module]:
        return KNOWN_NAMES[module]
    dists = dist_map.get(module)
    if dists:
        return dists[0]
    return module.replace("_", "-")


def version_of(package):
    try:
        return metadata.version(package)
    except metadata.PackageNotFoundError:
        return None


def find_docs_folder():
    if DOCS_FOLDER:
        return Path(DOCS_FOLDER).resolve()
    here = Path(__file__).resolve().parent
    # Script inside docs (or a subfolder of docs): use that docs folder
    for folder in [here, *here.parents]:
        if folder.name.lower() == "docs":
            return folder
    # Otherwise look for a docs folder here, then in each parent folder
    for folder in [here, *here.parents]:
        if (folder / "docs").is_dir():
            return folder / "docs"
    return here


def main():
    root = find_docs_folder()
    if not root.is_dir():
        print(f"Folder not found: {root}\nSet DOCS_FOLDER at the top of this file.")
        return
    script_folder = Path(__file__).resolve().parent
    out = Path(OUTPUT_FILE).resolve() if OUTPUT_FILE else script_folder / "requirements.txt"

    stdlib = set(sys.stdlib_module_names) | {"__future__"}
    local = local_names(root)
    dist_map = metadata.packages_distributions()

    modules, dotted_all, seen_in = set(), set(), {}
    files = list(py_files(root))
    for path in files:
        found, dotted = imports_in(path)
        if path.name == "conf.py":
            extra = conf_strings(path)
            dotted |= extra
            found |= {e.split(".")[0] for e in extra}
        modules |= found
        dotted_all |= dotted
        for m in found:
            seen_in.setdefault(m, path.relative_to(root))

    third_party = sorted(m for m in modules if m not in stdlib and m not in local)

    packages = {}
    for module in third_party:
        if module == "sphinxcontrib":
            # sphinxcontrib.foo -> sphinxcontrib-foo
            for d in dotted_all:
                if d.startswith("sphinxcontrib."):
                    sub = d.split(".")[1]
                    packages.setdefault(f"sphinxcontrib-{sub}", module)
            continue
        packages.setdefault(pip_name(module, dist_map), module)

    lines = []
    for package in sorted(packages, key=str.lower):
        ver = version_of(package) if PIN_VERSIONS else None
        lines.append(f"{package}=={ver}" if ver else package)

    out.write_text("\n".join(lines) + "\n", encoding="utf-8")

    folders = sorted({str(p.parent.relative_to(root)) for p in files})
    print(f"Scanned {len(files)} .py files in {root} (and all subfolders)")
    print(f"Folders with .py files: {len(folders)}")
    for f in folders:
        print(f"   {'(top)' if f == '.' else f}")
    print()
    print(f"Found {len(lines)} packages -> {out.resolve()}\n")
    for line, module in zip(lines, (packages[p] for p in sorted(packages, key=str.lower))):
        print(f"  {line:<35} (first seen in {seen_in.get(module, 'conf.py')})")
    missing = [l for l in lines if "==" not in l]
    if missing and PIN_VERSIONS:
        print("\nNot installed here (check the pip name is right):")
        for m in missing:
            print("  ", m)
    print(f"\nTo install them:\n  python -m pip install -r \"{out}\"")


if __name__ == "__main__":
    main()
