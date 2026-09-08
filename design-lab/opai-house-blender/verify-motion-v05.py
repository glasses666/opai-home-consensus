"""Verify saved animation state transitions; media is independently probed by ffprobe."""
import bpy,json,struct
from pathlib import Path
OUT=Path(__file__).resolve().parent/'motion-v05'
m=json.loads((OUT/'manifest.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(OUT/'opai-house-motion-v05.blend'))
s=bpy.context.scene;root=s.objects['V02 · video reference courtyard residence']
wire=s.objects['V05 · rising architectural skeleton']
def descendants(o):
    p=o.parent
    while p:
        if p==root:return True
        p=p.parent
    return False
solids=[o for o in s.objects if o.type in {'MESH','CURVE'} and descendants(o)]
assert len(solids)==m['solid_objects']
states=[]
for f in [1,26,60,103,160,206,256,278,320]:
    s.frame_set(f)
    states.append({'frame':f,'solid_z':root.scale.z,'wire_z':wire.scale.z,
                   'visible_solids':sum(not o.hide_render for o in solids)})
    if f in [1,26,256,278,320]:assert all(o.hide_render for o in solids),f
    if f in [60,103,160,206]:assert all(not o.hide_render for o in solids),f
    if f in [103,160,206]:assert abs(root.scale.z-1)<1e-5
    assert 0<=root.scale.z<=1 and 0<=wire.scale.z<=1
s.frame_set(1);start=[list(r) for r in s.camera.matrix_world];start_scale=s.camera.data.ortho_scale
s.frame_set(320)
assert all(abs(s.camera.matrix_world[i][j]-start[i][j])<1e-5 for i in range(4) for j in range(4))
assert abs(s.camera.data.ortho_scale-start_scale)<1e-5
for f in range(1,321):
    p=OUT/'frames'/('frame-%04d.png'%f)
    with p.open('rb') as stream:h=stream.read(24)
    assert h[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>II',h[16:24])==(960,540),f
first=bpy.data.images.load(str(OUT/'frames/frame-0001.png'))
last=bpy.data.images.load(str(OUT/'frames/frame-0320.png'))
delta=max(abs(a-b) for a,b in zip(first.pixels[:],last.pixels[:]))
assert delta<=1/255+1e-6,('Loop endpoint exceeds one 8-bit level',delta)
result={'passed':True,'frame_count':320,'pixels':[960,540],'fps':20,'duration_s':16,
        'endpoints_within_one_8bit_level':True,'endpoint_max_pixel_delta':delta,'start_end_camera_identical':True,'states':states,
        'boundary':'Motion study, no production quality or homepage deployment claim'}
(OUT/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,indent=2))
