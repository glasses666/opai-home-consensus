"""Capture accepted roomlet sources without changing their model or lighting."""
import argparse, base64, io, shutil, subprocess, tempfile
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('scene', choices=['growing', 'together'])
args = parser.parse_args()
root = Path(__file__).resolve().parent
source = root / f'roomlet-{args.scene}-local'
out = root.parent / 'app/public/assets/rooms'
stem = f'roomlet-{args.scene}'
html = '<style>html,body{margin:0}canvas{width:960px;height:960px}</style><canvas id="room"></canvas>'
for name in ['scene-data', 'renderer', 'viewer']:
    html += '<script>' + (source / f'src/{name}.js').read_text() + '</script>'
html += '<script>window.v=new RoomletViewer(document.getElementById("room"),SCULPT_SCENE,{autoplay:false,parallax:false,pixelRatio:1,exposure:.94});v.onReady=()=>{window.baseYaw=v.renderer.orbit.yaw;window.ready=true;};</script>'
with tempfile.TemporaryDirectory(prefix=stem) as folder:
    folder = Path(folder)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless=True)
        page = browser.new_page(viewport={'width':960,'height':960}, device_scale_factor=1)
        page.set_content(html)
        page.wait_for_function('window.ready', timeout=60000)
        duration = page.evaluate('v.duration')
        half = round(duration / 2 / 1.25 * 60)
        for i in range(half + 1):
            data = page.evaluate('({t,phase})=>{const r=v.renderer;r.orbit.yaw=baseYaw+Math.PI/90*Math.cos(Math.PI*phase);r.updateCamera();v.seek(t);return v.canvas.toDataURL("image/png").split(",")[1];}', {'t':duration/2*i/half,'phase':i/half})
            im = Image.open(io.BytesIO(base64.b64decode(data))).convert('RGBA')
            bg = Image.new('RGBA', im.size, (53,61,50,255))
            bg.alpha_composite(im)
            bg.convert('RGB').save(folder / f'frame{i:04d}.png')
            if i == 0: bg.convert('RGB').save(out / f'{stem}-local.jpg', quality=95)
            if i % 90 == 0: print(f'{args.scene}: {i}/{half}', flush=True)
        browser.close()
    for i in range(half + 1, half * 2):
        shutil.copyfile(folder / f'frame{half*2-i:04d}.png', folder / f'frame{i:04d}.png')
    raw = folder / 'encoded.mp4'
    subprocess.run(['ffmpeg','-y','-v','error','-framerate','60','-i',str(folder/'frame%04d.png'),'-vf','scale=out_color_matrix=bt709:out_range=tv','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','iec61966-2-1','-color_range','tv','-movflags','+faststart',str(raw)],check=True)
    subprocess.run(['ffmpeg','-y','-v','error','-i',str(raw),'-c','copy','-bsf:v','h264_metadata=colour_primaries=1:transfer_characteristics=13:matrix_coefficients=1','-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','bt709','-movflags','+faststart+write_colr',str(out/f'{stem}-srgb.mp4')],check=True)
print(f'{stem}: complete, {half*2} frames',flush=True)
