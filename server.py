#!/usr/bin/env python3
import http.server
import socketserver
import os
import urllib.request
import json

PORT = 8000

def get_ngrok_url():
    try:
        response = urllib.request.urlopen('http://localhost:4040/api/tunnels', timeout=3)
        data = json.loads(response.read().decode())
        for tunnel in data['tunnels']:
            if tunnel['proto'] == 'https':
                return tunnel['public_url']
    except:
        return None
    return None

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.webmanifest': 'application/manifest+json; charset=utf-8',
        '.svg': 'image/svg+xml',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache')
        super().end_headers()

    def log_message(self, format, *args):
        pass

os.chdir(os.path.dirname(os.path.abspath(__file__)))
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"\n{'='*40}")
    print(f"   背单词服务已启动")
    print(f"{'='*40}")
    print(f"\n本地访问: http://localhost:{PORT}")
    print(f"\n获取公网地址...")
    ngrok_url = get_ngrok_url()
    if ngrok_url:
        print(f"\n🎉 手机访问: {ngrok_url}")
        print(f"   (复制到iPhone Safari打开)")
    else:
        print(f"\n如需外网访问，请运行: ngrok http {PORT}")
        print(f"然后将ngrok提供的地址发送到手机")
    print(f"\n按 Ctrl+C 停止服务\n")
    httpd.serve_forever()
