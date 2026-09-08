"""Verify saved still/model; no scene mutations. Run using Blender's Python."""
import bpy
import json
import math
import struct
from pathlib import Path

folder=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(folder/'opai-complete-house-v01.blend'))
s=bpy.context.scene
manifest=json.loads((folder/'manifest.json').read_text())
png=folder/manifest['render']
with png.open('rb') as f:
    header=f.read(24)
assert header[:8]==b'\x89PNG\r\n\x1a\n'
dimensions=struct.unpack('>II',header[16:24])
assert dimensions==(1920,1080)
assert s.render.engine=='CYCLES' and s.cycles.device=='GPU'
assert not s.camera.data.dof.use_dof
assert len(s.objects)==manifest['objects']
assert s.camera.data.ortho_scale==35
assert (folder/manifest['model']).stat().st_size>100_000
for name in ['West complete roof continuous roof','East complete roof continuous roof',
             'Continuous rear wall','West solid facade','Ground floor roof and upper slab']:
    assert name in s.objects,name
glass=[o for o in s.objects if 'glass ' in o.name]
assert len(glass)>20
for o in s.objects:
    assert all(math.isfinite(v) for row in o.matrix_world for v in row),o.name
    if o.type=='MESH' and o.name!='Seamless studio ground':
        assert o.parent and o.parent.name==manifest['root'],o.name
    assert not o.animation_data,'Still phase must not introduce unreviewed animation'
assert not list(folder.glob('*.mp4'))
report={'passed':True,'png':png.name,'dimensions':dimensions,'objects':len(s.objects),
        'glass_panels':len(glass),'engine':s.render.engine,'device':s.cycles.device,
        'complete_roof_components_present':True,'animation':False,
        'boundary':'Component checks, not architectural engineering or waterproofing validation'}
(folder/'verification.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
