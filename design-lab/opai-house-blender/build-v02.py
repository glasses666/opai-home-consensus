"""Reference-video proportions: broad courtyard house, not scaled compact V01.

Visible massing matched to villa-hero-loop.mp4 at 10.8s. Hidden surfaces inferred.
"""
import sys
from pathlib import Path
OUT=Path(__file__).resolve().parent
sys.path.insert(0,str(OUT))
from house_kit import *

root.name='V02 · video reference courtyard residence'
root['source_frame']='reference/video-10p8s.png'
root['source_limits']='Visible massing study. Metre dimensions are modelling assumptions, not measured video facts.'
root['review_status']='User review pending; no animation or homepage replacement'

def floor(name,x,y,z,w,d):
    box(name,(x,y,z),(w,d,.28),plaster,.025)

def pier(name,x,y,z,h,w=.3):
    box(name,(x,y,z+h/2),(w,.38,h),stone,.016)

def front_screen(name,x,y,z,w,h):
    n=round(w/.20)
    for i in range(n):
        box(name+' fin '+str(i),(x-w/2+.10+i*.20,y,z+h/2),(.064,.29,h),wood,.009)

def terrace_tiles(name,x,y,z,w,d,wooden=False):
    nx=max(1,round(w/(.2 if wooden else 1.15)))
    ny=1 if wooden else max(1,round(d/1.15))
    sx,sy=w/nx,d/ny
    for i in range(nx):
        for j in range(ny):
            box(name,(x-w/2+(i+.5)*sx,y-d/2+(j+.5)*sy,z),
                (sx-.009,sy-.009,.04),wood if wooden else tile,.003)

def solid_back(name,x,y,z,w,h):
    box(name,(x,y,z+h/2),(w,.24,h),plaster,.015)

def stone_panel_wall(name,x,y,z,w,h,side=False):
    # Fine-jointed limestone at the solid courtyard pier, not large blank white blocks.
    cols=max(1,round(w/1.5));rows=max(1,round(h/.80))
    for c in range(cols):
        for r in range(rows):
            off=-w/2+(c+.5)*w/cols
            box(name,(x if side else x+off,y+off if side else y,z+(r+.5)*h/rows),
                (.24,w/cols-.006,h/rows-.006) if side else (w/cols-.006,.24,h/rows-.006),stone,.003)

def joined_roof(name, outline, z):
    # A single closed concave mesh avoids coplanar roof intersections at the tall bay.
    n=len(outline)
    verts=[(x,y,z+dz) for dz in [-.12,.12] for x,y in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);scene.collection.objects.link(ob);ob.parent=root
    ob.data.materials.append(plaster)
    mod=ob.modifiers.new('Roof edge softening','BEVEL');mod.width=.012;mod.segments=2
    ob.modifiers.new('Roof normals','WEIGHTED_NORMAL')
    for i,a in enumerate(outline):
        b=outline[(i+1)%n];dx,dy=b[0]-a[0],b[1]-a[1]
        edge=box(name+' perimeter parapet',((a[0]+b[0])/2,(a[1]+b[1])/2,z+.26),
            ((dx*dx+dy*dy)**.5,.13,.35),stone,.009)
        edge.rotation_euler.z=math.atan2(dy,dx)

# Courtyard-based footprint: 25m broad x 14m deep modelling envelope.
# Three separate plinths keep the open forecourt legible rather than one solid slab.
box('West wing stone plinth',(-8.4,.5,-.19),(8,13.2,.38),tile,.035)
box('Central courtyard plinth',(-.1,-.3,-.19),(9.4,13.0,.38),tile,.035)
box('East wing stone plinth',(8.35,-.15,-.19),(10.3,14.7,.38),tile,.035)
floor('West lower floor',-8.6,.8,.10,7.2,11.8)
floor('East lower floor',8.0,2.1,.10,8.8,9.2)
floor('Rear connecting floor',-.25,4.7,.10,9.5,4.4)

