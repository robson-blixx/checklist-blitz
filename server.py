"""Servidor local para testar o Checklist Blitz.

Execute: python server.py
Depois abra http://localhost:8000
O futuro envio de WhatsApp pode ser integrado aqui; esta versão não envia mensagens.
"""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parent)
    print("Checklist Blitz: http://localhost:8000")
    ThreadingHTTPServer(("127.0.0.1", 8000), SimpleHTTPRequestHandler).serve_forever()
