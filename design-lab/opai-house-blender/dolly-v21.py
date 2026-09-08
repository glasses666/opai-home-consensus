"""Extend approved exit dolly toward house; preserve assembly timing."""
import bpy,json
from pathlib import Path
from mathutils import Vector
BASE=Path(__file__).resolve().parent;OUT=BASE/'motion-v21';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE/'motion-v20/opai-settle-exit-v20.blend'))
s=bpy.context.scene;cam=s.camera
m=json.loads((BASE/'motion-v20/manifest.json').read_text())
s.frame_set(280);start=cam.location.copy();q=cam.rotation_quaternion.copy()
target=Vector((0,1,2.8));end=start.lerp(target,.5)
def ease(u):
    u=max(0,min(1,u));return u**3*(10-15*u+6*u*u)
for f in range(287,369):
    t=(f-1)/20;cam.location=start.lerp(end,ease((t-14.3)/3.75))
    cam.rotation_quaternion=q
    cam.keyframe_insert('location',frame=f);cam.keyframe_insert('rotation_quaternion',frame=f)
for layer in cam.animation_data.action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for fc in bag.fcurves:
                for k in fc.keyframe_points:k.interpolation='LINEAR'
path=s.objects.get('CAMERA PATH - near / medium / wide')
if path:
    path.data.splines.clear();sp=path.data.splines.new('POLY');sp.points.add(361)
    for i,p in enumerate(sp.points):
        s.frame_set(i+1);p.co=(*cam.location,1)
s.frame_set(362);assert (cam.location-end).length<1e-4
assert all(s.objects[n].hide_viewport for n in m['source_matrices'])
m.update(exit_dolly_metres=(end-start).length,exit_dolly_end=list(end),reference='User 2026-09-06 09.34.19: stop short of drawn end',rendered=False)
(OUT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
(OUT/'verification.json').write_text(json.dumps(dict(passed=True,endpoint=list(end),distance=(end-start).length,rendered=False)))
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opai-nearer-exit-v21.blend'))
print('V21_READY_NO_RENDER',list(end))
