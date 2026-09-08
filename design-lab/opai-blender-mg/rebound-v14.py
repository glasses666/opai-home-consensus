"""Keep fused early strokes, continue near-assembled rebound as one continuous glyph."""
import bpy,json
from pathlib import Path
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-planar-v13.blend'))
s=bpy.context.scene
with bpy.data.libraries.load(str(OUT/'oppein-mg-seamless-v11.blend'),link=False) as (src,dst):
    dst.objects=[n for n in src.objects if n.endswith('_solid')]
report=[]
for ob in dst.objects:
    s.collection.objects.link(ob);ob.animation_data_clear();li=int(ob.name[0])
    ob.parent=bpy.data.objects['OPPEIN_ASSEMBLY']
    points=[p for sp in ob.data.splines for p in sp.points]
    cx=(min(p.co.x for p in points)+max(p.co.x for p in points))/2
    cy=(min(p.co.y for p in points)+max(p.co.y for p in points))/2
    for p in points:p.co.x-=cx;p.co.y-=cy
    ob.location=(cx,0,cy)
    parts=sorted([o for o in s.objects if o.name.startswith(f'{li}_') and '_part' in o.name],key=lambda o:o.name)
    baked=[o for o in s.objects if o.name.startswith(f'Union_{li}_')]
    def scale(o,f):return next(fc for l in o.animation_data.action.layers for st in l.strips for bag in st.channelbags for fc in bag.fcurves if fc.data_path=='scale' and fc.array_index==0).evaluate(f)
    original={}
    for f in range(1,97):
        s.frame_set(f);original[f]=[o for o in baked if not o.hide_render]
    use_frames=[]
    for f in range(1,97):
        vals=[scale(o,f) for o in parts];joined=min(vals)>=.90
        mean=sum(vals)/len(vals)
        ob.scale=(mean,mean,1)
        ob.keyframe_insert('scale',frame=f)
        ob.hide_render=not joined;ob.hide_viewport=not joined
        ob.keyframe_insert('hide_render',frame=f);ob.keyframe_insert('hide_viewport',frame=f)
        for item in baked:
            item.hide_render=joined or item not in original[f];item.hide_viewport=item.hide_render
            item.keyframe_insert('hide_render',frame=f);item.keyframe_insert('hide_viewport',frame=f)
        if joined:use_frames.append(f)
    report.append({'letter':li,'continuous_rebound_frames':use_frames})
s.frame_set(20);s.render.filepath=str(OUT/'v14-rebound-check.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-rebound-v14.blend'))
bpy.ops.render.render(write_still=True)
(OUT/'rebound-v14-manifest.json').write_text(json.dumps({'method':'Fused contour early assembly; continuous whole glyph during near-contact rebound; mean original spring scale','threshold':.9,'letters':report,'preserved':'4-second timing, palette, camera, frame bracket','change':'Near-assembled stroke springs coupled into whole-letter rebound, fixed extrusion depth','resolution':[1920,1080]},indent=2))
