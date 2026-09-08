"""60fps version of V22; reuse finished odd-numbered 120fps frames."""
import bpy,json,shutil
from pathlib import Path
BASE=Path(__file__).resolve().parent;OUT=BASE/'motion-v23';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE/'motion-v22/opai-smooth-ink-120fps-v22.blend'))
s=bpy.context.scene
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:
                        k.co.x=1+(k.co.x-1)/2
                        k.handle_left.x=1+(k.handle_left.x-1)/2
                        k.handle_right.x=1+(k.handle_right.x-1)/2
                    fc.update()
for marker in s.timeline_markers:marker.frame=round(1+(marker.frame-1)/2)
s.render.fps=60;s.frame_end=1152
prefs=bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type='METAL';prefs.get_devices()
assert any(d.type=='METAL' for d in prefs.devices)
for d in prefs.devices:d.use=d.type=='METAL'
s.cycles.device='GPU'
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opai-smooth-ink-60fps-v23.blend'))
frames=OUT/'frames';frames.mkdir(exist_ok=True);reused=0
for f in range(1,1153):
    src=BASE/'motion-v22/frames'/('frame-%04d.png'%(2*f-1))
    dst=frames/('frame-%04d.png'%f)
    if src.exists() and not dst.exists():
        with src.open('rb') as fh:
            fh.seek(-12,2);valid=fh.read()==b'\x00\x00\x00\x00IEND\xaeB`\x82'
        if valid:shutil.copy2(src,dst);reused+=1
m=json.loads((BASE/'motion-v22/manifest.json').read_text())
m.update(frames=1152,fps=60,reused_frames=reused,rendered=False)
(OUT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
print('V23_REUSED',reused,flush=True)
for f in range(1,1153):
    p=frames/('frame-%04d.png'%f)
    if p.exists() and p.stat().st_size>1000:continue
    s.frame_set(f);s.render.filepath=str(p);bpy.ops.render.render(write_still=True)
(OUT/'complete.json').write_text(json.dumps(dict(frames=1152,fps=60,resolution=[1920,1080])))
