"""Offline model rendering for the homepage; current geometry, 1.25x motion."""
import base64, io, shutil, subprocess, tempfile, sys, argparse
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
args=argparse.ArgumentParser()
args.add_argument('--output-dir',type=Path,default=ROOT/'exports')
args.add_argument('--browser',help='Optional Chrome/Chromium executable; otherwise Playwright Chromium')
args.add_argument('--still',action='store_true')
options=args.parse_args()
OUT=options.output_dir
OUT.mkdir(parents=True,exist_ok=True)
SIZE=960
FPS=60
HALF=394
html='<style>html,body{margin:0;width:100%;height:100%;background:transparent}canvas{position:fixed;inset:0;width:100%;height:100%}</style><canvas id="room"></canvas>'
for name in ['scene-data','renderer','viewer']:
    source=(ROOT/f'src/{name}.js').read_text()
    if name=='renderer':
        # Homepage-only lighting rig: restrained warm key, green-grey bounce,
        # lower ambient fill and wider shadow penumbra. Original preview stays intact.
        replacements={
            'vec3(.24,.215,.185),vec3(.79,.83,.90)': 'vec3(.16,.19,.135),vec3(.55,.60,.55)',
            'albedo*sky*.83': 'albedo*sky*.60',
            'vec3(3.5,3.20,2.73)': 'vec3(2.65,2.40,2.04)',
            'vec3(.45,.50,.57)': 'vec3(.26,.33,.27)',
            'albedo*.065': 'albedo*.025',
            "*.0038": "*.0065",
        }
        for before,after in replacements.items():
            assert before in source,before
            source=source.replace(before,after)
    html+='<script>'+source+'</script>'
html+='<script>window.captureViewer=new RoomletViewer(document.getElementById("room"),SCULPT_SCENE,{autoplay:false,pixelRatio:1,exposure:.94});captureViewer.onReady=()=>{captureViewer.renderer.orbit.yaw-=.18;captureViewer.renderer.updateCamera();window.CAPTURE_READY=true;};</script>'
with tempfile.TemporaryDirectory(prefix='roomlet-home-') as tmp:
    tmp=Path(tmp)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=options.browser,headless=True,args=['--ignore-gpu-blocklist'])
        page=browser.new_page(viewport={'width':SIZE,'height':SIZE},device_scale_factor=1)
        page.set_content(html,wait_until='load')
        page.wait_for_function('window.CAPTURE_READY',timeout=60000)
        page.evaluate('()=>{window.homeBaseYaw=captureViewer.renderer.orbit.yaw;}')
        if '--still' in sys.argv:
            data=page.evaluate('()=>{captureViewer.seek(0);return captureViewer.canvas.toDataURL("image/png").split(",")[1];}')
            im=Image.open(io.BytesIO(base64.b64decode(data))).convert('RGBA')
            bg=Image.new('RGBA',im.size,(53,61,50,255));bg.alpha_composite(im)
            bg.convert('RGB').save('/tmp/roomlet-light-review.jpg',quality=95)
            browser.close()
            sys.exit(0)
        for i in range(HALF+1):
            # +/- 2 degrees over the complete 13.13s loop. Cosine has zero
            # velocity at both ends of this half; mirrored frames join smoothly.
            data=page.evaluate('({t,phase})=>{const r=captureViewer.renderer;r.orbit.yaw=homeBaseYaw+(Math.PI/90)*Math.cos(Math.PI*phase);r.updateCamera();captureViewer.seek(t);return captureViewer.canvas.toDataURL("image/png").split(",")[1];}',{'t':8.2*i/HALF,'phase':i/HALF})
            im=Image.open(io.BytesIO(base64.b64decode(data))).convert('RGBA')
            bg=Image.new('RGBA',im.size,(53,61,50,255));bg.alpha_composite(im)
            bg.convert('RGB').save(tmp/f'frame{i:04d}.png')
            if i==0:bg.convert('RGB').save(OUT/'roomlet-living-local.jpg',quality=95)
            if i%60==0:print(f'Render {i}/{HALF}',flush=True)
        browser.close()
    for i in range(HALF+1,HALF*2):
        shutil.copyfile(tmp/f'frame{HALF*2-i:04d}.png',tmp/f'frame{i:04d}.png')
    # Canvas/PIL output is sRGB. Explicit matrix + transfer tags prevent a browser
    # from interpreting untagged video as BT.709 gamma and lifting the green field.
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-framerate',str(FPS),'-i',str(tmp/'frame%04d.png'),'-vf','scale=out_color_matrix=bt709:out_range=tv','-c:v','libx264','-crf','18','-preset','fast','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','iec61966-2-1','-color_range','tv','-movflags','+faststart',str(OUT/'roomlet-living-local.mp4')],check=True)
    # Set both H.264 VUI and MP4 colr metadata; setting encoder flags alone left
    # transfer/primaries unknown in the resulting container on this FFmpeg build.
    subprocess.run(['ffmpeg','-y','-v','error','-i',str(OUT/'roomlet-living-local.mp4'),'-c','copy','-bsf:v','h264_metadata=colour_primaries=1:transfer_characteristics=13:matrix_coefficients=1','-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','bt709','-movflags','+faststart+write_colr',str(OUT/'roomlet-living-srgb.mp4')],check=True)
print('Homepage MP4 and poster ready:',OUT,flush=True)
