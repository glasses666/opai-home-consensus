"""Replace placeholder interiors, keeping V03 architecture and hero camera intact."""
import bpy, math, random, json, sys
from pathlib import Path
from mathutils import Vector
from contextlib import contextmanager
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'opai-refined-house-v03.blend'))
s=bpy.context.scene
root=bpy.data.objects['V02 · video reference courtyard residence']
G=root
base_camera=s.camera
base_matrix=[list(row) for row in base_camera.matrix_world]
protected={o.name:{'matrix':[list(r) for r in o.matrix_world],
                   'vertices':[list(v.co) for v in o.data.vertices]}
           for o in s.objects if o.type=='MESH' and any(k in o.name.lower() for k in
           ['roof','floor','slab','plinth','wall','jamb','column','pier','glazing','mullion','rail'])}

def mat(name,color,rough=.5,metal=0):
    m=bpy.data.materials.new('V04 · '+name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.name='Principled BSDF'
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    return m

linen=mat('ivory boucle',(.70,.665,.59),.92)
olive=mat('muted olive upholstery',(.24,.285,.19),.9)
cognac=mat('saddle leather',(.30,.135,.065),.48)
stone=mat('cream travertine table',(.66,.625,.52),.53)
walnut=mat('smoked walnut',(.19,.10,.05),.43)
oak=bpy.data.materials['Oiled oak']
metal=mat('bronze furniture fittings',(.13,.115,.086),.26,.78)
seam=mat('linen stitch',(.48,.455,.395),.96)
ivory=mat('glazed ceramic',(.74,.71,.63),.23)
paper=mat('book paper',(.70,.67,.58),.96)
bookmats=[mat('book binding '+str(i),c,.8) for i,c in enumerate([
    (.18,.21,.16),(.61,.57,.47),(.28,.16,.10),(.105,.12,.115),(.71,.68,.60)])]
rugmat=mat('woven wool rug',(.40,.385,.32),.95)
lightmat=mat('warm opal diffuser',(.9,.83,.69),.4)
p=lightmat.node_tree.nodes.get('Principled BSDF')
p.inputs['Emission Color'].default_value=(1,.78,.49,1);p.inputs['Emission Strength'].default_value=.75

for m in [linen,olive,rugmat]:
    nt=m.node_tree;p=nt.nodes.get('Principled BSDF')
    n=nt.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=190;n.inputs['Detail'].default_value=2
    b=nt.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.23;b.inputs['Distance'].default_value=.0017
    nt.links.new(n.outputs['Fac'],b.inputs['Height']);nt.links.new(b.outputs[0],p.inputs['Normal'])
    p.inputs['Sheen Weight'].default_value=.30
# Fine lengthwise woodgrain without a noisy low-resolution bitmap.
nt=walnut.node_tree;p=nt.nodes.get('Principled BSDF')
co=nt.nodes.new('ShaderNodeTexCoord');v=nt.nodes.new('ShaderNodeVectorMath');v.operation='MULTIPLY';v.inputs[1].default_value=(2,20,3)
n=nt.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=3
r=nt.nodes.new('ShaderNodeValToRGB');r.color_ramp.elements[0].color=(.12,.057,.024,1);r.color_ramp.elements[1].color=(.26,.15,.075,1)
nt.links.new(co.outputs['Generated'],v.inputs[0]);nt.links.new(v.outputs[0],n.inputs[0]);nt.links.new(n.outputs['Fac'],r.inputs[0]);nt.links.new(r.outputs[0],p.inputs['Base Color'])
# The previous .055 roughness visibly softened interiors through multiple panes.
glass=bpy.data.materials['Low iron glazing · 12mm']
glass.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.009

def attach(o,name,m):
    o.name='V04 · '+name;o.parent=G;o.data.materials.append(m);return o

@contextmanager
def group(name,loc=(0,0,0),yaw=0):
    global G
    old=G;o=bpy.data.objects.new('V04 · '+name,None);s.collection.objects.link(o)
    o.parent=root;o.location=loc;o.rotation_euler.z=yaw;G=o
    try:yield o
    finally:G=old

def box(name,loc,dims,m,r=.018):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=attach(bpy.context.object,name,m);o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if r:
        b=o.modifiers.new('Joinery edge radius','BEVEL');b.width=r;b.segments=4
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def pipe(name,coords,r,m,closed=False):
    c=bpy.data.curves.new('V04 · '+name,'CURVE');c.dimensions='3D';c.bevel_depth=r;c.bevel_resolution=4
    sp=c.splines.new('POLY');sp.points.add(len(coords)-1)
    for p,v in zip(sp.points,coords):p.co=(*v,1)
    sp.use_cyclic_u=closed
    o=bpy.data.objects.new('V04 · '+name,c);s.collection.objects.link(o);o.parent=G;c.materials.append(m);return o

def cylinder(name,loc,r,h,m,sides=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides,radius=r,depth=h,location=loc)
    o=attach(bpy.context.object,name,m)
    for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
    b=o.modifiers.new('Turned edge','BEVEL');b.width=min(.008,h/4);b.segments=3
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o

def signedpow(x,p):return math.copysign(abs(x)**p,x)

def cushion(name,loc,dims,m,e1=.42,e2=.35):
    # Superellipsoid upholstery: continuous inflated shape instead of beveled blocks.
    a,b,c=[d/2 for d in dims];nu=64;nv=24
    vs=[(0,0,-c)];fs=[]
    for j in range(1,nv):
        lat=-math.pi/2+math.pi*j/nv
        for i in range(nu):
            ang=math.tau*i/nu;cl=abs(math.cos(lat))**e1
            vs.append((a*cl*signedpow(math.cos(ang),e2),b*cl*signedpow(math.sin(ang),e2),c*signedpow(math.sin(lat),e1)))
    for i in range(nu):fs.append((0,1+(i+1)%nu,1+i))
    for j in range(nv-2):
        for i in range(nu):
            q=1+j*nu+i;qn=1+j*nu+(i+1)%nu;fs.append((q,qn,qn+nu,q+nu))
    top=len(vs);vs.append((0,0,c));last=1+(nv-2)*nu
    for i in range(nu):fs.append((last+i,last+(i+1)%nu,top))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update()
    o=bpy.data.objects.new('V04 · '+name,mesh);s.collection.objects.link(o);o.parent=G;o.location=loc;mesh.materials.append(m)
    for f in mesh.polygons:f.use_smooth=True
    return o

def seamloop(x,y,z,w,d):
    pts=[];rr=.055
    for cx,cy,start in [(w/2-rr,d/2-rr,0),(-w/2+rr,d/2-rr,90),(-w/2+rr,-d/2+rr,180),(w/2-rr,-d/2+rr,270)]:
        for i in range(10):
            t=math.radians(start+i*10);pts.append((x+cx+rr*math.cos(t),y+cy+rr*math.sin(t),z))
    pipe('tailored cushion welt',pts,.0035,seam,True)

def sofa(name,x,y,z,yaw=0,m=linen):
    with group(name,(x,y,z),yaw):
        box('floating walnut sofa frame',(0,0,.205),(3.16,.93,.12),walnut,.03)
        for xx in [-1.23,1.23]:
            for yy in [-.33,.33]:box('tapered sofa foot',(xx,yy,.075),(.065,.065,.15),metal,.015)
        cushion('continuous upholstered back',(0,.385,.56),(3.08,.24,.72),m,.32,.3)
        for i,xx in enumerate([-.96,0,.96]):
            cushion('individual rounded seat',(xx,-.055,.367),(.935,.87,.20),m,.35,.25)
            back=cushion('loose back cushion',(xx,.24,.72),(.92,.24,.57),m,.47,.38);back.rotation_euler.x=math.radians(-10)
            seamloop(xx,-.055,.438,.86,.79)
        for xx in [-1.51,1.51]:cushion('sculpted padded arm',(xx,-.015,.45),(.24,1.04,.59),m,.42,.38)
        p=cushion('olive throw pillow',(-1.04,.02,.66),(.42,.18,.42),olive,.65,.60)
        p.rotation_euler=(math.radians(-14),math.radians(-8),math.radians(-11))
        p=cushion('small linen throw pillow',(.95,.01,.635),(.36,.17,.36),linen,.65,.6)
        p.rotation_euler=(math.radians(-12),math.radians(7),math.radians(12))

def armchair(name,x,y,z,yaw=0,m=cognac):
    with group(name,(x,y,z),yaw):
        cushion('chair seat',(0,-.04,.43),(.84,.78,.19),m,.5,.5)
        # Continuous horseshoe shell, lower at arms and higher at the back.
        vs=[];fs=[];n=64
        for i in range(n+1):
            t=math.pi*i/n;top=.75+.24*math.sin(t)
            for r,h in [(.44,.36),(.55,.36),(.55,top),(.44,top)]:
                vs.append((math.cos(t)*r,math.sin(t)*r-.11,h))
        for i in range(n):
            for j in range(4):a=i*4+j;b=i*4+(j+1)%4;fs.append((a,b,b+4,a+4))
        fs.extend([(3,2,1,0),(n*4,n*4+1,n*4+2,n*4+3)])
        mesh=bpy.data.meshes.new('Continuous upholstered shell');mesh.from_pydata(vs,[],fs);mesh.update()
        o=bpy.data.objects.new('V04 · curved armchair shell',mesh);s.collection.objects.link(o);o.parent=G;mesh.materials.append(m)
        for f in mesh.polygons:f.use_smooth=True
        b=o.modifiers.new('Soft shell lip','BEVEL');b.width=.035;b.segments=4
        o.modifiers.new('Shell weighted normals','WEIGHTED_NORMAL')
        for xx in [-.31,.31]:
            pipe('chair metal sled',[(xx,-.32,.06),(xx,.31,.06),(xx,.32,.41)],.017,metal)
            pipe('front chair support',[(xx,-.32,.06),(xx,-.30,.41)],.017,metal)

def vase(name,x,y,z,m=ivory):
    profile=[(.06,0),(.12,.045),(.135,.17),(.105,.25),(.063,.31),(.065,.33),(.048,.33),(.046,.29),(.089,.23),(.112,.16),(.10,.055),(.02,.035)]
    vs=[];fs=[];n=64
    for rad,h in profile:
        for i in range(n):t=math.tau*i/n;vs.append((rad*math.cos(t),rad*math.sin(t),h))
    for j in range(len(profile)-1):
        for i in range(n):a=j*n+i;b=j*n+(i+1)%n;fs.append((a,b,b+n,a+n))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update()
    o=bpy.data.objects.new('V04 · '+name,mesh);s.collection.objects.link(o);o.parent=G;o.location=(x,y,z);mesh.materials.append(m)
    for f in mesh.polygons:f.use_smooth=True

def books(x,y,z,angle=.10):
    o=box('coffee table art book',(x,y,z+.025),(.34,.26,.05),paper,.004);o.rotation_euler.z=angle
    for zz in [z,z+.052]:
        o=box('cloth book cover',(x,y,zz),(.35,.27,.006),bookmats[1],.002);o.rotation_euler.z=angle

def coffee(name,x,y,z):
    with group(name,(x,y,z)):
        top=cylinder('oval travertine tabletop',(0,0,.375),1,.07,stone,96);top.scale=(.87,.51,1)
        for xx in [-.46,.46]:
            leg=cylinder('oval walnut pedestal',(xx,0,.174),.18,.34,walnut);leg.scale.y=1.5
        books(-.23,-.03,.413)
        vase('hollow ceramic vase',.35,.12,.412)

def rug(name,x,y,z,w,d):
    box(name,(x,y,z+.014),(w,d,.028),rugmat,.012)
    # A woven bound edge; sparse threads at ends provide scale in an eye-level shot.
    pipe('rug binding',[(x-w/2+.02,y-d/2+.02,z+.028),(x+w/2-.02,y-d/2+.02,z+.028),
         (x+w/2-.02,y+d/2-.02,z+.028),(x-w/2+.02,y+d/2-.02,z+.028)],.005,seam,True)
    for i in range(80):
        xx=x-w/2+.04+i*(w-.08)/79
        for sign in [-1,1]:pipe('rug end thread',[(xx,y+sign*(d/2-.02),z+.025),(xx+.008,y+sign*(d/2+.045),z+.021)],.0025,seam)

def shelves(name,x,y,z,width=2.8):
    with group(name,(x,y,z)):
        depth=.40;height=2.45
        box('recessed bookcase back',(0,.19,1.27),(width,.045,height),walnut,.005)
        for xx in [-width/2,width/2]:box('bookcase outer upright',(xx,0,1.27),(.045,depth,height),oak,.004)
        for xx in [-width/6,width/6]:box('bookcase divider',(xx,0,1.27),(.035,depth,height),oak,.004)
        for zz in [.055,.55,1.05,1.55,2.05,2.48]:box('solid oak shelf',(0,0,zz),(width,depth,.045),oak,.004)
        random.seed(int(abs(x)*50+z*30))
        for j,zz in enumerate([.58,1.08,1.58,2.08]):
            for c in range(3):
                start=-width/2+c*width/3+.09
                for i in range(4 if (j+c)%2 else 6):
                    h=random.uniform(.22,.34);ww=random.uniform(.035,.065)
                    box('individual bound book',(start+i*.072,-.03,zz+h/2),(ww,.25,h),random.choice(bookmats),.002)
        vase('shelf ceramic',.65,-.025,.58)
        cylinder('shelf sculptural stone',(-.13,-.04,1.18),.11,.20,stone)

def pendant(name,x,y,z,ceiling):
    pipe(name+' suspension',[(x,y,z+.12),(x,y,ceiling)],.0045,metal)
    cylinder(name+' ceiling rose',(x,y,ceiling-.014),.055,.03,metal)
    shade=cushion(name+' opal shade',(x,y,z),(.56,.56,.17),ivory,.9,1)
    cylinder(name+' lower diffuser',(x,y,z-.065),.225,.025,lightmat)
    light=bpy.data.lights.new('V04 · '+name+' soft light','AREA');light.energy=16;light.color=(1,.85,.65);light.shape='DISK';light.size=.40
    o=bpy.data.objects.new(light.name,light);s.collection.objects.link(o);o.parent=G;o.location=(x,y,z-.085)

def sideboard(name,x,y,z,w=2.5):
    with group(name,(x,y,z)):
        box('sideboard carcass',(0,0,.51),(w,.47,.72),walnut,.015)
        for i in range(4):
            box('cabinet inset front',(-w/2+(i+.5)*w/4,-.247,.51),(w/4-.014,.04,.67),oak,.006)
        for xx in [-w/2+.2,w/2-.2]:box('cabinet foot',(xx,0,.075),(.06,.32,.15),metal,.01)
        box('stone cabinet top',(0,0,.899),(w+.035,.49,.045),stone,.01)
        vase('cabinet vase',-.78,0,.925)
        books(.5,0,.925)

# Replace only authored placeholder indoor objects. Keep patio furniture, envelope and planting.
prefixes=['sofa ','linen seat','terracotta cushion','round oak tabletop','round table pedestal','ceramic vase',
          'West pavilion woven rug','East ground rug','Garden room armchair','Tall bay oak bookshelf','Bookshelf pale shelf',
          'V03 · upholstery piping','V03 · sofa recessed foot','V03 · table book','V03 · ceramic dish']
removed=[]
for o in list(s.objects):
    if not any(o.name.startswith(p) for p in prefixes):continue
    x,y,z=o.matrix_world.translation
    if x>3 and y<-2.65 and z<2:continue
    removed.append(o.name);bpy.data.objects.remove(o,do_unlink=True)

# West ground living room: one tailored sofa and sculpted lounge chair, not a repeated block L.
rug('west living woven rug',-8.9,-2.45,.251,4.60,3.18)
sofa('west living sofa',-9.1,-1.45,.285)
armchair('west living accent chair',-7.05,-4.24,.285,-.85)
coffee('west living oval table',-9.0,-3.14,.285)
sideboard('west living low credenza',-8.9,.64,.285,2.9)
pendant('west living pendant',-9.1,-2.62,2.62,3.30)

# West upper reading room retains its lounge identity, with functioning-looking storage.
rug('west reading wool rug',-8.65,2.75,3.708,4.80,3.55)
sofa('west reading sofa',-8.9,3.65,3.747,m=olive)
armchair('west reading chair',-6.20,1.80,3.747,-.55,m=linen)
coffee('west reading table',-8.7,1.98,3.747)
shelves('west reading bookcase',-8.6,5.85,3.747,4.0)
pendant('west reading pendant',-8.8,2.00,6.12,6.82)

# East living and upper lounge get consistent full furniture detail; exterior patio stays as approved.
rug('east living wool rug',8.2,.65,.251,5.00,3.85)
sofa('east living sofa',8.3,2.0,.285)
armchair('east living chair',10.45,-.35,.285,-.6,m=cognac)
coffee('east living table',8.05,.18,.285)
sideboard('east living storage',8.35,4.45,.285,3.2)
pendant('east living pendant',8.1,.32,2.62,3.30)
rug('east upper wool rug',8.15,-1.20,3.708,5.20,3.9)
sofa('east upper sofa',8.0,-.2,3.747)
armchair('east upper chair',10.5,-2.42,3.747,-.65,m=olive)
coffee('east upper table',7.98,-2.08,3.747)
sideboard('east upper credenza',8.3,2.40,3.747,3.15)
pendant('east upper pendant',7.9,-1.82,6.16,6.80)
shelves('tall bay bookcase',-5.18,-1.40,.285,1.8)
armchair('garden alcove chair one',.2,.75,.285,-.2,m=linen)
armchair('garden alcove chair two',2.1,.75,.285,.2,m=linen)
coffee('garden alcove table',1.15,-.38,.285)

# Original architectural and camera locks: only furnishings/materials changed.
for name,data in protected.items():
    o=s.objects[name]
    assert len(o.data.vertices)==len(data['vertices']),name
    assert all((v.co-Vector(a)).length<1e-6 for v,a in zip(o.data.vertices,data['vertices'])),name
    assert all(abs(o.matrix_world[i][j]-data['matrix'][i][j])<1e-6 for i in range(4) for j in range(4)),name
assert all(abs(base_camera.matrix_world[i][j]-base_matrix[i][j])<1e-6 for i in range(4) for j in range(4))
root['review_status']='V04 interior furniture refinement; exterior preserved; awaiting visual review'

def camera(name,loc,target,lens):
    bpy.ops.object.camera_add(location=loc);o=bpy.context.object;o.name='V04 · '+name
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    o.data.type='PERSP';o.data.lens=lens;o.data.dof.use_dof=False;return o

living_cam=camera('inside west living room',(-11.65,-4.55,1.79),(-8.50,-1.72,1.00),24)
reading_cam=camera('inside west reading room',(-11.50,1.12,5.28),(-8.45,3.84,4.88),30)
preview='--interior-preview' in sys.argv
s.cycles.samples=48 if preview else 192
s.cycles.transmission_bounces=12
shots=[(base_camera,'house-interiors-v04.png',(2560,1440)),
       (living_cam,'living-room-v04.png',(1920,1080)),
       (reading_cam,'reading-room-v04.png',(1920,1080))]
if preview:shots=[(living_cam,'living-room-preview-v04.png',(1280,720))]
for cam,filename,size in shots:
    s.camera=cam;s.render.resolution_x,s.render.resolution_y=size
    s.render.filepath=str(OUT/filename);bpy.ops.render.render(write_still=True)
s.camera=base_camera;s.render.resolution_x=2560;s.render.resolution_y=1440;s.render.filepath=str(OUT/'house-interiors-v04.png')
if not preview:
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'opai-interiors-v04.blend'))
    report={'version':4,'model':'opai-interiors-v04.blend','source':'opai-refined-house-v03.blend',
            'builder':'interiors-v04.py','objects':len(s.objects),'removed_placeholders':removed,
            'protected_exterior':protected,'hero_matrix':base_matrix,'hero_scale':base_camera.data.ortho_scale,
            'shots':[{'name':filename,'size':size,'camera':cam.name,'lens':cam.data.lens,'dof':False} for cam,filename,size in shots],
            'changes':['Sculpted soft upholstery instead of block cushions','Continuous curved armchair shells',
                       'Pedestal stone tables and hollow vases','Complete open shelving with books and closed credenzas',
                       'Woven rugs, pendants and clean optical glass'],
            'limits':['Original concept furniture, no branded catalogue assets','No architectural or hero camera changes',
                      'No website changes, animation, deployment or push']}
    (OUT/'manifest-v04.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('INTERIOR_V04_COMPLETE',flush=True)
