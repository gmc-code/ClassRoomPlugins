import http.server
import socketserver
import os
import webbrowser

# Change directory to the Sphinx HTML build folder
os.chdir(r"C:\Users\gmccarthy\Documents\PC_RTD_GITHUB_resources\ClassRoomPlugins\docs\_build\html")

PORT = 8000
URL = f"http://localhost:{PORT}/index.html"
Handler = http.server.SimpleHTTPRequestHandler

# Try to open Google Chrome specifically, fallback to default browser if not found
try:
    chrome_path = "C:/Program Files/Google/Chrome/Application/chrome.exe %s"
    webbrowser.get(chrome_path).open(URL)
except Exception:
    webbrowser.open(URL)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving documentation at {URL}")
    print("Press Ctrl+C to stop the server.")
    httpd.serve_forever()