# LEFT: lower glazed pavilion, roof garden, taller recessed rear wing.
solid_back('West lower back',-8.6,6.60,.24,7.2,3.16)
glazing('West pavilion front',-8.6,-5.08,.24,7.0,3.14)
glazing('West outer side',-12.18,.8,.24,11.55,3.14,True)
glazing('West courtyard edge',-5.01,-.10,.24,9.70,3.14,True)
for x in [-12.14,-5.04]:pier('West ground facade pier',x,-4.98,.24,3.2,.30)
floor('West terrace roof continuous slab',-8.6,.8,3.55,7.6,12.2)
terrace_tiles('West wood terrace boards',-9.55,-3.0,3.73,5.0,3.55,True)
glazing('West terrace glass front',-9.50,-4.98,3.73,5.15,1.0)
glazing('West terrace glass side',-12.10,-2.95,3.73,4.1,1.0,True)

solid_back('West upper rear',-8.55,6.58,3.73,7.15,3.14)
box('West upper outer wall',(-12.06,3.6,5.30),(.24,6.0,3.14),stone,.018)
glazing('West upper front',-8.55,.67,3.73,6.97,3.14)
glazing('West upper court',-5.03,3.6,3.73,5.67,3.14,True)
box('West upper oak soffit',(-8.55,.55,6.83),(7.15,.55,.09),wood,.01)
front_screen('West rear screen',-5.95,.52,3.76,1.4,3.08)

# LEFT FRONT: narrow, full-height stone-framed timber bay, exactly the source's visual anchor.
floor('Tall bay upper floor',-5.3,-.65,3.55,3.3,5.5)
glazing('Tall bay lower glazing',-5.3,-3.30,.24,2.92,3.14)
glazing('Tall bay upper glazing',-5.3,-3.30,3.73,2.92,3.14)
for x in [-6.94,-3.66]:
    box('Tall bay full height stone jamb',(x,-3.24,3.51),(.32,.46,6.66),stone,.016)
box('Tall bay courtyard wall',(-3.69,-.65,3.54),(.25,5.35,6.7),stone,.016)
joined_roof('West and tall bay complete joined roof',[
    (-12.425,.30),(-7.11,.30),(-7.11,-3.59),(-3.49,-3.59),
    (-3.49,2.29),(-4.775,2.29),(-4.775,6.90),(-12.425,6.90)],7.00)
front_screen('Tall bay upper timber grille',-5.30,-3.51,3.83,2.91,2.91)
# Ground screen only covers one sliding panel so the interior remains visible.
front_screen('Tall bay lower sliding grille',-6.27,-3.51,.27,.95,3.0)

# REAR LINK: glazed upper bridge around the courtyard, enclosed rooms below.
solid_back('Rear link enclosed back',-.2,6.88,.24,9.2,6.63)
glazing('Rear lower garden room',-.1,2.45,.24,8.85,3.14)
floor('Rear link upper floor',-.2,4.65,3.55,9.3,4.85)
glazing('Rear upper corridor',-.15,2.34,3.73,8.9,3.14)
roof('Rear link complete roof',-.2,4.65,7.00,9.70,4.92)
front_screen('Rear link timber portal',.65,2.13,3.75,1.55,3.10)

# Low central projection makes the deep courtyard read as a sequence of spaces.
floor('Central lower room floor',1.4,.70,.10,4.0,3.8)
glazing('Central room court glazing',1.4,-1.21,.24,3.72,3.14)
glazing('Central room west glazing',-.56,.68,.24,3.58,3.14,True)
stone_panel_wall('Central limestone return',3.38,.70,.24,3.8,3.15,True)
floor('Central projecting roof',1.4,.65,3.56,4.35,4.15)
terrace_tiles('Central flat roof paving',1.4,.65,3.73,4.08,3.88)
glazing('Upper courtyard link rail',1.4,-1.30,3.73,4.05,.95)

