"""Original, enclosed courtyard residence. Run with Blender --background --python build.py.

No imported meshes/textures. Metres, complete roof envelope; not the product editor scene.
"""
import bpy
import math
import random
import json
import sys
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent
random.seed(42)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
root = bpy.data.objects.new('RESIDENCE · complete architectural assembly', None)
scene.collection.objects.link(root)

def mat(name, color, rough=.5, metal=0, noise=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    p.name = 'Principled BSDF'
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if noise:
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = 38
        n.inputs['Detail'].default_value = 2
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = noise
        bump.inputs['Distance'].default_value = .025
        nt.links.new(n.outputs['Fac'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m

stone = mat('Ivory limestone · honed', (.72,.685,.61), .66, noise=.16)
plaster = mat('Warm mineral plaster', (.85,.825,.765), .7, noise=.12)
roofmat = mat('Roof membrane · warm grey', (.49,.49,.445), .85)
tile = mat('Travertine terrace', (.65,.615,.53), .62, noise=.18)
dark = mat('Bronze anodised aluminium', (.09,.078,.057), .29,.7)
wood = mat('Oiled oak', (.34,.205,.093), .4, noise=.13)
fabric = mat('Natural linen', (.72,.69,.595), .92, noise=.3)
clay = mat('Terracotta accent', (.37,.14,.08), .82)
soil = mat('Soil', (.075,.063,.035), .95)
green = [mat('Olive leaves '+str(i), c,.78) for i,c in enumerate([
    (.17,.215,.088),(.23,.28,.12),(.29,.315,.17),(.12,.175,.065)])]
groundmat = mat('Warm seamless background', (.72,.674,.583), .85)
water = mat('Courtyard reflection water', (.11,.25,.245), .12,.12)
water.node_tree.nodes.get('Principled BSDF').inputs['Transmission Weight'].default_value = .38
glass = mat('Low iron glazing · 12mm', (.89,.94,.94), .055)
gp = glass.node_tree.nodes.get('Principled BSDF')
gp.inputs['Transmission Weight'].default_value = 1
gp.inputs['IOR'].default_value = 1.45
glow = mat('Warm concealed strip', (1,.70,.38), .4)
glow.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value = (1,.64,.28,1)
glow.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value = 2.5

# Real stretched grain, not painted board stripes.
nt=wood.node_tree
tex=nt.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=3
coord=nt.nodes.new('ShaderNodeTexCoord');mapping=nt.nodes.new('ShaderNodeVectorMath')
mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(9,9,.32)
nt.links.new(coord.outputs['Generated'],mapping.inputs[0]);nt.links.new(mapping.outputs[0],tex.inputs[0])
ramp=nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color=(.20,.11,.043,1)
ramp.color_ramp.elements[1].color=(.43,.29,.14,1)
nt.links.new(tex.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs[0],nt.nodes.get('Principled BSDF').inputs['Base Color'])

def box(name, loc, size, material, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material);o.parent=root
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=3
        mod=o.modifiers.new('Architectural normals','WEIGHTED_NORMAL')
    return o

def cyl(name, a, b, r, material, vertices=16):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    o.data.materials.append(material);o.parent=root
    for p in o.data.polygons:p.use_smooth=True
    return o

def glazing(name,x,y,z,w,h,side=False):
    # Closed transparent facade with real perimeter frames and separate panes.
    count=max(1,round(w/1.45));step=w/count
    for i in range(count):
        t=-w/2+(i+.5)*step
        box(name+' glass '+str(i),(x if side else x+t,y+t if side else y,z+h/2),
            (.012,step-.055,h-.06) if side else (step-.055,.012,h-.06),glass,.003)
    for i in range(count+1):
        t=-w/2+i*step
        box(name+' mullion '+str(i),(x if side else x+t,y+t if side else y,z+h/2),
            (.075,.055,h) if side else (.055,.075,h),dark,.007)
    for dz in [0,h]:
        box(name+' edge',(x,y,z+dz),(.075,w,.055) if side else (w,.075,.055),dark,.006)

def roof(name,x,y,z,w,d):
    box(name+' structural slab',(x,y,z),(w,d,.24),plaster)
    box(name+' continuous roof',(x,y,z+.14),(w-.28,d-.28,.06),roofmat,.008)
    for yy in [y-d/2+.08,y+d/2-.08]:
        box(name+' parapet',(x,yy,z+.26),(w,.16,.36),stone,.012)
    for xx in [x-w/2+.08,x+w/2-.08]:
        box(name+' parapet',(xx,y,z+.26),(.16,d,.36),stone,.012)

def lounge(x,y,z,turn=0):
    # Softened three-seat sofa; deliberately separate upholstery cushions.
    pieces=[]
    def piece(n,l,s,m,b=.06):pieces.append(box(n,(x+l[0],y+l[1],z+l[2]),s,m,b))
    piece('sofa oak shadow base',(0,0,.22),(2.7,.9,.20),wood)
    piece('sofa back',(0,.35,.70),(2.82,.24,.79),fabric)
    for dx in [-1.34,1.34]:piece('sofa arm',(dx,0,.51),(.18,1.05,.51),fabric)
    for dx in [-.85,0,.85]:piece('linen seat',(dx,-.04,.44),(.82,.75,.22),fabric)
    piece('terracotta cushion',(.72,.20,.83),(.48,.18,.40),clay)
    if turn:
        for o in pieces:
            d=o.location-Vector((x,y,z));c,s=math.cos(turn),math.sin(turn)
            o.location=(x+c*d.x-s*d.y,y+s*d.x+c*d.y,z+d.z);o.rotation_euler.z=turn

def table(x,y,z,r=.7):
    cyl('round oak tabletop',(x,y,z+.42),(x,y,z+.50),r,wood,64)
    cyl('round table pedestal',(x,y,z+.05),(x,y,z+.43),r*.3,stone,32)
    cyl('ceramic vase',(x+.15,y,z+.5),(x+.15,y,z+.72),.08,clay,24)

def area(name,loc,power,size,color,target):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o

# Finished house: the rear/side envelope is closed, street front is glazed, all roofs present.
box('Floating travertine site',(0,-.65,-.22),(17.3,13.3,.40),tile,.06)
box('Ground floor slab',(0,0,.05),(14.2,8.2,.26),stone)
box('Continuous rear wall',(0,3.91,1.70),(14,.24,3.2),plaster)
box('West solid facade',(-6.91,0,1.70),(.24,8,3.2),stone)
box('Central service spine',(-1.35,1.2,1.7),(.22,5.3,3.2),plaster)
box('Stair volume',(0,2.1,1.75),(2.5,3.2,3.4),stone)
glazing('Living room south',2.85,-3.99,.23,8.05,2.85)
glazing('Living room east',6.98,-.05,.23,7.72,2.85,True)
glazing('Dining room south',-4.22,-3.99,.23,5.3,2.85)
for x in [-6.92,-1.45,6.92]:box('Limestone structural pier',(x,-3.85,1.69),(.27,.38,3.15),stone)
box('Ground floor roof and upper slab',(0,0,3.35),(14.55,8.55,.34),plaster)

# West upper wing has a full roof and deep loggia.
box('Upper west rear',(-4.2,3.91,5.05),(5.55,.24,3.1),plaster)
box('Upper west side',(-6.91,0,5.05),(.24,8,3.1),stone)
box('Upper west east pier',(-1.47,-.1,5.05),(.25,7.75,3.1),plaster)
glazing('Upper west recessed glazing',-4.18,-3.42,3.55,5.2,2.87)
roof('West complete roof',-4.2,0,6.68,5.95,8.6)
# Thin eave shadow/recesses and controlled timber screen.
box('West oak soffit',(-4.2,-3.78,6.45),(5.56,.95,.065),wood,.008)
for i in range(9):
    box('West upper oak fin '+str(i),(-6.68+i*.19,-3.82,5.02),(.065,.33,2.89),wood,.01)

# Rear upper wing steps back to leave a finished terrace over the living room.
box('Upper rear envelope',(2.8,3.91,5.05),(8.25,.24,3.1),plaster)
box('Upper rear east jamb',(6.87,2.05,5.05),(.25,3.85,3.1),stone)
glazing('Upper bedroom terrace glazing',2.78,.18,3.55,8.15,2.9)
roof('East complete roof',2.8,2.05,6.68,8.8,4.75)
box('Rear oak soffit',(2.8,.02,6.47),(8.4,.75,.07),wood,.008)
for i in range(10):box('Bedroom sun screen '+str(i),(4.75+i*.19,-.10,5.02),(.065,.30,2.86),wood,.009)
box('Balcony limestone threshold',(2.8,-3.67,3.55),(8.3,.24,.16),stone)
glazing('Terrace glass balustrade',2.8,-3.71,3.60,8.3,.97)
glazing('Terrace east glass return',6.93,-1.75,3.60,3.95,.97,True)

# Real terrace paving seams, not a checker texture.
for i in range(8):
    for j in range(3):
        box('Upper terrace travertine tile',(-.83+i*1.025,-3.03+j*1.025,3.547),(1.015,1.015,.045),tile,.006)
for i in range(12):
    for j in range(3):
        box('Courtyard paver',(-6.48+i*1.175,-4.65-j*.89,.013),(1.16,.875,.06),tile,.005)
# Roof limestone expansion joints are subtle physical reveals.
for x in [-6,-4.5,-3]:box('West facade stone joint',(x,-4.16,3.35),(.009,.009,.29),roofmat,0)
for x in [0,2,4,6]:box('Front fascia stone joint',(x,-4.28,3.34),(.01,.01,.29),roofmat,0)

# Furnished spaces behind glass; not exposed dollhouse furniture.
box('Living woven rug',(3,.25,.205),(4.5,3.4,.025),fabric,.015)
lounge(3,1.3,.25)
lounge(5.1,-.2,.25,math.pi/2)
table(2.8,-.30,.24,.65)
box('Oak media wall',(-1.19,.1,1.6),(.06,2.8,2.65),wood,.01)
box('Media panel',(-1.14,.1,1.55),(.04,1.5,.86),dark,.025)
box('Dining table',(-4.3,-.6,1.00),(2.25,1.03,.10),wood,.08)
for dx in [-.83,.83]:
    for dy in [-.35,.35]:box('Dining leg',(-4.3+dx,-.6+dy,.58),(.075,.075,.8),wood,.012)
for dx in [-.75,0,.75]:
    for dy in [-.95,.95]:
        box('Dining chair seat',(-4.3+dx,-.6+dy,.62),(.50,.49,.13),fabric,.065)
        box('Dining chair back',(-4.3+dx,-.6+dy+(.2 if dy>0 else -.2),.98),(.51,.095,.64),wood,.065)
        for ddx in [-.18,.18]:
            for ddy in [-.16,.16]:box('Dining chair foot',(-4.3+dx+ddx,-.6+dy+ddy,.38),(.035,.035,.45),dark,.008)
box('Upper bed platform',(1.4,2.15,3.82),(2.1,2.4,.32),wood,.04)
box('Upper bed mattress',(1.4,2.1,4.08),(1.95,2.24,.24),fabric,.09)
box('Upper bed headboard',(1.4,3.18,4.42),(2.2,.16,1.0),fabric,.06)
for dx in [-.5,.5]:box('Upper pillow',(1.4+dx,2.82,4.25),(.75,.46,.17),plaster,.075)
lounge(-4.1,.3,3.57)
table(-4.2,-1.2,3.57,.65)
# Low outdoor chaise pair on terrace, scaled to the house.
for x in [1.2,2.3]:
    box('Terrace chaise frame',(x,-1.8,3.76),(.75,1.7,.15),wood,.03)
    box('Terrace chaise linen',(x,-1.8,3.86),(.70,1.64,.10),fabric,.04)
    cushion=box('Terrace chaise raised back',(x,-1.28,4.06),(.70,.65,.12),fabric,.04)
    cushion.rotation_euler.x=math.radians(25)

# Sheltered entrance, door and two broad steps.
box('Entry timber door',(-6.1,-4.08,1.48),(1.12,.09,2.48),wood,.025)
box('Entry handle',(-5.69,-4.145,1.45),(.027,.05,.55),dark,.01)
box('Entry tread 1',(-6.1,-4.72,.02),(1.9,.75,.14),stone)
box('Entry tread 2',(-6.1,-5.17,-.065),(2.15,.60,.12),stone)

# Reflecting basin inset into foreground terrace, with a continuous stone rim.
box('Reflection basin base',(4.3,-5.94,.041),(4.9,1.20,.08),dark,.025)
box('Reflection water surface',(4.3,-5.94,.09),(4.7,1.02,.018),water,.005)
for yy in [-6.59,-5.29]:box('Pool coping',(4.3,yy,.1),(5.18,.18,.16),stone,.015)
for xx in [1.8,6.8]:box('Pool coping',(xx,-5.94,.1),(.18,1.44,.16),stone,.015)

# Restrained olive planting: trunks, branching and individual leaf meshes.
def olive(x,y,z,height=3.2):
    box('Square olive planter',(x,y,z+.23),(1.22,1.22,.48),stone,.03)
    box('Olive soil',(x,y,z+.48),(1.08,1.08,.025),soil,.01)
    cyl('Olive trunk',(x,y,z+.48),(x+.08,y,z+height*.75),.075,wood)
    for k in range(7):
        ang=k*2.399; end=Vector((x+math.cos(ang)*.67,y+math.sin(ang)*.63,z+height-.24+random.uniform(-.35,.35)))
        cyl('Olive branch',(x,y,z+height*.5),end,.025,wood,10)
        for n in range(36):
            p=end+Vector((random.uniform(-.47,.47),random.uniform(-.45,.45),random.uniform(-.28,.35)))
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=p)
            o=bpy.context.object;o.name='Olive leaf cluster';o.scale=(.055,.17,.025)
            o.rotation_euler=(random.random(),random.random(),random.uniform(0,math.tau))
            o.data.materials.append(random.choice(green));o.parent=root
olive(-.35,-5.55,0,3.25)
olive(7.78,2.7,0,3.6)
for x in [-6.7,-5.6,-4.5,-3.4]:
    box('Rear garden planter',(x,4.85,.18),(.92,.80,.40),stone,.025)
    for j in range(7):
        xx=x+random.uniform(-.3,.3);yy=4.85+random.uniform(-.24,.24)
        cyl('Ornamental grass',(xx,yy,.4),(xx+random.uniform(-.15,.15),yy,.95+random.random()*.35),.024,random.choice(green),8)

# Exterior light troughs are shaded under eaves; internal lighting remains subtle.
box('Living concealed strip',(2.9,-3.76,3.12),(7.8,.045,.035),glow,.005)
box('Upper concealed strip',(2.6,.24,6.44),(7.6,.045,.025),glow,.005)
area('Living warm interior',(3,0,3.05),190,3.5,(1,.80,.58),(3,0,0))
area('Dining warm interior',(-4,-.2,3.05),160,3,(1,.83,.65),(-4,-.2,0))
area('Bedroom warm interior',(2,2.1,6.4),140,2.5,(1,.83,.62),(2,2.1,3.6))
area('West upper interior',(-4,0,6.4),150,3,(1,.86,.7),(-4,0,3.6))

g=box('Seamless studio ground',(0,0,-.49),(200,200,.12),groundmat,0);g.parent=None
scene.world.color=(.7,.7,.7)
scene.world.use_nodes=True
bg=next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND');bg.inputs[0].default_value=(.78,.83,.91,1);bg.inputs[1].default_value=.45
area('Large warm key',(-10,-12,22),3300,11,(1,.91,.79),(0,0,0))
area('Cool daylight fill',(10,-3,16),1800,9,(.82,.90,1),(1,1,2))
sun=bpy.data.lights.new('Soft afternoon sun','SUN');sun.energy=1.5;sun.angle=math.radians(12);sun.color=(1,.91,.76)
so=bpy.data.objects.new('Soft afternoon sun',sun);scene.collection.objects.link(so);so.rotation_euler=(math.radians(25),math.radians(-25),math.radians(-25))

bpy.ops.object.camera_add(location=(23,-31,19))
camera=bpy.context.object;camera.name='Hero camera · complete house right, copy left'
target=Vector((-3.8,-.45,1.9))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=35
camera.data.lens=50;camera.data.dof.use_dof=False
scene.camera=camera
scene.render.engine='BLENDER_EEVEE' if '--house-eevee-check' in sys.argv else 'CYCLES'
if scene.render.engine=='BLENDER_EEVEE':
    scene.eevee.taa_render_samples=64
    scene.eevee.use_raytracing=True
else:
    scene.cycles.samples=128;scene.cycles.use_denoising=True
    scene.cycles.max_bounces=12;scene.cycles.transmission_bounces=8
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='METAL';prefs.get_devices()
    for d in prefs.devices:d.use=d.type=='METAL'
    scene.cycles.device='GPU'
scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.render.image_settings.color_depth='8'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.render.film_transparent=False
scene.render.filepath=str(OUT/('house-eevee-check.png' if scene.render.engine=='BLENDER_EEVEE' else 'house-hero-v01.png'))
# On opening the saved file, show the actual hero camera, not the default empty viewport.
for screen in bpy.data.screens:
    for ar in screen.areas:
        if ar.type=='VIEW_3D':
            ar.spaces.active.region_3d.view_perspective='CAMERA'
            ar.spaces.active.overlay.show_overlays=False
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opai-complete-house-v01.blend'))
manifest={'version':1,'purpose':'Complete house hero still for visual review; not deployed',
    'model':'opai-complete-house-v01.blend','builder':'build.py','render':Path(scene.render.filepath).name,
    'resolution':[1920,1080],'samples':128,'engine':scene.render.engine,'camera':'orthographic oblique; right-biased',
    'dof':False,'root':root.name,'objects':len(scene.objects),'source':'Original procedural geometry and materials; no imported meshes, textures or official product claims',
    'constraints':['Complete roofs and closed exterior','No cutaway','No homepage replacement','No video output'],
    'simplifications':['Concept architecture, not a buildable or engineered plan','Selective furnishings visible through glass','No HVAC or detailed waterproofing']}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
bpy.ops.render.render(write_still=True)
print('HOUSE_STILL_COMPLETE',flush=True)
