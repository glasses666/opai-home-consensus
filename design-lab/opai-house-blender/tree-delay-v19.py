"""Delay only the tree entrance by 2.5s; retain exit and camera."""
import bpy,json
from pathlib import Path
BASE=Path(__file__).resolve().parent
OUT=BASE/'motion-v19';OUT.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE/'motion-v18/opai-direct-retreat-v18.blend'))
s=bpy.context.scene
m=json.loads((BASE/'motion-v18/manifest.json').read_text())
u=next(u for u in m['units'] if u['name']=='Courtyard tree and planter')
c=s.objects[u['controller']]
actions={o.animation_data.action for o in [c,*c.children] if o.animation_data and o.animation_data.action}
# Entrance ends at 1.05s. Move entrance keys by 50 frames; keep all later
# holding/exit keys intact, removing the redundant early holding samples.
for action in actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    samples=[(k.co.x+50 if k.co.x<=22 else k.co.x,k.co.y) for k in fc.keyframe_points if not 22<k.co.x<=72]
                    fc.keyframe_points.clear()
                    fc.keyframe_points.add(len(samples))
                    for k,(x,y) in zip(fc.keyframe_points,samples):
                        k.co=(x,y)
                        k.interpolation='CONSTANT' if fc.data_path.startswith('hide_') else 'LINEAR'
                    fc.update()
u['start']+=2.5
assert abs(u['start']-2.85)<1e-6
for f in [1,20,51,57]:
    s.frame_set(f)
    assert all(o.hide_viewport for o in c.children),f
s.frame_set(65);assert .01<c.scale.x<.99
s.frame_set(191);assert abs(c.scale.x-1)<1e-6
m['tree_entrance_delay_from_v18_seconds']=2.5
(OUT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
(OUT/'verification.json').write_text(json.dumps(dict(passed=True,tree_start_seconds=2.85,camera_unchanged=True,exit_unchanged=True,rendered=False)))
s.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opai-tree-delay-v19.blend'))
print('V19_READY_NO_RENDER')
