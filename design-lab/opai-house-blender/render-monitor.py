"""Read-only loopback dashboard for the existing V23 render."""
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import json,time
ROOT=Path(__file__).resolve().parent/'motion-v23'
HTML='''<!doctype html><meta charset="utf-8"><title>Blender 渲染进度 · V23</title>
<style>body{background:#242424;color:#eee;font:18px system-ui;margin:32px}h1{font-size:25px}progress{width:100%;height:22px}img{display:block;max-height:70vh;max-width:100%;margin:20px auto}small{color:#aaa}</style>
<h1>Blender · V23 渲染进度</h1><p id="info">正在读取…</p><progress id="bar" max="1152"></progress><img id="preview"><small>1080p · 60fps · Metal GPU｜每 5 秒自动更新。显示最近完成帧，不是实时采样窗口。</small>
<script>let last=0;async function update(){try{const s=await(await fetch('/status')).json();document.getElementById('info').textContent=`${s.done} / 1152 帧 · ${(s.done/1152*100).toFixed(1)}% · ${s.finished?'视频已生成':s.age<60?'渲染中':'暂未出新帧'}`;document.getElementById('bar').value=s.done;if(s.latest!==last){document.getElementById('preview').src='/frame?n='+s.latest;last=s.latest}}catch(e){document.getElementById('info').textContent='连接中断'} }update();setInterval(update,5000)</script>'''
def completed():
    return sorted(p for p in (ROOT/'frames').glob('frame-*.png') if p.stat().st_size>1000 and time.time()-p.stat().st_mtime>2)
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path=='/':data=HTML.encode();mime='text/html; charset=utf-8'
        elif self.path=='/status':
            files=completed();last=files[-1] if files else None
            data=json.dumps(dict(done=len(files),latest=int(last.stem.split('-')[1]) if last else 0,age=time.time()-last.stat().st_mtime if last else 999,finished=(ROOT/'opai-house-v23-1080p60.mp4').exists())).encode();mime='application/json'
        elif self.path.startswith('/frame?n='):
            try:n=int(self.path.split('=')[1]);data=(ROOT/'frames'/f'frame-{n:04d}.png').read_bytes();mime='image/png'
            except (ValueError,FileNotFoundError):self.send_error(404);return
        else:self.send_error(404);return
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
    def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',8201),Handler).serve_forever()
