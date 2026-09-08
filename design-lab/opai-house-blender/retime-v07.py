"""Overlap the accepted V06 pen/rigid assembly choreography in a 15s loop."""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector
BASE=Path(__file__).resolve().parent
OUT=BASE/'motion-v07';OUT.mkdir(exist_ok=True)
m=json.loads((BASE/'motion-v06/manifest.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(BASE/'motion-v06/opai-house-assembly-v06.blend'))
s=bpy.context.scene;s.frame_set(241);bpy.context.view_layer.update()
lights=[o for o in s.objects if o.type=='LIGHT' and ('ceiling' in o.name.lower() or o.name.startswith('V04'))]
energies={o.name:o.data.energy for o in lights}
for o in s.objects:
    o.animation_data_clear()
    if o.data and hasattr(o.data,'animation_data_clear'):o.data.animation_data_clear()
for a in list(bpy.data.actions):
    if a.users==0:bpy.data.actions.remove(a)
FPS=20;N=300;s.frame_end=N
def ramp(t,a,b):
    v=max(0,min(1,(t-a)/(b-a)));return v*v*(3-2*v)
curves=[s.objects['V06 · ink %02d %s'%(i,d['name'])] for i,d in enumerate(m['pen_strokes'])]
for d in m['pen_strokes']:
    d['start']=.2+(d['start']-.3)*.9;d['end']=.2+(d['end']-.3)*.9
    d['erase_start']=10.1+(3.8-d['end'])*1.05
    d['erase_end']=d['erase_start']+(d['end']-d['start'])*1.05
windows={0:(.65,1.20),1:(1.25,2.15),2:(1.40,2.00),3:(1.95,2.55),4:(2.35,3.00),
         5:(2.80,3.20),6:(3.15,3.55),7:(3.40,3.80),8:(3.70,4.15),9:(4.05,4.55),10:(4.45,4.95)}
for stage in range(11):
    batch=sorted([u for u in m['units'] if u['stage']==stage],key=lambda u:u['name'])
    a,b=windows[stage]
    for j,u in enumerate(batch):u['start']=a+(b-a)*j/max(1,len(batch)-1);u['duration']=.42
units=sorted(m['units'],key=lambda u:u['start'])
for i,u in enumerate(units):u['out_start']=9.35+(len(units)-1-i)*3.5/(len(units)-1)
cam=s.camera;target=Vector((-.8,.3,2.4));angle0=math.atan2(-43,-27)
for frame in range(1,N+1):
    t=(frame-1)/FPS
    for o,d in zip(curves,m['pen_strokes']):
        draw=max(0,min(1,(t-d['start'])/(d['end']-d['start'])))
        erase=max(0,min(1,(t-d['erase_start'])/(d['erase_end']-d['erase_start'])))
        alpha=1-ramp(t,5.0,5.4)+ramp(t,9.0,9.35)
        o.data.bevel_factor_end=draw*(1-erase);o.data.keyframe_insert('bevel_factor_end',frame=frame)
        o.data.bevel_depth=.028*min(1,alpha);o.data.keyframe_insert('bevel_depth',frame=frame)
        o.hide_render=alpha<.001 or draw==0 or erase>=1;o.keyframe_insert('hide_render',frame=frame)
    for u in units:
        c=s.objects[u['controller']]
        c.location=Vector(u['offset'])*(1-ramp(t,u['start'],u['start']+.42)+ramp(t,u['out_start'],u['out_start']+.42))
        c.keyframe_insert('location',frame=frame)
        alpha=ramp(t,u['start'],u['start']+.08)*(1-ramp(t,u['out_start']+.24,u['out_start']+.42))
        hidden=t<=u['start'] or t>=u['out_start']+.42
        if frame==1 or alpha!=u.get('_alpha') or hidden!=u.get('_hidden'):
            for o in c.children:
                if frame>1 and u.get('_frame',0)<frame-1:
                    o.color=(1,1,1,u['_alpha']);o.keyframe_insert('color',frame=frame-1)
                o.color=(1,1,1,alpha);o.keyframe_insert('color',frame=frame)
                o.hide_render=hidden;o.keyframe_insert('hide_render',frame=frame)
            u['_frame']=frame
        u['_alpha']=alpha;u['_hidden']=hidden
    for o in lights:
        o.data.energy=energies[o.name]*ramp(t,4.8,5.4)*(1-ramp(t,9.0,9.4));o.data.keyframe_insert('energy',frame=frame)
    view=0 if t>=14.25 else ramp(t,5.35,9.25)
    a=angle0+math.radians(85)*view
    cam.location=(target.x+51*math.cos(a),target.y+51*math.sin(a),24-2*view)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=41.5+math.sin(math.pi*view)
    cam.keyframe_insert('location',frame=frame);cam.keyframe_insert('rotation_euler',frame=frame);cam.data.keyframe_insert('ortho_scale',frame=frame)
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    assert fc.data_path not in {'scale','delta_scale'}
                    for k in fc.keyframe_points:k.interpolation='CONSTANT' if fc.data_path=='hide_render' else 'LINEAR'
m.update({'frames':N,'seconds':15,'units':[{k:v for k,v in u.items() if not k.startswith('_')} for u in units],
          'timing_source':'V06 accepted geometry and rigid modules; overlapping retiming only',
          'phases':{'drawing':[.2,3.8],'assembly':[.65,5.37],'orbit':[5.35,9.25],'disassembly':[9.35,13.27],'erasing':[10.1,13.88]}})
(OUT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
s.frame_set(141);bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opai-house-overlap-v07.blend'))
if '--overlap-keys' in sys.argv:
    for f in [29,61,101,141,219,251]:
        s.frame_set(f);s.render.filepath=str(OUT/('key-%03d.png'%f));bpy.ops.render.render(write_still=True)
elif '--overlap-render' in sys.argv:
    (OUT/'frames').mkdir(exist_ok=True);s.render.filepath=str(OUT/'frames/frame-');bpy.ops.render.render(animation=True)
print('V07_OVERLAP_READY',flush=True)
