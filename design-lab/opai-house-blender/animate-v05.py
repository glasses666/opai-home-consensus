"""V04 complete house: ink plan -> raised frame -> solid -> orbit -> retract.

Render a 16-second local motion study, preserving V04 as the still-model source.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
DEST=OUT/'motion-v05';DEST.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(OUT/'opai-interiors-v04.blend'))
s=bpy.context.scene;root=bpy.data.objects['V02 · video reference courtyard residence']
FPS=20;N=320;GROUND=-.385
s.render.fps=FPS;s.frame_start=1;s.frame_end=N
s.render.resolution_x=960;s.render.resolution_y=540;s.render.resolution_percentage=100
s.cycles.samples=12;s.cycles.use_denoising=True;s.cycles.use_adaptive_sampling=True
s.cycles.adaptive_threshold=.14;s.cycles.max_bounces=7;s.cycles.transmission_bounces=6
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
s.render.image_settings.color_depth='8';s.render.film_transparent=False

def ease(t):
    t=max(0,min(1,t));return t*t*(3-2*t)
def ramp(t,a,b):return ease((t-a)/(b-a))
def desc(o):
    p=o.parent
    while p:
        if p==root:return True
        p=p.parent
    return False
solids=[o for o in s.objects if o.type in {'MESH','CURVE'} and desc(o)]

# Sparse architectural skeleton: one center-line per slender frame, major slab
# contours and mullion axes, rather than a triangulated wireframe of furniture.
ink=bpy.data.materials.new('V05 · graphite architectural ink');ink.use_nodes=True
p=next(n for n in ink.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
p.inputs['Base Color'].default_value=(.009,.008,.007,1);p.inputs['Roughness'].default_value=.86
wire_root=bpy.data.objects.new('V05 · rising architectural skeleton',None);s.collection.objects.link(wire_root)
segments={}
def add(a,b):
    a=tuple(round(float(v),3) for v in a);b=tuple(round(float(v),3) for v in b)
    if (Vector(a)-Vector(b)).length<.08:return
    key=tuple(sorted((a,b)));segments[key]=(a,b)

for o in solids:
    name=o.name.lower()
    if o.type!='MESH' or o.name.startswith(('V03','V04')):continue
    if any(k in name for k in ['mullion','facade pier','patio column','stone jamb']):
        pts=[o.matrix_world@v.co for v in o.data.vertices]
        lo=Vector([min(p[i] for p in pts) for i in range(3)])
        hi=Vector([max(p[i] for p in pts) for i in range(3)])
        mid=(lo+hi)/2;axis=max(range(3),key=lambda i:hi[i]-lo[i]);a=mid.copy();b=mid.copy()
        a[axis]=lo[axis];b[axis]=hi[axis];add(a,b)
    elif any(k in name for k in ['floor','structural slab','complete joined roof','stone plinth','enclosed back','courtyard wall','upper outer wall']):
        # Top outline only for slabs; walls also keep their vertical edges.
        pts=[o.matrix_world@v.co for v in o.data.vertices];top=max(p.z for p in pts)
        wall=any(k in name for k in ['wall','back'])
        for e in o.data.edges:
            a,b=[pts[i] for i in e.vertices]
            if wall or (abs(a.z-top)<.025 and abs(b.z-top)<.025):add(a,b)

curves=[]
for i,(a,b) in enumerate(segments.values()):
    c=bpy.data.curves.new('V05 · ink segment','CURVE');c.dimensions='3D';c.bevel_depth=.024;c.bevel_resolution=2
    sp=c.splines.new('POLY');sp.points.add(1);sp.points[0].co=(*a,1);sp.points[1].co=(*b,1)
    o=bpy.data.objects.new('V05 · structure stroke %03d'%i,c);s.collection.objects.link(o);o.parent=wire_root;c.materials.append(ink)
    curves.append(o)

cam=s.camera;target=Vector((-.8,.3,2.4));base_angle=math.atan2(-43,-27);radius=51
lights=[o for o in s.objects if o.type=='LIGHT' and ('ceiling' in o.name.lower() or o.name.startswith('V04'))]
for o in lights:
    if not o.parent:o.parent=root
energies={o.name:o.data.energy for o in lights}
states=[]
for frame in range(1,N+1):
    t=(frame-1)/FPS
    # Flattened ink grows to its exact 3D heights, then becomes a quiet guide.
    wire_z=.003+.997*ramp(t,1.1,3.7)*(1-ramp(t,12.8,14.6))
    wire_root.scale=(1,1,wire_z);wire_root.location.z=GROUND*(1-wire_z)
    wire_root.keyframe_insert('scale',frame=frame);wire_root.keyframe_insert('location',frame=frame)
    thickness=(1-ramp(t,4.0,5.0))+ramp(t,10.55,11.35)
    thickness=min(1,thickness)
    for i,o in enumerate(curves):
        # Short, staggered drafting sweep from left to right.
        x=(segments[list(segments)[i]][0][0]+13)/27
        draw=ramp(t,.3+x*.36,1.50+x*.36)
        erase=ramp(t,14.55+x*.25,15.65+x*.25)
        o.data.bevel_factor_end=max(0,draw*(1-erase))
        o.data.bevel_depth=.024*thickness
        o.data.keyframe_insert('bevel_factor_end',frame=frame);o.data.keyframe_insert('bevel_depth',frame=frame)
        o.hide_render=t<.25 or t>=15.9 or thickness<.001
        o.keyframe_insert('hide_render',frame=frame)
    solid_z=max(.0001,ramp(t,2.65,5.05)*(1-ramp(t,10.9,12.75)))
    root.scale=(.985+.015*solid_z,.985+.015*solid_z,solid_z)
    root.location.z=GROUND*(1-solid_z)
    root.keyframe_insert('scale',frame=frame);root.keyframe_insert('location',frame=frame)
    visible=2.65<t<12.75
    if frame in (1,55,256,N):
        for o in solids:
            o.hide_render=not visible;o.keyframe_insert('hide_render',frame=frame)
    for o in lights:
        o.data.energy=energies[o.name]*solid_z if visible else 0;o.data.keyframe_insert('energy',frame=frame)
    # A 100-degree courtyard-facing arc, no sudden polar crossing or 360 back-wall shot.
    orbit=ramp(t,4.7,11.0);angle=base_angle+math.radians(100)*orbit
    # Reset the camera only after the architecture is fully gone.
    view_orbit=0 if t>15.85 else orbit
    if t>15.85:angle=base_angle
    cam.location=(target.x+radius*math.cos(angle),target.y+radius*math.sin(angle),24-2*view_orbit)
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=40.5+1.5*math.sin(math.pi*view_orbit)
    cam.keyframe_insert('location',frame=frame);cam.keyframe_insert('rotation_euler',frame=frame)
    cam.data.keyframe_insert('ortho_scale',frame=frame)
    states.append({'frame':frame,'t':round(t,2),'solid_z':solid_z,'wire_z':wire_z,'solids_visible':visible,'orbit_deg':100*orbit})

# Dense sampled keys preserve a reproducible easing curve in Blender without callbacks.
# Linear interpolation between 20 fps samples avoids Bezier overshoot.
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:k.interpolation='CONSTANT' if fc.data_path=='hide_render' else 'LINEAR'
s.frame_set(161)
bpy.ops.wm.save_as_mainfile(filepath=str(DEST/'opai-house-motion-v05.blend'))
(DEST/'manifest.json').write_text(json.dumps({'source':'../opai-interiors-v04.blend','builder':'../animate-v05.py',
    'fps':FPS,'frames':N,'seconds':N/FPS,'size':[960,540],'samples':12,'wire_segments':len(curves),
    'solid_objects':len(solids),'orbit_degrees':100,'stages':{
    '0–1.9s':'black plan draws on ground','1.1–3.7s':'ink frame rises','2.65–5.05s':'solid house grows into frame',
    '4.7–11s':'courtyard-facing orbit','10.9–12.75s':'solid returns to ground','12.8–14.6s':'wire collapses to plan',
    '14.55–16s':'plan erases; blank loop join'},'states':states,
    'limits':['Timing/geometry preview, not final render','100 degree arc, not full 360 orbit','No homepage replacement or deployment']},ensure_ascii=False,indent=2))
if '--motion-keys' in sys.argv:
    for frame in [1,26,60,86,141,206,239,278,306,320]:
        s.frame_set(frame);s.render.filepath=str(DEST/('key-%03d.png'%frame));bpy.ops.render.render(write_still=True)
elif '--motion-render' in sys.argv:
    s.render.filepath=str(DEST/'frames'/'frame-');(DEST/'frames').mkdir(exist_ok=True)
    bpy.ops.render.render(animation=True)
print('MOTION_V05_READY',flush=True)