# RIGHT: wide upper pavilion projects over a recessed ground floor and outdoor lounge.
solid_back('East lower rear',8.0,6.55,.24,8.8,3.14)
glazing('East ground recessed front',8.0,-2.40,.24,8.47,3.14)
glazing('East ground exterior side',12.36,2.1,.24,8.75,3.14,True)
glazing('East ground courtyard side',3.64,2.0,.24,8.65,3.14,True)
floor('East cantilever upper floor',8.0,.75,3.55,9.40,12.10)
solid_back('East upper rear',8.0,6.55,3.73,8.8,3.14)
glazing('East upper front panoramic',8.0,-4.22,3.73,8.63,3.14)
glazing('East upper outer panoramic',12.35,1.10,3.73,10.38,3.14,True)
glazing('East upper courtyard wall',3.65,1.10,3.73,10.38,3.14,True)
roof('East complete pavilion roof',8.0,1.08,7.00,9.4,11.80)
# Slightly different rear roof level, consistent with source's layered roof silhouette.
roof('East rear raised roof cap',8.0,5.65,7.18,9.40,2.50)
box('East warm oak soffit',(8.0,-4.59,6.83),(8.92,.90,.09),wood,.01)
terrace_tiles('East balcony oak deck',8.0,-4.75,3.73,8.65,.96,True)
glazing('East balcony front rail',8.0,-5.25,3.76,8.85,.96)
glazing('East balcony outside rail',12.43,-4.75,3.76,1.10,.96,True)
front_screen('East front screen',4.75,-4.40,3.76,1.78,3.08)
front_screen('East front screen second',8.3,-4.40,3.76,.78,3.08)
for x in [4.0,12.0]:pier('East covered patio column',x,-5.05,.20,3.21,.22)
box('East covered patio wood ceiling',(8,-3.77,3.34),(8.15,2.58,.06),wood,.01)
box('East covered terrace low boundary',(13.15,-4.85,.58),(.22,4.1,1.08),stone,.015)
box('East terrace rear return',(12.0,-2.94,.58),(2.4,.20,1.08),stone,.015)

# Courtyard paving remains at real-world scale as the house footprint expands.
terrace_tiles('Central court large stone paver',-.2,-3.8,.035,6.65,5.45)
terrace_tiles('East covered outdoor paver',8.0,-4.87,.035,9.3,4.2)
terrace_tiles('Central connecting path',-.2,.25,.035,6.5,2.85)

# A furnished, inhabited house behind an intact glass/stone envelope.
box('West pavilion woven rug',(-9.1,-2.4,.265),(4.6,3.3,.035),fabric,.02)
lounge(-9.1,-1.50,.30)
table(-9.1,-3.20,.30,.80)
lounge(-6.8,-1.85,.30,math.pi/2)
lounge(-8.9,3.6,3.77)
table(-8.9,2.0,3.77,.7)
box('East ground rug',(8.6,1,.265),(5.0,3.75,.035),fabric,.02)
lounge(8.3,2.0,.30)
lounge(10.5,.35,.30,math.pi/2)
table(8.1,.2,.30,.8)
lounge(8.0,-.30,3.78)
table(8.0,-2.0,3.78,.9)
lounge(10.4,-1.20,3.78,math.pi/2)
# Patio outdoor seating matches the reference's square table and L-shaped white group.
lounge(9.4,-3.55,.15)
lounge(11.05,-4.65,.15,math.pi/2)
box('Patio square oak table',(9.35,-4.85,.60),(1.45,1.35,.105),wood,.035)
for dx in [-.55,.55]:
    for dy in [-.50,.50]:box('Patio table leg',(9.35+dx,-4.85+dy,.32),(.065,.065,.5),dark,.01)
# Small secondary chairs in the sheltered passage.
for x in [0.2,2.1]:
    box('Garden room armchair seat',(x,.75,.70),(.73,.77,.23),fabric,.09)
    box('Garden room armchair back',(x,1.07,1.05),(.75,.15,.80),fabric,.07)
table(1.15,.15,.25,.48)
# Source-visible tall bay bookcase gives the narrow part a purpose.
box('Tall bay oak bookshelf',(-5.18,-1.5,1.62),(1.80,.3,2.6),wood,.014)
for z in [.55,1.15,1.75,2.35]:
    box('Bookshelf pale shelf',(-5.18,-1.70,z),(1.65,.43,.065),plaster,.008)

