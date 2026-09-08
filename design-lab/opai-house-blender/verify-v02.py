"""Validate the saved video-proportioned still/model, not engineering correctness."""
import bpy
import json
import math
import struct
from mathutils import Vector
from pathlib import Path
folder=Path(__file__).resolve().parent
m=json.loads((folder/'manifest-v02.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(folder/m['model']))
s=bpy.context.scene
with (folder/m['render']).open('rb') as f:header=f.read(24)
assert header[:8]==b'\x89PNG\r\n\x1a\n'
assert struct.unpack('>II',header[16:24])==(1920,1080)
assert len(s.objects)==m['objects']
for n in ['West and tall bay complete joined roof','Rear link complete roof continuous roof',
          'East complete pavilion roof continuous roof','East cantilever upper floor',
          'Central tree limestone planter','Patio square oak table']:
    assert n in s.objects,n
points=[]
for o in s.objects:
    assert all(math.isfinite(v) for row in o.matrix_world for v in row),o.name
    assert not o.animation_data
    if o.type=='MESH' and o.parent:
        assert o.parent.name=='V02 · video reference courtyard residence'
        points.extend(o.matrix_world@Vector(c) for c in o.bound_box)
span=[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
assert span[0]>25 and span[1]>14,span
assert not any('Pool' in o.name or 'Reflection basin' in o.name for o in s.objects)
assert s.camera.location.x<0,'Reference view shows the west side, not the V01 east-side view'
assert not s.camera.data.dof.use_dof
assert s.render.engine=='CYCLES' and s.cycles.device=='GPU'
result={'passed':True,'objects':len(s.objects),'dimensions':[1920,1080],
        'model_bounds_metres':[round(v,2) for v in span],
        'source_dimensions_measured':False,'root_and_roof_components':True,
        'camera':'west-front oblique','homepage_replaced':False,'animation':False,
        'limits':'Visible-proportion reconstruction; rear elevation inferred, not pixel-perfect or engineering validation'}
(folder/'verification-v02.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
