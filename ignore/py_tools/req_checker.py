import importlib.metadata


def show_installed_requirements(requirements_file="requirements.txt"):
    # Read package names from requirements.txt
    with open(requirements_file) as f:
        required = []
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Remove inline comments after '#'
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            # Split off version specifier if present
            pkg = line.split("==")[0].strip()
            required.append(pkg)

    # Get all installed packages
    installed = {dist.metadata["Name"]: dist.version for dist in importlib.metadata.distributions()}
    # print(installed)
    # Print only those that are in requirements.txt
    for pkg in required:
        if pkg in installed:
            print(f"{pkg}=={installed[pkg]}")
        else:
            print(f"{pkg} (not installed)")


if __name__ == "__main__":
    req_file_path = r"C:\Users\gmccarthy\Documents\PC_RTD_GITHUB_resources\RTD_TESTING\docs\requirements.txt"
    show_installed_requirements(req_file_path)
