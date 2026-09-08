"""Sequential pen strokes + rigid modular construction, never whole-house scaling."""
import bpy, math, re, json, sys
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent;DEST=OUT/'motion-v06';DEST.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(OUT/'opai-interiors-v04.blend'))
s=bpy.context.scene;root=s.objects['V02 · video reference courtyard residence']
FPS=20;N=480
s.render.fps=FPS;s.frame_start=1;s.frame_end=N
s.render.resolution_x=960;s.render.resolution_y=540;s.render.resolution_percentage=100
s.cycles.samples=8;s.cycles.use_denoising=True;s.cycles.adaptive_threshold=.17
s.cycles.max_bounces=8;s.cycles.transmission_bounces=6;s.cycles.transparent_max_bounces=12
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.color_depth='8'
def ease(v):
    v=max(0,min(1,v));return v*v*(3-2*v)
def ramp(t,a,b):return ease((t-a)/(b-a))
def ancestor(o):
    p=o
    furniture=None
    while p and p!=root:
        if p.type=='EMPTY' and p.name.startswith('V04'):furniture=p
        p=p.parent
    return (p==root,furniture)
solids=[o for o in s.objects if o.type in {'MESH','CURVE'} and ancestor(o)[0]]
base={o.name:{'matrix':[list(r) for r in o.matrix_world],'scale':list(o.scale)} for o in solids}

# Continuous strokes. Each stroke is written to completion before the next.
# These are fixed-size 3D curves: only curve length is revealed, never scale.
paths=[]
def stroke(name,pts):paths.append((name,pts))
def rect(name,x0,x1,y0,y1,z):stroke(name,[(x0,y0,z),(x1,y0,z),(x1,y1,z),(x0,y1,z),(x0,y0,z)])
rect('West footprint',-12.4,-4.8,-5.3,6.8,-.36)
rect('East footprint',3.4,12.6,-6.8,6.8,-.36)
rect('Rear link footprint',-4.8,3.4,2.2,6.8,-.36)
rect('Courtyard footprint',-4.8,3.4,-6.8,2.2,-.36)
# A continuous inverted U reads as two uprights and a beam being sketched.
for name,x0,x1,y,z0,z1 in [
 ('West front columns',-12.14,-5.04,-4.98,-.36,3.55),
 ('East patio columns',4,12,-5.05,-.36,3.55),
 ('Tall stone bay',-6.94,-3.66,-3.24,-.36,7.0),
 ('West rear frame',-12.1,-5.0,6.6,-.36,7.0),
 ('East rear frame',3.65,12.35,6.55,-.36,7.0)]:
    stroke(name,[(x0,y,z0),(x0,y,z1),(x1,y,z1),(x1,y,z0)])
rect('West terrace floor',-12.4,-4.8,-5.3,6.8,3.55)
rect('East suspended floor',3.3,12.7,-5.3,6.8,3.55)
rect('Rear upper floor',-4.85,4.45,2.225,7.075,3.55)
rect('Central roof outline',-.775,3.575,-1.425,2.725,3.56)
for name,x0,x1,y,z0,z1 in [
 ('West upper facade',-12.1,-5.0,.67,3.55,7),
 ('East upper facade',3.65,12.35,-4.22,3.55,7),
 ('Rear corridor',-4.6,4.3,2.34,3.55,7),
 ('West low front glazing',-12.1,-5.0,-5.08,-.36,3.38),
 ('East ground glazing',3.65,12.35,-2.4,-.36,3.38)]:
    stroke(name,[(x0,y,z0),(x0,y,z1),(x1,y,z1),(x1,y,z0)])
stroke('West joined roof',[(-12.425,.3,7),(-7.11,.3,7),(-7.11,-3.59,7),(-3.49,-3.59,7),
       (-3.49,2.29,7),(-4.775,2.29,7),(-4.775,6.9,7),(-12.425,6.9,7),(-12.425,.3,7)])
