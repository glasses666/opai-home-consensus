"""Viewport-visible eased assembly; camera unchanged, no render calls."""
import bpy,json
from pathlib import Path
from mathutils import Vector
BASE=Path(__file__).resolve().parent;OUT=BASE/'motion-v17';OUT.mkdir(exist_ok=True)
m=json.loads((BASE/'motion-v16/manifest.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(BASE/'motion-v16/opai-wall-gate-v16.blend'))
s=bpy.context.scene;s.frame_set(167);bpy.context.view_layer.update()
units=m['units'];duration=.7
support_end=max(u['start']+duration for u in units if u['stage'] in [0,1,5,6])
for u in units:
    u['duration']=duration
    if u['stage']==9:u['start']=max(u['start'],support_end+.02)
for u in units:
    if u['stage'] in [3,4,7,8,10] and u['name']!='Courtyard tree and planter':
        u['start']=max(u['start'],support_end+.04+(u['stage']%3)*.08)
        u['support_wait_until']=support_end
units.sort(key=lambda u:u['start'])
for i,u in enumerate(units):
    c=s.objects[u['controller']];c.animation_data_clear()
    pts=[o.matrix_world@Vector(v) for o in c.children for v in o.bound_box]
    u['pivot']=[(min(p.x for p in pts)+max(p.x for p in pts))/2,(min(p.y for p in pts)+max(p.y for p in pts))/2,min(p.z for p in pts)]
    u['out_start']=10.3+(len(units)-1-i)*3.05/(len(units)-1)
    for o in c.children:o.animation_data_clear()
def ease(v):
    v=max(0,min(1,v));return v*v*v*(10+v*(-15+6*v))
for f in range(1,301):
    t=(f-1)/20
    for u in units:
        a=ease((t-u['start'])/duration);b=ease((t-u['out_start'])/duration)
        scale=max(.00001,a*(1-b));c=s.objects[u['controller']]
        # Bottom-anchored emergence, not a full-size object suspended in air.
        c.scale=(scale,scale,scale)
        c.location=Vector(u['pivot'])*(1-scale)
        c.keyframe_insert('scale',frame=f);c.keyframe_insert('location',frame=f)
        hidden=t<=u['start'] or t>=u['out_start']+duration
        alpha=ease((t-u['start'])/.3)*(1-ease((t-u['out_start']-.35)/.35))
        if f==1 or hidden!=u.get('_hidden') or alpha!=u.get('_alpha'):
            for o in c.children:
                if f>1 and u.get('_frame',0)<f-1:
                    o.color=(1,1,1,u['_alpha']);o.keyframe_insert('color',frame=f-1)
                o.color=(1,1,1,alpha);o.keyframe_insert('color',frame=f)
                o.hide_render=hidden;o.hide_viewport=hidden
                o.keyframe_insert('hide_render',frame=f);o.keyframe_insert('hide_viewport',frame=f)
            u['_frame']=f
        u['_hidden']=hidden;u['_alpha']=alpha
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:k.interpolation='CONSTANT' if fc.data_path.startswith('hide_') else 'LINEAR'
s.frame_set(191);bpy.context.view_layer.update()
for name,d in m['source_matrices'].items():
    o=s.objects[name];assert not o.hide_viewport
    assert all(abs(o.matrix_world[i][j]-d['matrix'][i][j])<1e-4 for i in range(4) for j in range(4)),name
for u in units:
    s.frame_set(round((u['start']+.35)*20)+1)
    c=s.objects[u['controller']];assert .1<c.scale.x<.9
    if 'support_wait_until' in u:assert u['start']>=support_end
m['units']=[{k:v for k,v in u.items() if not k.startswith('_')} for u in units]
m.update({'motion':'700ms quintic bottom-anchored component scale, no overshoot','support_end':support_end,'camera_unchanged_from':'V16','rendered':False})
(OUT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
(OUT/'verification.json').write_text(json.dumps({'passed':True,'complete_geometry_preserved':True,'all_units_have_intermediate_scale':True,'dependent_items_wait_for_structural_support':True,'rendered':False},indent=2))
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opai-soft-assembly-v17.blend'))
print('V17_READY_NO_RENDER')
