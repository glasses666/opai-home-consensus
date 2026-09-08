"""Deterministic gravity-drop variant of the preserved V01 model.
Analytic vertical motion, not a rigid-body collision simulation.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-assembly-v01.blend'))
scene=bpy.context.scene
scene.frame_set(120)
FPS=24; HEIGHT=5.5; G=9.81; RESTITUTION=.10
fall=math.sqrt(2*HEIGHT/G)
impact_speed=G*fall
bounce_time=2*impact_speed*RESTITUTION/G
records=[]
def height(t):
    if t<=0:return HEIGHT
    if t<fall:return HEIGHT-.5*G*t*t
    t-=fall
    if t<bounce_time:return impact_speed*RESTITUTION*t-.5*G*t*t
    return 0.

letters=[o for o in scene.objects if '_stroke_' in o.name]
letters.sort(key=lambda o:min(p.co.x for s in o.data.splines for p in s.points))
for i,obj in enumerate(letters):
    obj['drop_layer']='upper' if obj.name.split('_stroke_')[1].startswith('1') else 'lower'
for obj in [o for o in scene.objects if o.parent and o.parent.name=='OPPEIN_ASSEMBLY']:
    final=obj.location.copy();obj.animation_data_clear();obj.scale=(1,1,1)
    if '_stroke_' in obj.name:
        col=letters.index(obj)//2
        release=(46 if obj['drop_layer']=='upper' else 1)+col*2
    else:release={'Orange bracket 2':1,'Orange bracket 0':37,'Orange bracket 1':70}[obj.name]
    for f in range(1,121):
        obj.location=final+Vector((0,0,height((f-release)/FPS)))
        obj.keyframe_insert('location',frame=f)
    # Avoid default Bezier interpolation overshooting into supporting geometry.
    for layer in obj.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:k.interpolation='LINEAR'
    obj['release_frame']=release
    obj['landing_frame']=release+fall*FPS
    records.append({'name':obj.name,'release':release,'impact':release+fall*FPS,'settled':release+(fall+bounce_time)*FPS})

# Verify full scale, vertical-only paths, no movement below each assembly seat,
# increasing fall speed and support-before-upper release.
for obj in [o for o in scene.objects if 'release_frame' in o]:
    scene.frame_set(120);seat=obj.location.copy()
    zs=[]
    for f in range(1,121):
        scene.frame_set(f)
        assert all(abs(v-1)<1e-6 for v in obj.scale)
        assert abs(obj.location.x-seat.x)<1e-6 and abs(obj.location.y-seat.y)<1e-6
        assert obj.location.z>=seat.z-1e-6
        zs.append(obj.location.z)
    r=int(obj['release_frame']);speeds=[zs[f-1]-zs[f] for f in range(r+1,r+20)]
    assert all(b>=a-1e-6 for a,b in zip(speeds,speeds[1:]))
assert max(r['settled'] for r in records if '_stroke_0' in r['name'])<46
scene.frame_set(110)
scene.render.filepath=str(OUT/'v02-assembled.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-drop-v02.blend'))
bpy.ops.render.render(write_still=True)
scene.frame_set(65);scene.render.filepath=str(OUT/'v02-dropping.png');bpy.ops.render.render(write_still=True)
(OUT/'drop-v02-manifest.json').write_text(json.dumps({'gravity':G,'height':HEIGHT,'restitution':RESTITUTION,'bounce_height':HEIGHT*RESTITUTION**2,'fps':FPS,'frames':120,'pieces':records,'verification':'unit scale; vertical-only; no undershoot of seat; increasing fall speed; lower settled before upper released','limitation':'Analytic choreography with fixed landing seats, not rigid-body contact solver or full mesh intersection proof'},indent=2))
print('DROP_V02_CHECKS_PASSED')
