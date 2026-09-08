import bpy,json
from pathlib import Path
from mathutils import Vector
P=Path(__file__).resolve().parent/'motion-v12'
bpy.ops.wm.open_mainfile(filepath=str(P/'opai-underpass-v12.blend'))
s=bpy.context.scene;s.frame_set(167);bpy.context.view_layer.update()
m=json.loads((P/'manifest.json').read_text());bounds=[]
for name in m['source_matrices']:
    o=s.objects[name]
    if o.type!='MESH':continue
    pts=[o.matrix_world@Vector(v) for v in o.bound_box]
    bounds.append((name,[min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]))
hits=[];roll=0;inside=0
for f in range(1,280):
    s.frame_set(f);c=s.camera;p=c.location
    roll=max(roll,abs((c.rotation_quaternion@Vector((1,0,0))).z))
    if 3.8<p.x<12.2 and -4.8<p.y<-2.6 and p.z<3.2:inside+=1
    if f>23 and f<=121:
        for name,lo,hi in bounds:
            if all(lo[i]-.08<p[i]<hi[i]+.08 for i in range(3)):hits.append((f,name))
assert roll<1e-5,roll
assert inside>25,inside
report={'zero_roll_world_up':roll<1e-5,'under_roof_frames':inside,'clearance_aabb_hits':hits,'rendered':False}
(P/'underpass-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
assert not hits,'Camera clearance review required'