# Sparse leafy courtyard tree; no invented pool or second garden feature from V01.
box('Central tree limestone planter',(-1.4,-4.3,.23),(1.85,1.65,.46),stone,.025)
box('Central tree soil',(-1.4,-4.3,.46),(1.68,1.48,.025),soil,.005)
cyl('Courtyard olive trunk',(-1.4,-4.3,.47),(-1.32,-4.27,3.8),.075,wood)
random.seed(78)
for k in range(13):
    a=k*2.399;zz=2.3+(k%4)*.45
    end=Vector((-1.35+math.cos(a)*.82,-4.27+math.sin(a)*.72,zz+1.0))
    cyl('Courtyard fine branch',(-1.35,-4.27,zz-.9),end,.023,wood,10)
    for j in range(38):
        pos=end+Vector((random.uniform(-.46,.46),random.uniform(-.42,.42),random.uniform(-.3,.4)))
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=pos)
        ob=bpy.context.object;ob.name='Courtyard olive foliage';ob.parent=root
        ob.scale=(.047,.15,.024);ob.rotation_euler=(random.random(),random.random(),random.random()*math.tau)
        ob.data.materials.append(random.choice(green))

# Concealed illumination under each roof. No excessive glow bloom or image blur.
for name,x,y,z,w in [('West',-8.5,.70,6.83,6.8),('Link',-.1,2.5,6.83,8.5),('East',8,-4.10,6.83,8.3)]:
    box(name+' light trough',(x,y,z),(w,.035,.025),glow,.003)
for name,x,y,z,power in [('West lower',-8.9,-1.9,3.28,210),('West upper',-8.5,3.3,6.8,180),
                         ('East lower',8,1.5,3.28,220),('East upper',8,1.3,6.8,260),
                         ('Link lower',0,4.5,3.28,140),('Link upper',0,4.5,6.8,140),('Tall bay',-5.1,-1,6.8,130)]:
    area(name+' warm ceiling',(x,y,z),power,3.3,(1,.84,.66),(x,y,z-3))

groundmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.80,.77,.69,1)
g=box('Seamless warm ground',(0,0,-.45),(250,250,.10),groundmat,0);g.parent=None
scene.world.use_nodes=True
bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs[0].default_value=(.84,.87,.94,1);bg.inputs[1].default_value=.55
area('Broad warm key',(-16,-18,26),4400,14,(1,.92,.81),(0,0,2))
area('Facade fill',(14,-7,20),2200,12,(.87,.92,1),(4,0,2))
sun=bpy.data.lights.new('Soft late afternoon sun','SUN');sun.energy=1.3;sun.angle=math.radians(14)
sun.color=(1,.94,.83);ob=bpy.data.objects.new('Soft late afternoon sun',sun);scene.collection.objects.link(ob)
ob.rotation_euler=(math.radians(22),math.radians(-25),math.radians(-22))

bpy.ops.object.camera_add(location=(-27,-43,24))
cam=bpy.context.object;cam.name='V02 · video-derived whole house camera'
cam.rotation_euler=(Vector((-.8,0,2.4))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO';cam.data.ortho_scale=39.5;cam.data.lens=50;cam.data.dof.use_dof=False
scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=96;scene.cycles.use_denoising=True
scene.cycles.max_bounces=12;scene.cycles.transmission_bounces=8
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
scene.cycles.device='GPU'
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.render.image_settings.color_depth='8';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.render.filepath=str(OUT/'house-video-match-v02.png')
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_perspective='CAMERA';ar.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opai-video-house-v02.blend'))
(OUT/'manifest-v02.json').write_text(json.dumps({'version':2,'source':'app/public/assets/hero/villa-hero-loop.mp4 at 10.8s',
    'contact_sheet_seconds':[0,4.004,8.008,12.012,15.015],'model':'opai-video-house-v02.blend','render':'house-video-match-v02.png',
    'builder':'build-v02.py + house_kit.py','resolution':[1920,1080],'engine':'CYCLES','samples':96,'objects':len(scene.objects),
    'massing':['Broad left and right wings','Central open-air courtyard','Left stepped terrace and tall screened bay',
               'Glazed rear link','Right cantilever and covered outdoor lounge','Complete roofs and glazing'],
    'limits':['Proportional visual reconstruction, no source dimensions','Rear construction inferred','No animation or homepage change'],
    'review':'pending'},ensure_ascii=False,indent=2))
bpy.ops.render.render(write_still=True)
print('VIDEO_HOUSE_V02_COMPLETE',flush=True)
