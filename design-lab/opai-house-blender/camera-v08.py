"""Viewport-only camera-led construction review. Does not invoke rendering."""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector,Quaternion,Matrix
BASE=Path(__file__).resolve().parent;WALL_GATE='--wall-gate' in sys.argv
TREE_LOCK='--tree-lock' in sys.argv or WALL_GATE
TREE_RETREAT='--tree-retreat' in sys.argv or TREE_LOCK
THROUGH_REAR='--through-rear' in sys.argv or TREE_RETREAT
UNDERPASS='--underpass' in sys.argv or THROUGH_REAR
SMOOTH_ARCH='--smooth-arch' in sys.argv
RIGHT_MEDIUM='--right-medium' in sys.argv or SMOOTH_ARCH or UNDERPASS
TREE_FIRST='--tree-first' in sys.argv or RIGHT_MEDIUM
OUT=BASE/('motion-v16' if WALL_GATE else 'motion-v15' if TREE_LOCK else 'motion-v14' if TREE_RETREAT else 'motion-v13' if THROUGH_REAR else 'motion-v12' if UNDERPASS else 'motion-v11' if SMOOTH_ARCH else 'motion-v10' if RIGHT_MEDIUM else 'motion-v09' if TREE_FIRST else 'motion-v08');OUT.mkdir(exist_ok=True)
m=json.loads((BASE/'motion-v07/manifest.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(BASE/'motion-v07/opai-house-overlap-v07.blend'))
s=bpy.context.scene;s.frame_set(141);bpy.context.view_layer.update()
for o in s.objects:
    o.animation_data_clear()
    if o.data and hasattr(o.data,'animation_data_clear'):o.data.animation_data_clear()
for a in list(bpy.data.actions):
    if a.users==0:bpy.data.actions.remove(a)
def ramp(t,a,b):
    v=max(0,min(1,(t-a)/(b-a)));return v*v*(3-2*v)
# Continuous tangents across the route rather than stops at each shot size.
keys=[(0,(-1,-10,2.4),(-1,0,1.0)),(2,(-14,-10,8),(-8,-1,2.6)),
      (4,(-18,5,15),(-8,3,4.5)),(6,(0,18,19),(0,4,4.5)),
      (8.2,(24,10,21),(7,1,4)),(10,(31,-29,25),(0,1,3)),
      (13.9,(14,-48,28),(0,1,2.8)),(15,(14,-48,28),(0,1,2.8))]
if RIGHT_MEDIUM:
    keys[1]=(2,(5,-14,5),(4,-2,2.7))
    keys[2]=(4,(18,-9,9),(8,0,3.4))
    keys[3]=(6,(23,5,13),(8,2,4))
if SMOOTH_ARCH:
    keys[1]=(2,(-1,-8,7),(-1,-3,2.8))
    keys[2]=(4,(4,0,16),(6,0,3.4))
    keys[3]=(6,(16,8,22),(8,2,4))
if UNDERPASS:
    keys= [keys[0],(2,(.5,-6.3,1.8),(4,-3.8,1.9)),
           (3.2,(4.5,-3.8,1.8),(10,-3.8,1.9)),
           (4.8,(10,-3.8,1.8),(15,-3.8,2)),
           (6,(15,-3.8,2.2),(19,0,3)),*keys[4:]]
if THROUGH_REAR:
    keys=[keys[0],(2,(1.2,-5.8,1.8),(1.2,-1,1.9)),
          (3.2,(1.2,0,1.8),(1.2,4,1.9)),(4.6,(1.2,5,1.8),(1.2,9,1.9)),
          (5.6,(1.2,10,2.2),(5,14,3)),(6.8,(13,17,9),(5,5,3.5)),
          (8.2,(24,10,21),(7,1,4)),(10,(31,-29,25),(0,1,3)),
          (13.9,(14,-48,28),(0,1,2.8)),(15,(14,-48,28),(0,1,2.8))]
if TREE_FIRST:
    tree_center=(-1.3171233,-4.2711096,2.592036)
    keys[0]=(0,(-1.3171233,-13,3.0),tree_center)
    keys.insert(1,(1.1,keys[0][1],tree_center))
    if TREE_RETREAT:
        end=Vector(keys[0][1]);toward=(Vector(tree_center)-end).normalized()
        keys[0]=(0,tuple(end+toward*2.5),tree_center)
def spline(t,col):
    if TREE_FIRST and t<=1.1:
        if TREE_RETREAT:return Vector(keys[0][col]).lerp(Vector(keys[1][col]),ramp(t,0,1.1))
        return Vector(keys[0][col])
    i=next((i for i in range(len(keys)-1) if t<=keys[i+1][0]),len(keys)-2)
    a,b=keys[i],keys[i+1];u=max(0,min(1,(t-a[0])/(b[0]-a[0])))
    p,q=Vector(a[col]),Vector(b[col]);before=keys[max(0,i-1)];after=keys[min(len(keys)-1,i+2)]
    v0=(q-Vector(before[col]))/max(.01,b[0]-before[0]);v1=(Vector(after[col])-p)/max(.01,after[0]-a[0])
    if TREE_FIRST and i==1:v0=Vector((0,0,0))
    if UNDERPASS and col==1 and 2<=a[0]<=4.8:
        v0.z=0;v1.z=0
    dt=b[0]-a[0]
    return (2*u**3-3*u*u+1)*p+(u**3-2*u*u+u)*dt*v0+(-2*u**3+3*u*u)*q+(u**3-u*u)*dt*v1
samples=[(.25+i*.05,spline(.25+i*.05,2)) for i in range(150)]
def arrival(center):
    # Reveal wave around the current look-at point, widening as camera pulls out.
    for t,spot in samples:
        delta=center-spot;delta.z*=1.2
        radius=(2.2+t*.15 if t<5.6 else 3.04+(t-5.6)*6) if THROUGH_REAR else 2.2+t*.65
        if delta.length<radius:return t
    if THROUGH_REAR:return 7.4
    return min(samples,key=lambda it:(it[1]-center).length)[0]
def segment_hits(a,b,lo,hi):
    low=0.;high=1.;d=b-a
    for i in range(3):
        if abs(d[i])<1e-8:
            if a[i]<lo[i] or a[i]>hi[i]:return False
        else:
            x=(lo[i]-a[i])/d[i];y=(hi[i]-a[i])/d[i]
            low=max(low,min(x,y));high=min(high,max(x,y))
            if low>high:return False
    return high>.001 and low<.999
for u in m['units']:
    c=s.objects[u['controller']];pts=[o.matrix_world@Vector(p) for o in c.children for p in o.bound_box]
    center=Vector([(min(p[i] for p in pts)+max(p[i] for p in pts))/2 for i in range(3)])
    u['center']=list(center);u['start']=min(7.4,arrival(center)+u['stage']*.045)
    if TREE_FIRST:u['start']=.12 if u['name']=='Courtyard tree and planter' else max(1.2,u['start'])
    if THROUGH_REAR and u['name']!='Courtyard tree and planter':
        # Existing closed surfaces crossing the shot assemble AFTER the camera
        # passes. Preserve the house rather than cutting an invented doorway.
        boxes=[]
        for obj in c.children:
            pp=[obj.matrix_world@Vector(p) for p in obj.bound_box]
            boxes.append(([min(p[i] for p in pp)-.22 for i in range(3)],[max(p[i] for p in pp)+.22 for i in range(3)]))
        for f in range(23,115):
            t=(f-1)/20;p=spline(t,1)
            if any(all(lo[i]<p[i]<hi[i] for i in range(3)) for lo,hi in boxes):u['start']=max(u['start'],t+.3)
        if WALL_GATE:
            # Keep crossed/occluding parts out throughout the tree-facing pass,
            # including camera clearance and the entire line of sight to tree.
            blocked=False
            for f in range(1,138):
                p=spline((f-1)/20,1)
                if any(segment_hits(p,Vector(tree_center),lo,hi) for lo,hi in boxes):
                    blocked=True;break
            if blocked:
                u['start']=max(u['start'],6.95);u['camera_clearance_delayed']=True
    u['duration']=.5
units=sorted(m['units'],key=lambda u:u['start'])
for i,u in enumerate(units):u['out_start']=10.3+(len(units)-1-i)*3.05/(len(units)-1)
curves=[s.objects['V06 · ink %02d %s'%(i,d['name'])] for i,d in enumerate(m['pen_strokes'])]
strokes=[]
for o,d in zip(curves,m['pen_strokes']):
    pts=[Vector(p.co[:3]) for p in o.data.splines[0].points];center=sum(pts,Vector())/len(pts)
    strokes.append((arrival(center),o,d))
strokes.sort(key=lambda item:item[0]);cursor=1.15 if TREE_FIRST else .05
for _,o,d in strokes:
    duration=.16;start=max(cursor, min(6.8,arrival(sum((Vector(p.co[:3]) for p in o.data.splines[0].points),Vector())/len(o.data.splines[0].points))-.45))
    d.update({'start':start,'end':start+duration});cursor=start+duration
for j,(_,o,d) in enumerate(strokes):d.update({'erase_start':10.6+(len(strokes)-1-j)*.145,'erase_end':10.6+(len(strokes)-1-j)*.145+.145})
guides=bpy.data.collections.new('V08 REVIEW ONLY - camera path and hotspot');s.collection.children.link(guides)
guides.hide_render=True
def guide_curve(name,points,color):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';sp=data.splines.new('POLY');sp.points.add(len(points)-1)
    for p,xyz in zip(sp.points,points):p.co=(*xyz,1)
    o=bpy.data.objects.new(name,data);guides.objects.link(o);o.color=(*color,1);o.show_in_front=True;o.hide_render=True
    return o
guide_curve('CAMERA PATH - near / medium / wide',[spline(i*.05,1) for i in range(279)],(.2,.6,1))
guide_curve('LOOK TARGET PATH - assembly hotspot',[spline(i*.05,2) for i in range(160)],(1,.35,.08))
hot=bpy.data.objects.new('ASSEMBLY HOTSPOT - follows camera gaze',None);guides.objects.link(hot)
hot.empty_display_type='SPHERE';hot.empty_display_size=2.5;hot.show_in_front=True;hot.hide_render=True
for name,t in [('01 NEAR courtyard',.8),('02 MEDIUM right facade' if RIGHT_MEDIUM else '02 RISE left to roof',4),('03 ARC right wing',8.2),('04 WIDE whole house',10)]:
    o=bpy.data.objects.new(name,None);guides.objects.link(o);o.location=spline(t,1);o.empty_display_type='CUBE';o.empty_display_size=.45;o.show_name=True;o.show_in_front=True;o.hide_render=True
cam=s.camera;cam.data.type='PERSP';cam.data.lens=32;cam.data.clip_start=.1;cam.data.clip_end=500;cam.data.dof.use_dof=False;cam.data.passepartout_alpha=1
cam.rotation_mode='QUATERNION';cam.show_in_front=True
previous=None
for f in range(1,301):
    t=(f-1)/20;pos=spline(t,1);look=spline(t,2)
    build_look=look.copy()
    if TREE_LOCK:look=Vector(tree_center).lerp(look,ramp(t,6.8,8.2))
    if t>=14.3:pos=spline(0,1);look=spline(0,2)
    cam.location=pos;q=(look-pos).to_track_quat('-Z','Y')
    if UNDERPASS:
        forward=(look-pos).normalized();right=forward.cross(Vector((0,0,1))).normalized()
        up=right.cross(forward).normalized();q=Matrix((right,up,-forward)).transposed().to_quaternion()
    elif SMOOTH_ARCH and previous and t<14.3:
        forward=(look-pos).normalized();up=previous@Vector((0,1,0))
        right=forward.cross(up).normalized();up=right.cross(forward).normalized()
        q=Matrix((right,up,-forward)).transposed().to_quaternion()
    if previous and q.dot(previous)<0:q.negate()
    cam.rotation_quaternion=q;previous=q.copy();cam.keyframe_insert('location',frame=f);cam.keyframe_insert('rotation_quaternion',frame=f)
    hot.location=build_look;hot.keyframe_insert('location',frame=f)
    for _,o,d in strokes:
        draw=max(0,min(1,(t-d['start'])/.16));erase=max(0,min(1,(t-d['erase_start'])/.145))
        o.data.bevel_factor_end=draw*(1-erase);o.data.keyframe_insert('bevel_factor_end',frame=f)
        hidden=draw==0 or erase>=1 or 8<t<10.2
        o.hide_render=hidden;o.hide_viewport=hidden;o.keyframe_insert('hide_render',frame=f);o.keyframe_insert('hide_viewport',frame=f)
        o.data.bevel_depth=.028;o.color=(.005,.005,.005,1)
    for u in units:
        c=s.objects[u['controller']];c.location=Vector(u['offset'])*(1-ramp(t,u['start'],u['start']+.5)+ramp(t,u['out_start'],u['out_start']+.5));c.keyframe_insert('location',frame=f)
        alpha=ramp(t,u['start'],u['start']+.08)*(1-ramp(t,u['out_start']+.32,u['out_start']+.5));hidden=t<=u['start'] or t>=u['out_start']+.5
        if f==1 or alpha!=u.get('_alpha') or hidden!=u.get('_hidden'):
            for o in c.children:
                if f>1 and u.get('_frame',0)<f-1:o.color=(1,1,1,u['_alpha']);o.keyframe_insert('color',frame=f-1)
                o.color=(1,1,1,alpha);o.keyframe_insert('color',frame=f)
                o.hide_render=hidden;o.hide_viewport=hidden;o.keyframe_insert('hide_render',frame=f);o.keyframe_insert('hide_viewport',frame=f)
            u['_frame']=f
        u['_alpha']=alpha;u['_hidden']=hidden
# Viewport glass uses wire display so Solid preview does not turn glazing opaque.
for name in m['source_matrices']:
    o=s.objects[name]
    if any(mat and 'glass' in mat.name.lower() for mat in o.data.materials):o.display_type='WIRE'
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    assert fc.data_path not in {'scale','delta_scale'}
                    for k in fc.keyframe_points:k.interpolation='CONSTANT' if fc.data_path.startswith('hide_') else 'LINEAR'
s.timeline_markers.clear()
for name,t in [('NEAR + BUILD',.8),('MEDIUM RIGHT' if RIGHT_MEDIUM else 'MEDIUM WEST',4 if RIGHT_MEDIUM else 3),('MEDIUM EAST',6),('WIDE COMPLETE',8.3),('DISASSEMBLE',10.3),('LOOP RESET',14.3)]:s.timeline_markers.new(name,frame=round(t*20)+1)
s.sync_mode='FRAME_DROP';s.frame_set(167);bpy.context.view_layer.update()
for name,d in m['source_matrices'].items():
    o=s.objects[name];assert not o.hide_viewport and not o.hide_render
    assert all(abs(o.matrix_world[i][j]-d['matrix'][i][j])<1e-5 for i in range(4) for j in range(4)),name
# Save a useful opening view; GUI setup splits this into camera and path views.
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.shading.type='SOLID';a.spaces.active.shading.color_type='MATERIAL';a.spaces.active.region_3d.view_perspective='CAMERA'
            a.spaces.active.overlay.show_overlays=False
m.update({'units':[{k:v for k,v in u.items() if not k.startswith('_')} for u in units],'camera_keys':keys,'camera_lens_mm':32,'viewport_only':True,'rendered':False,'hotspot_rule':'First proximity of look-at point to unit bounding center; widening radius as shot pulls out; minor stage offset'})
(OUT/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/('opai-wall-gate-v16.blend' if WALL_GATE else 'opai-tree-lock-v15.blend' if TREE_LOCK else 'opai-tree-retreat-v14.blend' if TREE_RETREAT else 'opai-through-rear-v13.blend' if THROUGH_REAR else 'opai-underpass-v12.blend' if UNDERPASS else 'opai-smooth-arch-v11.blend' if SMOOTH_ARCH else 'opai-right-medium-v10.blend' if RIGHT_MEDIUM else 'opai-tree-first-v09.blend' if TREE_FIRST else 'opai-camera-hotspot-v08.blend')))
(OUT/'verification.json').write_text(json.dumps({'passed':True,'complete_v04_world_matrices':True,'render_calls':0,'frames':300,'perspective_camera':True,'guides_hidden_in_render':True},indent=2))
print('V08_SAVED_NO_RENDER',flush=True)
