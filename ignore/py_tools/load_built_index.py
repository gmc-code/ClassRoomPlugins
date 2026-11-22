r"""Serve the built Sphinx site on a local web server and open it in Chrome.

Run from anywhere:  python load_built_index.py
Optional:           python load_built_index.py path\to\build\html  [--port 8000]

A local server (rather than opening index.html as a file) makes the pages behave
as they do on Read the Docs: browser storage, JSON import and so on all work.
Press Ctrl+C to stop the server.
"""

import argparse
import functools
import http.server
import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent  # ClassRoomPlugins

# Usual places Sphinx puts the HTML build, checked in this order.
CANDIDATES = [
    "docs/build/html",
    "docs/_build/html",
    "build/html",
    "_build/html",
    "docs/build",
    "docs/_build",
]

CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
]


def find_build_dir(given=None):
    if given:
        path = Path(given).resolve()
        if (path / "index.html").is_file():
            return path
        sys.exit("No index.html in %s" % path)
    for rel in CANDIDATES:
        path = PROJECT / rel
        if (path / "index.html").is_file():
            return path
    # Last resort: any build folder with an index.html under the project.
    for index in PROJECT.rglob("index.html"):
        if "build" in index.parent.parts or "_build" in index.parent.parts:
            return index.parent
    sys.exit(
        "Could not find a built index.html under %s.\n"
        "Build the docs first (e.g. sphinx-build -b html docs docs/build/html) "
        "or pass the folder: python load_built_index.py path\\to\\html" % PROJECT
    )


def free_port(preferred):
    for port in [preferred] + list(range(preferred + 1, preferred + 50)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    sys.exit("No free port found near %d." % preferred)


def open_in_chrome(url):
    for exe in CHROME_PATHS:
        if os.path.isfile(exe):
            webbrowser.register("chrome", None, webbrowser.BackgroundBrowser(exe))
            webbrowser.get("chrome").open(url)
            return
    print("Chrome not found; opening in the default browser.")
    webbrowser.open(url)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        # Always serve the latest build, never a cached copy.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("build_dir", nargs="?", help="folder containing index.html")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true", help="start the server only")
    args = parser.parse_args()

    build_dir = find_build_dir(args.build_dir)
    port = free_port(args.port)
    handler = functools.partial(QuietHandler, directory=str(build_dir))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = "http://127.0.0.1:%d/index.html" % port

    print("Serving %s" % build_dir)
    print("Open %s  (Ctrl+C to stop)" % url)
    if not args.no_browser:
        threading.Timer(0.5, open_in_chrome, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()