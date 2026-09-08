"""Render visible states at 1080p; identical static states reuse exact PNGs."""
import bpy, shutil, json
from pathlib import Path
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-seamless-v11.blend'))
p=bpy.context.preferences.addons['cycles'].preferences;p.compute_device_type='METAL';p.get_devices()
assert any(d.type=='METAL' for d in p.devices)
for d in p.devices:d.use=d.type=='METAL'
s=bpy.context.scene;s.cycles.device='GPU'
folder=OUT/'frames-v11';folder.mkdir(exist_ok=True)
cache={};rendered=0
for f in range(1,97):
    s.frame_set(f)
    state=tuple((o.name,tuple(o.scale),tuple(o.location),tuple(o.rotation_euler)) for o in s.objects if not o.hide_render)
    target=folder/f'frame_{f:04d}.png'
    if state in cache:shutil.copy2(cache[state],target)
    else:
        s.render.filepath=str(target);bpy.ops.render.render(write_still=True)
        cache[state]=target;rendered+=1
    print('FRAME_COMPLETE',f,flush=True)
(OUT/'render-v11-report.json').write_text(json.dumps({'frames':96,'unique_states_rendered':rendered,'identical_static_states_reused':96-rendered,'device':'METAL','resolution':[1920,1080],'samples':64},indent=2))
