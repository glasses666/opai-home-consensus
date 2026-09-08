#!/usr/bin/env python3
"""Capture the actual model as a full 16.4 s MP4 and GIF.
Requires Playwright, Chromium, Pillow, and FFmpeg. Temporary images stay outside
this project. The reverse half reuses exact poses from the reversible animation.
"""
import base64,io,os,shutil,subprocess,tempfile
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
SIZE=640;FPS=20;HALF=164
html='<style>html,body{margin:0;width:100%;height:100%;background:transparent}canvas{position:fixed;inset:0;width:100%;height:100%}</style><canvas id="room"></canvas>'
for name in ['scene-data','renderer','viewer']:html+='<script>'+(ROOT/f'src/{name}.js').read_text()+'</script>'
html+='<script>window.captureViewer=new RoomletViewer(document.getElementById("room"),SCULPT_SCENE,{autoplay:false,pixelRatio:1});captureViewer.onReady=()=>window.CAPTURE_READY=true;</script>'
with tempfile.TemporaryDirectory(prefix='roomlet-frames-') as temp:
 temp=Path(temp)
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or shutil.which('chromium'),headless=not bool(os.environ.get('DISPLAY')),args=['--no-sandbox','--ignore-gpu-blocklist','--disable-dev-shm-usage'])
  page=b.new_page(viewport={'width':SIZE,'height':SIZE},device_scale_factor=1)
  page.set_content(html,wait_until='load',timeout=30000);page.wait_for_function('window.CAPTURE_READY',timeout=30000)
  for i in range(HALF+1):
   data=page.evaluate('(t)=>{captureViewer.seek(t);return captureViewer.canvas.toDataURL("image/png").split(",")[1];}',i/FPS)
   im=Image.open(io.BytesIO(base64.b64decode(data))).convert('RGBA');bg=Image.new('RGBA',im.size,(244,242,237,255));bg.alpha_composite(im);bg.convert('RGB').save(temp/f'frame{i:04d}.png')
   if i%20==0:print(f'Render {i}/{HALF}',flush=True)
  page.evaluate('captureViewer.dispose()');b.close()
 for i in range(HALF+1,HALF*2):shutil.copyfile(temp/f'frame{HALF*2-i:04d}.png',temp/f'frame{i:04d}.png')
 subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-framerate',str(FPS),'-i',str(temp/'frame%04d.png'),'-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-movflags','+faststart',str(ROOT/'samples/roomlet-loop.mp4')],check=True)
 subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(ROOT/'samples/roomlet-loop.mp4'),'-filter_complex','fps=15,scale=520:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4','-loop','0',str(ROOT/'samples/roomlet-loop.gif')],check=True)
print('Created actual-model MP4 and GIF',flush=True)
