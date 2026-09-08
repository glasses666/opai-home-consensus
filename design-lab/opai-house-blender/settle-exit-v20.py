"""Settle wide shot before exit, then a subtle eased dolly. No rendering."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
BASE=Path(__file__).resolve().parent;OUT=BASE/'motion-v20';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE/'motion-v19/opai-tree-delay-v19.blend'))
s=bpy.context.scene;cam=s.camera
m=json.loads((BASE/'motion-v19/manifest.json').read_text())
poses=[]
for f in range(1,301):
    s.frame_set(f);poses.append((cam.location.copy(),cam.rotation_quaternion.copy()))
camera_action=cam.animation_data.action
for action in bpy.data.actions:
    if action==camera_action:continue
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:
                        if k.co.x>=201:
                            k.co.x+=80;k.handle_left.x+=80;k.handle_right.x+=80
                    fc.update()
def pose(t):
    x=max(0,min(299,t*20));i=int(x);j=min(299,i+1)
    return poses[i][0].lerp(poses[j][0],x-i),poses[i][1].slerp(poses[j][1],x-i)
def smooth(u):
    u=max(0,min(1,u));return u**3*(10-15*u+6*u*u)
rest,rot=pose(13.9)
forward=rot@Vector((0,0,-1))
cam.animation_data_clear()
for f in range(1,385):
    t=(f-1)/20
    if t<=10:p,q=pose(t)
    elif t<13.9:
        u=(t-10)/3.9;p,q=pose(10+3.9*(u+u*u-u*u*u))
    elif t<14.3:p,q=rest,rot
    elif t<18.4:p,q=rest+forward*(2*smooth((t-14.3)/3.75)),rot
    else:p,q=poses[0]
    cam.location=p;cam.rotation_quaternion=q
    cam.keyframe_insert('location',frame=f);cam.keyframe_insert('rotation_quaternion',frame=f)
for layer in cam.animation_data.action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for fc in bag.fcurves:
                for k in fc.keyframe_points:k.interpolation='LINEAR'
s.frame_end=384
for u in m['units']:u['out_start']+=4
for marker in s.timeline_markers:
    if marker.frame>=201:marker.frame+=80
s.timeline_markers.new('CAMERA SETTLED',frame=279)
s.timeline_markers.new('GENTLE DOLLY + EXIT',frame=287)
s.frame_set(281);bpy.context.view_layer.update()
assert all(not s.objects[n].hide_viewport for n in m['source_matrices'])
assert (cam.location-rest).length<1e-5
s.frame_set(362)
assert all(s.objects[n].hide_viewport for n in m['source_matrices'])
assert abs((cam.location-rest).length-2)<1e-4
m.update(frames=384,seconds=19.2,exit_start=14.3,camera_settle=13.9,exit_dolly_metres=2,rendered=False)
(OUT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
(OUT/'verification.json').write_text(json.dumps(dict(passed=True,complete_house_during_hold=True,exit_after_settle=True,exit_dolly_metres=2,rendered=False)))
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opai-settle-exit-v20.blend'))
print('V20_READY_NO_RENDER')