rect('Rear roof',-5.05,4.65,2.19,7.11,7)
rect('East roof',3.3,12.7,-4.82,6.98,7)
rect('East roof cap',3.3,12.7,4.4,6.9,7.18)
ink=bpy.data.materials.new('V06 · black pen');ink.use_nodes=True
p=next(n for n in ink.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
p.inputs['Base Color'].default_value=(.004,.004,.004,1);p.inputs['Roughness'].default_value=.88
curves=[];schedule=[]
# Length-proportional timing with a minimum interval for short strokes.
lengths=[sum((Vector(b)-Vector(a)).length for a,b in zip(pts,pts[1:])) for _,pts in paths]
weights=[math.sqrt(v) for v in lengths];cursor=.30
for i,((name,pts),weight) in enumerate(zip(paths,weights)):
    duration=4.0*weight/sum(weights)
    c=bpy.data.curves.new('V06 · '+name,'CURVE');c.dimensions='3D';c.bevel_depth=.028;c.bevel_resolution=2
    sp=c.splines.new('POLY');sp.points.add(len(pts)-1)
    for v,xyz in zip(sp.points,pts):v.co=(*xyz,1)
    o=bpy.data.objects.new('V06 · ink %02d %s'%(i,name),c);s.collection.objects.link(o);c.materials.append(ink)
    curves.append(o);schedule.append({'name':name,'start':cursor,'end':cursor+duration})
    cursor+=duration

# A short material fade softens the first/last few frames of each incoming part;
# rigid translation, not opacity or scale, supplies the assembly motion.
for m in {mat for o in solids for mat in o.data.materials if mat and mat.use_nodes}:
    nt=m.node_tree;out=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL' and n.is_active_output)
    if not out.inputs['Surface'].is_linked:continue
    original=out.inputs['Surface'].links[0].from_socket
    transparent=nt.nodes.new('ShaderNodeBsdfTransparent');mix=nt.nodes.new('ShaderNodeMixShader')
    info=nt.nodes.new('ShaderNodeObjectInfo')
    nt.links.new(info.outputs['Alpha'],mix.inputs[0]);nt.links.new(transparent.outputs[0],mix.inputs[1])
    nt.links.new(original,mix.inputs[2]);nt.links.new(mix.outputs[0],out.inputs['Surface'])

# Semantic construction modules: furniture stays assembled internally, facade
# bays and roof panels are distinct pieces; shared tree leaves travel together.
units={}
def assign(o,key,stage):
    unit=units.setdefault(key,{'members':[],'stage':stage})
    unit['members'].append(o)
def clean(n):return re.sub(r'\.\d+$','',n)
for o in solids:
    n=o.name;low=n.lower();_,furn=ancestor(o)
    if furn:
        assign(o,furn.name,3 if furn.location.z<2 else 7);continue
    z=o.matrix_world.translation.z
    if n.startswith('V03 · olive') or any(k in low for k in ['courtyard olive','fine branch','tree soil','tree limestone','planter pebble']):
        assign(o,'Courtyard tree and planter',10)
    elif 'plinth' in low or (('floor' in low) and 'upper' not in low):assign(o,clean(n),0)
    elif any(k in low for k in ['lower back','lower rear','enclosed back','limestone return','stone jamb','facade pier','patio column']) or clean(n)=='Tall bay courtyard wall':assign(o,clean(n),1)
    elif any(k in low for k in ['upper floor','terrace roof continuous slab','central projecting roof']):assign(o,clean(n),5)
    elif any(k in low for k in ['upper outer wall','upper rear']):assign(o,clean(n),6)
    elif any(k in low for k in ['complete joined roof','complete roof','pavilion roof','roof cap','roof finish joint']):
        key=re.split(r' continuous roof| structural slab| parapet| perimeter parapet',clean(n))[0]
        if n.startswith('V03'):key='Roof finishing joints'
        assign(o,key,9)
    elif any(k in low for k in [' glass ',' mullion ',' edge','glazing track','door handle','handle mounting']):
        # One finished window/railing bay per facade, not every screw in isolation.
        key=re.split(r' glass | mullion | edge',clean(n))[0]
        assign(o,key,4 if z<3.4 else 8)
    elif any(k in low for k in [' fin ','screen','soffit','trough','sheer curtain','curtain ceiling']):
        assign(o,re.sub(r' fin \d+$','',clean(n)),10)
    elif any(k in low for k in ['paver','path','terrace boards','balcony oak deck','flat roof paving']):assign(o,clean(n),2 if z<2 else 8)
    elif n.startswith('V04'):
        # Standalone rugs, bindings, pendants sit outside furniture empty groups.
        side='west' if o.matrix_world.translation.x<0 else 'east'
        assign(o,'%s %s room finishing'%(side,'upper' if z>3.4 else 'lower'),7 if z>3.4 else 3)
    else:assign(o,'Architectural finishing '+('upper' if z>3.4 else 'lower'),10)

# Time windows overlap slightly between nearby pieces, while the construction
# hierarchy remains foundations -> support -> storeys -> glazing -> roof.
windows={0:(4.25,4.9),1:(4.8,5.8),2:(5.0,5.65),3:(5.45,6.2),4:(5.9,6.85),
         5:(6.7,7.3),6:(7.15,7.8),7:(7.5,8.15),8:(8.0,8.8),9:(8.75,9.6),10:(9.35,10.35)}
ordered=[]
for stage in range(11):
    batch=sorted([(key,u) for key,u in units.items() if u['stage']==stage],key=lambda it:it[0])
    a,b=windows[stage]
    for j,(key,u) in enumerate(batch):
        control=bpy.data.objects.new('V06 · assembly '+key,None);s.collection.objects.link(control);control.parent=root
        # New controller starts at identity. Preserve every original world matrix.
        for o in u['members']:
            world=o.matrix_world.copy();o.parent=control;o.matrix_world=world
        u.update({'name':key,'control':control,'start':a+(b-a)*j/max(1,len(batch)-1),'duration':.52})
        # Smaller items arrive from one side; slabs/walls visibly seat from above.
        u['offset']=Vector((0,0,1.4 if stage in [0,1,5,6,9] else .75))
        if stage in [4,8]:u['offset']=Vector((.75 if sum(o.matrix_world.translation.x for o in u['members'])>0 else -.75,-.65,.25))
        ordered.append(u)
ordered.sort(key=lambda u:u['start'])
for idx,u in enumerate(ordered):u['out_start']=16.0+(len(ordered)-1-idx)*4.0/max(1,len(ordered)-1)

cam=s.camera;target=Vector((-.8,.3,2.4));base_angle=math.atan2(-43,-27);radius=51
lights=[o for o in s.objects if o.type=='LIGHT' and ('ceiling' in o.name.lower() or o.name.startswith('V04'))]
energies={o.name:o.data.energy for o in lights}
for frame in range(1,N+1):
    t=(frame-1)/FPS
    for o,seg in zip(curves,schedule):
        # Constant-speed pen within each stroke, sequential (never concurrent).
        draw=max(0,min(1,(t-seg['start'])/(seg['end']-seg['start'])))
        # Reverse top-to-bottom erasing ends at the original ground plan.
        erase_start=20.6+(4.30-seg['end'])*.70
        erase_duration=(seg['end']-seg['start'])*.70
        erase=max(0,min(1,(t-erase_start)/erase_duration))
        o.data.bevel_factor_end=draw*(1-erase);o.data.keyframe_insert('bevel_factor_end',frame=frame)
        # Skeleton goes quiet only while the complete house is on display.
        alpha=(1-ramp(t,10.4,10.9))+ramp(t,15.7,16.1)
        o.hide_render=alpha<.001 or draw==0 or erase>=1
        o.keyframe_insert('hide_render',frame=frame)
        o.data.bevel_depth=.028*min(1,alpha);o.data.keyframe_insert('bevel_depth',frame=frame)
    for u in ordered:
        arrival=ramp(t,u['start'],u['start']+u['duration'])
        departure=ramp(t,u['out_start'],u['out_start']+.52)
        u['control'].location=u['offset']*((1-arrival)+departure)
        u['control'].keyframe_insert('location',frame=frame)
        alpha=ramp(t,u['start'],u['start']+.10)*(1-ramp(t,u['out_start']+.30,u['out_start']+.52))
        hidden=t<=u['start'] or t>=u['out_start']+.52
        # Only changed alpha/visibility need keys, not 480 duplicate hold keys.
        if frame==1 or alpha!=u.get('last_alpha') or hidden!=u.get('last_hidden'):
            for o in u['members']:
                if frame>1 and u.get('last_key_frame',0)<frame-1:
                    o.color=(1,1,1,u['last_alpha']);o.keyframe_insert('color',frame=frame-1)
                o.color=(1,1,1,alpha);o.keyframe_insert('color',frame=frame)
                o.hide_render=hidden;o.keyframe_insert('hide_render',frame=frame)
            u['last_key_frame']=frame
        u['last_alpha']=alpha;u['last_hidden']=hidden
    for o in lights:
        o.data.energy=energies[o.name]*ramp(t,10.0,10.9)*(1-ramp(t,15.8,16.2))
        o.data.keyframe_insert('energy',frame=frame)
    orbit=ramp(t,10.9,15.8);view=0 if t>23.5 else orbit
    angle=base_angle+math.radians(85)*view
    cam.location=(target.x+radius*math.cos(angle),target.y+radius*math.sin(angle),24-2*view)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=41.5+math.sin(math.pi*view)
    cam.keyframe_insert('location',frame=frame);cam.keyframe_insert('rotation_euler',frame=frame);cam.data.keyframe_insert('ortho_scale',frame=frame)
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    assert fc.data_path not in {'scale','delta_scale'},'No object scale animation permitted'
                    for k in fc.keyframe_points:k.interpolation='CONSTANT' if fc.data_path=='hide_render' else 'LINEAR'
s.frame_set(241);bpy.context.view_layer.update()
for o in solids:
    assert all(abs(o.matrix_world[i][j]-base[o.name]['matrix'][i][j])<1e-5 for i in range(4) for j in range(4)),o.name
assert tuple(root.scale)==(1,1,1)
bpy.ops.wm.save_as_mainfile(filepath=str(DEST/'opai-house-assembly-v06.blend'))
(DEST/'manifest.json').write_text(json.dumps({'source':'../opai-interiors-v04.blend','fps':FPS,'frames':N,'seconds':N/FPS,
    'size':[960,540],'samples':8,'pen_strokes':schedule,'units':[{'name':u['name'],'stage':u['stage'],'count':len(u['members']),
    'controller':u['control'].name,'start':u['start'],'duration':u['duration'],'out_start':u['out_start'],'offset':list(u['offset'])} for u in ordered],
    'solid_count':len(solids),'source_matrices':base,'no_scale_animation':True,'complete_model_preserved':True,
    'limitations':['Choreographed construction illustration, not a construction engineering schedule','Motion proof, not final image quality','Local only; no homepage replacement']},ensure_ascii=False,indent=2))
if '--assembly-keys' in sys.argv:
    for frame in [12,29,57,85,104,125,145,171,199,241,329,371,414,451,480]:
        s.frame_set(frame);s.render.filepath=str(DEST/('key-%03d.png'%frame));bpy.ops.render.render(write_still=True)
elif '--assembly-render' in sys.argv:
    (DEST/'frames').mkdir(exist_ok=True);s.render.filepath=str(DEST/'frames/frame-');bpy.ops.render.render(animation=True)
print('V06_ASSEMBLY_READY',flush=True)
