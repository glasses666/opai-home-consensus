"""Approved V20 render; separate output, resumable PNG frames."""
import bpy,sys,json
from pathlib import Path
BASE=Path(__file__).resolve().parent;OUT=BASE/'motion-v20/render-1080';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE/'motion-v20/opai-settle-exit-v20.blend'))
s=bpy.context.scene;s.render.engine='CYCLES'
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
s.cycles.device='GPU';s.cycles.samples=32;s.cycles.use_denoising=True
s.cycles.use_adaptive_sampling=True;s.cycles.adaptive_threshold=.06
s.render.resolution_x=1920;s.render.resolution_y=1080;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
s.render.fps=20;s.render.threads_mode='FIXED';s.render.threads=12
if '--test' in sys.argv:
    s.frame_set(281);s.render.filepath=str(OUT/'test.png');bpy.ops.render.render(write_still=True)
else:
    frames=OUT/'frames';frames.mkdir(exist_ok=True)
    for f in range(1,385):
        p=frames/('frame-%04d.png'%f)
        if p.exists() and p.stat().st_size>1000:continue
        s.frame_set(f);s.render.filepath=str(p);bpy.ops.render.render(write_still=True)
    (OUT/'complete.json').write_text(json.dumps(dict(frames=384,fps=20,resolution=[1920,1080],samples=32)))
