"""Verify visible overlapping motion, unchanged assembled geometry and loop."""
import bpy,json,sys,struct
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent/'motion-v07'
m=json.loads((OUT/'manifest.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(OUT/'opai-house-overlap-v07.blend'))
s=bpy.context.scene
curves=[s.objects['V06 · ink %02d %s'%(i,d['name'])] for i,d in enumerate(m['pen_strokes'])]
overlap_in=[];overlap_out=[]
for f in range(1,301):
    s.frame_set(f);t=(f-1)/20
    active=sum(not o.hide_render and 1e-5<o.data.bevel_factor_end<1-1e-5 for o in curves)
    assert active<=1,(f,'pen strokes must remain sequential')
    moving=any(s.objects[u['controller']].location.length>.05 and any(not o.hide_render and o.color[3]>.99 for o in s.objects[u['controller']].children) for u in m['units'])
    if active and moving:(overlap_in if t<7 else overlap_out).append(f)
assert len(overlap_in)>=20 and len(overlap_out)>=20,(overlap_in,overlap_out)
for f in [1,29,61,101,141,219,251,300]:
    s.frame_set(f);bpy.context.view_layer.update()
    for name,d in m['source_matrices'].items():
        o=s.objects[name];original=d['matrix']
        for i in range(3):
            assert abs(Vector([o.matrix_world[j][i] for j in range(3)]).length-Vector([original[j][i] for j in range(3)]).length)<1e-5,(f,name)
        if f==141:
            assert not o.hide_render and o.color[3]>.999
            assert all(abs(o.matrix_world[i][j]-original[i][j])<1e-5 for i in range(4) for j in range(4)),name
        if f in [1,300]:assert o.hide_render,name
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:assert fc.data_path not in {'scale','delta_scale'}
s.frame_set(1);bpy.context.view_layer.update();first=[list(r) for r in s.camera.matrix_world]
s.frame_set(300);bpy.context.view_layer.update()
assert all(abs(s.camera.matrix_world[i][j]-first[i][j])<1e-5 for i in range(4) for j in range(4))
assert all(o.hide_render or o.data.bevel_factor_end<1e-6 for o in curves)
state_only='--state-only' in sys.argv;delta=None
if not state_only:
    for f in range(1,301):
        with (OUT/'frames'/('frame-%04d.png'%f)).open('rb') as stream:h=stream.read(24)
        assert h[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',h[16:24])==(960,540)
    a=bpy.data.images.load(str(OUT/'frames/frame-0001.png'));b=bpy.data.images.load(str(OUT/'frames/frame-0300.png'))
    delta=max(abs(x-y) for x,y in zip(a.pixels[:],b.pixels[:]))
    assert delta<=1/255+1e-6,delta
report={'passed':True,'seconds':15,'frames':300,'drawing_and_assembly_overlap_frames':overlap_in,
        'erasing_and_disassembly_overlap_frames':overlap_out,'constant_component_dimensions':True,
        'complete_v04_geometry_preserved':True,'sequential_pen_strokes':True,'camera_loop_closed':True,
        'endpoint_pixel_delta':delta,'media_verified':not state_only}
(OUT/('state-verification.json' if state_only else 'verification.json')).write_text(json.dumps(report,indent=2))
print(json.dumps(report))
