"""Remove opening detour, delay return wall and tree; viewport only."""
import bpy,json
from pathlib import Path
from mathutils import Vector,Matrix
BASE=Path(__file__).resolve().parent
OUT=BASE/'motion-v18';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE/'motion-v17/opai-soft-assembly-v17.blend'))
s=bpy.context.scene;m=json.loads((BASE/'motion-v17/manifest.json').read_text())
def ease(v):
    v=max(0,min(1,v));return v**3*(10-15*v+6*v*v)
changed=[]
for u in m['units']:
    if u['name'] not in ['Central limestone return','Courtyard tree and planter']:continue
    u['start']=6.95 if u['name']=='Central limestone return' else .35
    c=s.objects[u['controller']];c.animation_data_clear()
    for o in c.children:o.animation_data_clear()
    for f in range(1,301):
        t=(f-1)/20;k=max(.00001,ease((t-u['start'])/.7)*(1-ease((t-u['out_start'])/.7)))
        c.scale=(k,k,k);c.location=Vector(u['pivot'])*(1-k)
        c.keyframe_insert('scale',frame=f);c.keyframe_insert('location',frame=f)
        for o in c.children:
            o.hide_viewport=o.hide_render=t<=u['start'] or t>=u['out_start']+.7
            o.color=(1,1,1,ease((t-u['start'])/.3)*(1-ease((t-u['out_start']-.35)/.35)))
            for prop in ['hide_viewport','hide_render','color']:o.keyframe_insert(prop,frame=f)
    changed.append(u['name'])
# The front detour is removed: start on the house side of the tree and
# withdraw along the central passage, joining the accepted route at 3.2s.
cam=s.camera;tree=Vector((-1.3171233,-4.2711096,2.592036))
start=Vector((1.2,-3.2,1.8));end=Vector((1.2,0,1.8))
for f in range(1,66):
    u=(f-1)/64
    # Zero initial speed, matching the following segment's forward speed.
    p=start+(end-start)*(u*u*(2-u))
    forward=(tree-p).normalized();right=forward.cross(Vector((0,0,1))).normalized()
    up=right.cross(forward).normalized();q=Matrix((right,up,-forward)).transposed().to_quaternion()
    s.frame_set(f)
    if q.dot(cam.rotation_quaternion)<0:q.negate()
    cam.location=p;cam.rotation_quaternion=q
    cam.keyframe_insert('location',frame=f);cam.keyframe_insert('rotation_quaternion',frame=f)
for f in range(287,301):
    s.frame_set(1);p=cam.location.copy();q=cam.rotation_quaternion.copy()
    s.frame_set(f);cam.location=p;cam.rotation_quaternion=q
    cam.keyframe_insert('location',frame=f);cam.keyframe_insert('rotation_quaternion',frame=f)
for i,d in enumerate(m['pen_strokes']):
    if 'limestone return' not in d['name'].lower():continue
    o=s.objects.get('V06 · ink %02d %s'%(i,d['name']))
    if o:
        for f in range(1,142):
            o.hide_viewport=o.hide_render=f<140
            o.keyframe_insert('hide_viewport',frame=f);o.keyframe_insert('hide_render',frame=f)
path=s.objects.get('CAMERA PATH - near / medium / wide')
if path:
    points=path.data.splines[0].points
    for i,p in enumerate(points):
        s.frame_set(i+1);p.co=(*cam.location,1)
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:k.interpolation='CONSTANT' if fc.data_path.startswith('hide_') else 'LINEAR'
s.frame_set(191);bpy.context.view_layer.update()
for name,d in m['source_matrices'].items():
    o=s.objects[name]
    assert not o.hide_viewport
    assert all(abs(o.matrix_world[i][j]-d['matrix'][i][j])<1e-4 for i in range(4) for j in range(4)),name
for f in range(1,8):
    s.frame_set(f)
    assert all(o.hide_viewport for o in s.objects['V06 · assembly Courtyard tree and planter'].children)
for f in range(1,140):
    s.frame_set(f)
    assert all(o.hide_viewport for o in s.objects['V06 · assembly Central limestone return'].children)
m.update(no_scale_animation=False,camera_unchanged_from=None,opening='Direct central backward retreat; front detour removed',rendered=False)
(OUT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
(OUT/'verification.json').write_text(json.dumps(dict(passed=True,full_geometry_preserved=True,tree_delayed=True,return_wall_delayed=True,rendered=False)))
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opai-direct-retreat-v18.blend'))
print('V18_READY_NO_RENDER')
