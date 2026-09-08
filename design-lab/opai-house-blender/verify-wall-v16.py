import bpy,json
from pathlib import Path
from mathutils import Vector
P=Path(__file__).resolve().parent/'motion-v16'
bpy.ops.wm.open_mainfile(filepath=str(P/'opai-wall-gate-v16.blend'))
s=bpy.context.scene;s.frame_set(167);bpy.context.view_layer.update()
m=json.loads((P/'manifest.json').read_text());boxes=[]
for name in m['source_matrices']:
    o=s.objects[name];pts=[o.matrix_world@Vector(p) for p in o.bound_box]
    boxes.append((o,Vector([min(p[i] for p in pts) for i in range(3)]),Vector([max(p[i] for p in pts) for i in range(3)])))
hits=[]
for f in range(1,168):
    s.frame_set(f);p=s.camera.location
    for o,lo,hi in boxes:
        if o.hide_viewport:continue
        offset=o.parent.location
        if all(lo[i]+offset[i]-.08<p[i]<hi[i]+offset[i]+.08 for i in range(3)):hits.append((f,o.name))
    if f<=137:
        for u in m['units']:
            if u.get('camera_clearance_delayed'):assert all(o.hide_viewport for o in s.objects[u['controller']].children)
report={'passed':not hits,'sampled_frames':167,'camera_clearance_m':.08,'collision_hits':hits,'occluding_groups_hidden_through_frame':137,'rendered':False}
(P/'wall-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(report)
assert not hits
