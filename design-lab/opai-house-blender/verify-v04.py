"""Reload the interior scene and verify geometry locks, outputs and chair clearance."""
import bpy, json, math, struct
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
m=json.loads((OUT/'manifest-v04.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(OUT/m['model']))
s=bpy.context.scene
for shot in m['shots']:
    p=OUT/shot['name']
    with p.open('rb') as f:h=f.read(24)
    assert h[:8]==b'\x89PNG\r\n\x1a\n'
    assert list(struct.unpack('>II',h[16:24]))==shot['size']
    assert p.stat().st_size>100_000
    assert not s.objects[shot['camera']].data.dof.use_dof
for name,data in m['protected_exterior'].items():
    o=s.objects[name]
    assert len(o.data.vertices)==len(data['vertices']),name
    assert all((v.co-Vector(a)).length<1e-6 for v,a in zip(o.data.vertices,data['vertices'])),name
    assert all(abs(o.matrix_world[i][j]-data['matrix'][i][j])<1e-6 for i in range(4) for j in range(4)),name
assert all(abs(s.camera.matrix_world[i][j]-m['hero_matrix'][i][j])<1e-6 for i in range(4) for j in range(4))
assert abs(s.camera.data.ortho_scale-m['hero_scale'])<1e-6
assert len(s.objects)==m['objects']
assert s.render.engine=='CYCLES' and s.cycles.samples==192
assert not any(o.animation_data for o in s.objects)
assert (OUT/m['source']).exists()
for prefix in ['V04 · individual rounded seat','V04 · curved armchair shell','V04 · bookcase divider',
               'V04 · cabinet inset front','V04 · hollow ceramic vase']:
    assert any(o.name.startswith(prefix) for o in s.objects),prefix
for o in s.objects:
    assert all(math.isfinite(v) for row in o.matrix_world for v in row),o.name

# World AABBs from evaluated vertices, including bevels and parent yaw.
# Curve evaluated bound_box may be unavailable (-1 corners); use to_mesh instead.
# Specific regression check only, not a full architectural collision audit.
deps=bpy.context.evaluated_depsgraph_get()
def bounds(objects):
    pts=[]
    for o in objects:
        e=o.evaluated_get(deps)
        mesh=e.to_mesh()
        if mesh:
            pts.extend(e.matrix_world@v.co for v in mesh.vertices)
        e.to_mesh_clear()
    return ([min(p[i] for p in pts) for i in range(3)],
            [max(p[i] for p in pts) for i in range(3)])
chair=s.objects['V04 · west living accent chair']
cb=bounds([o for o in chair.children if o.type in {'MESH','CURVE'}])
clearances={}
for jamb in [o for o in s.objects if o.name.startswith('Tall bay full height stone jamb')]:
    jb=bounds([jamb])
    separations=[max(jb[0][i]-cb[1][i],cb[0][i]-jb[1][i]) for i in range(3)]
    assert max(separations)>0,('Chair intersects jamb',jamb.name,cb,jb,separations)
    clearances[jamb.name]=round(max(separations),4)
result={'passed':True,'objects':len(s.objects),'protected_exterior_components':len(m['protected_exterior']),
        'hero_camera_unchanged':True,'all_three_images_valid':True,'no_dof_or_animation':True,
        'new_interior_objects':sum(o.name.startswith('V04 · ') for o in s.objects),
        'west_chair_jamb_aabb_separation_m':clearances,'v03_preserved':True,
        'boundary':'Visual furniture refinement and specific collision regression; not construction or full circulation validation'}
(OUT/'verification-v04.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
