"""Verify the detailed scene against saved V02 structure and camera evidence."""
import bpy
import json
import struct
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
m=json.loads((OUT/'manifest-v03.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(OUT/m['model']))
s=bpy.context.scene
for key,wh in [('hero',(2560,1440)),('detail',(1920,1080))]:
    p=OUT/m[key]
    with p.open('rb') as f:h=f.read(24)
    assert h[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',h[16:24])==wh
    assert p.stat().st_size>100_000
for name,data in m['protected_structures'].items():
    ob=s.objects[name]
    assert len(ob.data.vertices)==len(data['verts']),name
    assert all((v.co-Vector(old)).length<1e-6 for v,old in zip(ob.data.vertices,data['verts'])),name
    assert all(abs(ob.matrix_world[i][j]-data['matrix'][i][j])<1e-6 for i in range(4) for j in range(4)),name
assert all(abs(s.camera.matrix_world[i][j]-m['hero_camera_matrix'][i][j])<1e-6 for i in range(4) for j in range(4))
assert abs(s.camera.data.ortho_scale-m['hero_ortho_scale'])<1e-6
assert len(s.objects)==m['objects']
assert len([o for o in s.objects if o.name.startswith('V03 · olive leaf')])==m['new_leaf_count']
assert s.render.engine=='CYCLES' and s.cycles.samples==160
assert not s.camera.data.dof.use_dof
assert m['detail_camera']['name'] in s.objects
assert not any(o.animation_data for o in s.objects)
assert (OUT/'opai-video-house-v02.blend').exists()
result={'passed':True,'protected_structures':len(m['protected_structures']),
        'structure_geometry_unchanged':True,'hero_camera_unchanged':True,'objects':len(s.objects),
        'hero_pixels':[2560,1440],'detail_pixels':[1920,1080],'olive_leaves':m['new_leaf_count'],
        'detail_camera_saved':True,'v02_preserved':True,'animation':False,
        'boundary':'Visual detail pass; no structural engineering, product catalogue or website E2E claim'}
(OUT/'verification-v03.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
