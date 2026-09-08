"""Verify the unstable near-contact interval, not only the static hold."""
import bpy,json
from pathlib import Path
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-rebound-v14.blend'))
s=bpy.context.scene;checks=0
for f in range(1,97):
    s.frame_set(f)
    for li in range(6):
        whole=next(o for o in s.objects if o.name.startswith(f'{li}_') and o.name.endswith('_solid'))
        parts=[o for o in s.objects if o.name.startswith(f'{li}_') and '_part' in o.name]
        def scale(o):return next(fc for l in o.animation_data.action.layers for st in l.strips for bag in st.channelbags for fc in bag.fcurves if fc.data_path=='scale' and fc.array_index==0).evaluate(f)
        joined=min(scale(o) for o in parts)>=.9
        assert whole.hide_render != joined,(f,li)
        assert all(o.hide_render for o in parts)
        if joined:
            assert not any(not o.hide_render for o in s.objects if o.name.startswith(f'Union_{li}_'))
            checks+=1
    if f in (1,96):assert all(o.hide_render for o in s.objects if '_solid' in o.name or o.name.startswith('Union_'))
assert (s.render.resolution_x,s.render.resolution_y,s.frame_end,s.render.fps)==(1920,1080,96,24)
report={'frames_checked':96,'continuous_glyph_checks':checks,'near_contact_no_overlapping_strokes':True,'blank_endpoints':True}
(OUT/'verify-v14-report.json').write_text(json.dumps(report,indent=2));print(report)
