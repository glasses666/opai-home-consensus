"""Assert pen sequencing and rigid assembly, not just successful video export."""
import bpy,json,struct,math,sys
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent/'motion-v06'
m=json.loads((OUT/'manifest.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(OUT/'opai-house-assembly-v06.blend'))
s=bpy.context.scene;root=s.objects['V02 · video reference courtyard residence']
solids=[s.objects[name] for name in m['source_matrices']]
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:assert fc.data_path not in {'scale','delta_scale'},fc.data_path
for f in [1,104,171,241,351,401,480]:
    s.frame_set(f);bpy.context.view_layer.update()
    assert tuple(root.scale)==(1,1,1) and root.location.length<1e-7
    for o in solids:
        original=m['source_matrices'][o.name]['matrix']
        for i in range(3):
            expected=Vector([original[j][i] for j in range(3)]).length
            actual=Vector([o.matrix_world[j][i] for j in range(3)]).length
            assert abs(expected-actual)<1e-5,(f,o.name,'scaled')
        if f==241:
            assert not o.hide_render and abs(o.color[3]-1)<1e-6,o.name
            assert all(abs(o.matrix_world[i][j]-original[i][j])<1e-5 for i in range(4) for j in range(4)),o.name
        if f in [1,480]:assert o.hide_render,o.name
curves=[s.objects['V06 · ink %02d %s'%(i,d['name'])] for i,d in enumerate(m['pen_strokes'])]
max_active=0
for f in range(1,88):
    s.frame_set(f)
    active=sum(1e-5<o.data.bevel_factor_end<1-1e-5 for o in curves)
    max_active=max(max_active,active);assert active<=1,('Concurrent pen strokes',f,active)
assert max_active==1
for u in m['units']:
    s.frame_set(round((u['start']+.2)*20)+1)
    c=s.objects[u['controller']]
    assert c.location.length>.1,(u['name'],'no visible placement travel')
    assert all(not o.hide_render and o.color[3]>.99 for o in c.children),u['name']
s.frame_set(1);first_cam=[list(r) for r in s.camera.matrix_world]
s.frame_set(480)
assert all(abs(s.camera.matrix_world[i][j]-first_cam[i][j])<1e-5 for i in range(4) for j in range(4))
assert all(o.hide_render or o.data.bevel_factor_end<1e-6 for o in curves)
state_only='--state-only' in sys.argv
delta=None
if not state_only:
    for f in range(1,481):
        p=OUT/'frames'/('frame-%04d.png'%f)
        with p.open('rb') as stream:h=stream.read(24)
        assert h[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',h[16:24])==(960,540),f
    a=bpy.data.images.load(str(OUT/'frames/frame-0001.png'));b=bpy.data.images.load(str(OUT/'frames/frame-0480.png'))
    delta=max(abs(x-y) for x,y in zip(a.pixels[:],b.pixels[:]))
    assert delta<=1/255+1e-6,delta
report={'passed':True,'frames':480,'fps':20,'duration_seconds':24,'pixels':[960,540],
        'pen_strokes':len(curves),'max_simultaneous_drawing_strokes':max_active,
        'assembly_units':len(m['units']),'no_object_scale_animation':True,
        'rigid_translations_verified':True,'all_units_visibly_travel_at_full_opacity':True,
        'complete_v04_world_matrices_preserved':True,'all_solids_hidden_at_both_ends':True,
        'camera_loop_closed':True,'endpoint_pixel_delta':delta,'media_verified':not state_only,
        'boundary':'Assembly illustration and motion preview, not a physical construction schedule or final website deployment'}
(OUT/('state-verification.json' if state_only else 'verification.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,indent=2))
