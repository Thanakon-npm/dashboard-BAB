import http.server
import socketserver
import os

PORT = int(os.environ.get('PORT', 8000))
DIRECTORY = os.path.dirname(__file__)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving dashboard at http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    httpd.serve_forever()
