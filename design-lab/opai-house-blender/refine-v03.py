"""Additive detailing of accepted V02 massing; never overwrites the source blend.

Preview: Blender -b --python refine-v03.py -- --detail-preview
Final:   Blender -b --python refine-v03.py
"""
import bpy
import math
import random
import json
import sys
from mathutils import Vector
from pathlib import Path
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'opai-video-house-v02.blend'))
s=bpy.context.scene
root=bpy.data.objects['V02 · video reference courtyard residence']
base_names=set(o.name for o in s.objects)
camera_matrix=[list(r) for r in s.camera.matrix_world]
structural={o.name:{'matrix':[list(r) for r in o.matrix_world],
                    'verts':[list(v.co) for v in o.data.vertices]}
            for o in s.objects if o.type=='MESH' and any(k in o.name.lower() for k in
            ['roof','floor','slab','plinth','wall','jamb','column','pier'])}

def material(name,color,rough=.5,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1)
    m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.name='Principled BSDF'
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    return m

stone=bpy.data.materials['Ivory limestone · honed']
wood=bpy.data.materials['Oiled oak']
fabric=bpy.data.materials['Natural linen']
bronze=bpy.data.materials['Bronze anodised aluminium']
plaster=bpy.data.materials['Warm mineral plaster']
joint=material('V03 · fine warm mineral joints',(.40,.38,.32),.82)
rubber=material('V03 · window gasket',(.055,.052,.045),.72)
metal=material('V03 · brushed champagne hardware',(.40,.35,.25),.28,.8)
piping=material('V03 · linen seam thread',(.48,.46,.39),.95)
curtain=material('V03 · ivory woven curtain',(.78,.75,.67),.92)
ceramic=material('V03 · ivory ceramic',(.65,.62,.54),.3)
leaf_mats=[material('V03 · olive leaf '+str(i),c,.62) for i,c in enumerate([
    (.12,.175,.068),(.18,.22,.10),(.22,.265,.125),(.28,.30,.16),(.15,.205,.088)])]

def box(name,loc,size,mat,bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object;o.name='V03 · '+name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.parent=root;o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Small edge radius','BEVEL');mod.width=bevel;mod.segments=3
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def tube(name,coords,r,mat,closed=False):
    c=bpy.data.curves.new('V03 · '+name,'CURVE');c.dimensions='3D';c.resolution_u=12
    c.bevel_depth=r;c.bevel_resolution=3
    sp=c.splines.new('POLY');sp.points.add(len(coords)-1)
    for p,co in zip(sp.points,coords):p.co=(*co,1)
    sp.use_cyclic_u=closed
    o=bpy.data.objects.new(c.name,c);s.collection.objects.link(o);o.parent=root;o.data.materials.append(mat)
    return o

def bounds(o):
    pts=[o.matrix_world@Vector(v) for v in o.bound_box]
    return [min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]

# Real microrelief: colour variation is restrained so the accepted warm/white palette stays intact.
for m,c1,c2 in [(stone,(.65,.615,.535,1),(.76,.727,.647,1)),
                (bpy.data.materials['Travertine terrace'],(.57,.54,.46,1),(.69,.65,.56,1))]:
    nt=m.node_tree;p=nt.nodes.get('Principled BSDF')
    coord=nt.nodes.new('ShaderNodeTexCoord');n=nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value=4;n.inputs['Detail'].default_value=3
    nt.links.new(coord.outputs['Object'],n.inputs['Vector'])
    ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=c1;ramp.color_ramp.elements[1].color=c2
    nt.links.new(n.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs[0],p.inputs['Base Color'])
    pores=nt.nodes.new('ShaderNodeTexNoise');pores.inputs['Scale'].default_value=170
    nt.links.new(coord.outputs['Object'],pores.inputs['Vector'])
    bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.20;bump.inputs['Distance'].default_value=.002
    nt.links.new(pores.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],p.inputs['Normal'])

# Linen weave visible in a close shot, not exaggerated bump across the whole building.
for m in [fabric,curtain]:
    nt=m.node_tree;p=nt.nodes.get('Principled BSDF')
    n=nt.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=230;n.inputs['Detail'].default_value=2
    b=nt.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.15;b.inputs['Distance'].default_value=.0015
    nt.links.new(n.outputs['Fac'],b.inputs['Height']);nt.links.new(b.outputs['Normal'],p.inputs['Normal'])
    p.inputs['Sheen Weight'].default_value=.24

# Thinner balustrades; window mullions remain unchanged. Real gasket/threshold lines stay subtle.
rail_edits=[]
for o in list(s.objects):
    if o.type!='MESH':continue
    is_rail=any(word in o.name for word in ['rail','terrace glass'])
    if is_rail and ('mullion' in o.name or 'edge' in o.name):
        for v in o.data.vertices:
            for a in range(3):
                if o.dimensions[a]<.10:v.co[a]*=.65
        rail_edits.append(o.name)
    if 'glazing' in o.name and 'edge' in o.name and o.dimensions.z<.10:
        lo,hi=bounds(o)
        if o.dimensions.x>1:
            box('recessed glazing track',(o.location.x,o.location.y+.055,o.location.z-.008),
                (o.dimensions.x,.025,.018),rubber,.002)
for x,y,z in [(-8.58,-5.125,1.53),(-8.54,.625,5.02),(6.1,-4.265,5.05),(8.0,-2.445,1.55)]:
    box('sliding door handle',(x,y,z),(.022,.045,.34),metal,.008)
    for dz in [-.12,.12]:box('handle mounting',(x,y+.025,z+dz),(.028,.075,.025),metal,.004)

# Stone cladding's physical horizontal joints, on the actual exposed surface.
for o in list(s.objects):
    if o.name not in base_names:continue
    if 'full height stone jamb' in o.name or 'courtyard wall' in o.name and 'Tall bay' in o.name:
        lo,hi=bounds(o)
        for k in range(1,8):
            z=lo[2]+k*.82
            if z>=hi[2]-.1:continue
            if hi[1]-lo[1]>1:
                box('stone return horizontal joint',(hi[0]+.001,(lo[1]+hi[1])/2,z),(.002,hi[1]-lo[1]-.025,.006),joint,0)
            else:
                box('stone jamb horizontal joint',((lo[0]+hi[0])/2,lo[1]-.001,z),(hi[0]-lo[0],.002,.006),joint,0)

# Roof finish seams are quiet, widely spaced; no objects or props added on the roofs.
for o in list(s.objects):
    if 'continuous roof' not in o.name:continue
    lo,hi=bounds(o)
    for k in range(1,math.ceil((hi[0]-lo[0])/2)):
        x=lo[0]+k*2
        if x<hi[0]-.12:box('roof finish joint',(x,(lo[1]+hi[1])/2,hi[2]+.001),(.007,hi[1]-lo[1]-.15,.002),joint,0)
    for k in range(1,math.ceil((hi[1]-lo[1])/2)):
        y=lo[1]+k*2
        if y<hi[1]-.12:box('roof finish joint',((lo[0]+hi[0])/2,y,hi[2]+.001),(hi[0]-lo[0]-.15,.007,.002),joint,0)

# Soft curtains frame selected rooms; centre panes and sightlines remain open.
def drape(x,y,z,w,h):
    verts=[];faces=[];nx=72;ny=12
    for j in range(ny+1):
        for i in range(nx+1):
            u=i/nx;v=j/ny
            verts.append((x+(u-.5)*w,y+.052*math.cos(u*math.tau*6)+.014*math.sin(v*math.pi),
                          z+v*h+.014*math.sin(u*math.tau*6)*(1-v)))
    for j in range(ny):
        for i in range(nx):
            a=j*(nx+1)+i;faces.append((a,a+1,a+nx+2,a+nx+1))
    mesh=bpy.data.meshes.new('Pleated cloth mesh');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('V03 · sheer curtain',mesh);s.collection.objects.link(o);o.parent=root;o.data.materials.append(curtain)
    for p in mesh.polygons:p.use_smooth=True
    so=o.modifiers.new('Fabric thickness','SOLIDIFY');so.thickness=.002
    box('curtain ceiling track',(x,y,z+h+.018),(w+.13,.09,.038),plaster,.006)
for args in [(-11.35,.86,3.79,.65,2.93),(-6.10,.86,3.79,.60,2.93),
             (-11.15,-4.88,.31,.58,2.97),(11.76,-4.01,3.79,.60,2.94),
             (4.12,-2.18,.31,.58,2.94)]:drape(*args)

# Furniture: real support feet and round-cornered cushion piping in each object's local space.
for o in list(s.objects):
    if o.name.startswith('sofa oak shadow base'):
        for x in [-1.05,1.05]:
            for y in [-.29,.29]:
                p=o.matrix_world@Vector((x,y,-.17))
                leg=box('sofa recessed foot',p,(.075,.075,.14),bronze,.01)
                leg.rotation_euler.z=o.rotation_euler.z
    if o.name.startswith('linen seat'):
        hx,hy=o.dimensions.x/2-.018,o.dimensions.y/2-.018;r=.062
        co=[]
        for cx,cy,start in [(hx-r,hy-r,0),(-hx+r,hy-r,90),(-hx+r,-hy+r,180),(hx-r,-hy+r,270)]:
            for k in range(7):
                a=math.radians(start+k*15)
                co.append(o.matrix_world@Vector((cx+r*math.cos(a),cy+r*math.sin(a),o.dimensions.z/2-.028)))
        tube('upholstery piping',co,.0035,piping,True)

# A handful of grounded objects add scale without changing the furniture layout.
bookpaper=material('V03 · warm book paper',(.69,.66,.58),.92)
bookcover=material('V03 · olive cloth book cover',(.20,.24,.17),.8)
for x,y,z in [(9.07,-4.75,.666),(-9.32,-3.23,.806),(7.75,-2.02,4.286)]:
    b=box('table book pages',(x,y,z+.029),(.33,.25,.049),bookpaper,.005);b.rotation_euler.z=.11
    for dz in [.002,.058]:
        b=box('table book cover',(x,y,z+dz),(.345,.265,.006),bookcover,.002);b.rotation_euler.z=.11
    bpy.ops.mesh.primitive_torus_add(major_radius=.092,minor_radius=.014,major_segments=40,minor_segments=12,location=(x+.41,y+.08,z+.016))
    o=bpy.context.object;o.name='V03 · ceramic dish rim';o.parent=root;o.data.materials.append(ceramic)
    box('ceramic dish base',(x+.41,y+.08,z+.005),(.15,.15,.008),ceramic,.065)

# Replace coarse ico foliage with linked curved leaf meshes and denser, naturally varied clusters.
leafmesh=bpy.data.meshes.new('V03 · curved olive leaf mesh')
verts=[]
for j in range(9):
    t=j/8;w=.038*math.sin(math.pi*t)**.75
    verts.extend([(-w,(t-.5)*.18,.008*math.sin(math.pi*t)),(0,(t-.5)*.18,.017*math.sin(math.pi*t)),(w,(t-.5)*.18,.008*math.sin(math.pi*t))])
faces=[]
for j in range(8):
    for i in range(2):a=j*3+i;faces.append((a,a+3,a+4,a+1))
leafmesh.from_pydata(verts,[],faces);leafmesh.update()
for p in leafmesh.polygons:p.use_smooth=True
leaf_variants=[]
for m in leaf_mats:
    mesh=leafmesh.copy();mesh.materials.append(m);leaf_variants.append(mesh)
random.seed(303)
oldleaves=[o for o in s.objects if o.name.startswith('Courtyard olive foliage')]
for old in oldleaves:
    center=old.location.copy()
    # Only generated V02 leaf meshes are replaced. Branches, planter and trunk positions stay fixed.
    bpy.data.objects.remove(old,do_unlink=True)
    for k in range(5):
        o=bpy.data.objects.new('V03 · olive leaf',random.choice(leaf_variants));s.collection.objects.link(o);o.parent=root
        o.location=center+Vector((random.uniform(-.12,.12),random.uniform(-.12,.12),random.uniform(-.10,.10)))
        o.rotation_euler=(random.uniform(-.9,.9),random.uniform(-1,1),random.uniform(0,math.tau))
        sc=random.uniform(.65,1.12);o.scale=(sc,sc,sc)
# Pebble mulch replaces a flat dark rectangle without adding more landscaping.
pebble=material('V03 · planter river stone',(.32,.30,.24),.9)
for i in range(115):
    x=-1.4+random.uniform(-.76,.76);y=-4.3+random.uniform(-.65,.65)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x,y,.492))
    o=bpy.context.object;o.name='V03 · planter pebble';o.parent=root;o.scale=(.035,.026,.018)
    o.data.materials.append(pebble)

# Structural/hero camera lock is checked before rendering, not judged by approximate eye alone.
for name,old in structural.items():
    ob=bpy.data.objects[name]
    assert all(abs(ob.matrix_world[i][j]-old['matrix'][i][j])<1e-6 for i in range(4) for j in range(4)),name
    assert len(ob.data.vertices)==len(old['verts']),name
    assert all((v.co-Vector(co)).length<1e-6 for v,co in zip(ob.data.vertices,old['verts'])),name
assert all(abs(s.camera.matrix_world[i][j]-camera_matrix[i][j])<1e-6 for i in range(4) for j in range(4))
root['review_status']='V02 massing accepted; V03 detail review pending'
preview='--detail-preview' in sys.argv
s.cycles.samples=48 if preview else 160
s.render.resolution_x=1600 if preview else 2560;s.render.resolution_y=900 if preview else 1440
s.render.filepath=str(OUT/('house-detail-preview-v03.png' if preview else 'house-refined-v03.png'))
manifest={'version':3,'source_blend':'opai-video-house-v02.blend','model':'opai-refined-house-v03.blend',
          'hero':'house-refined-v03.png','detail':'house-courtyard-detail-v03.png',
          'builder':'refine-v03.py','engine':'CYCLES','samples':160,'resolution':[2560,1440],
          'objects':len(s.objects),'protected_structures':structural,'hero_camera_matrix':camera_matrix,
          'hero_ortho_scale':s.camera.data.ortho_scale,'rail_edits':rail_edits,'new_leaf_count':len(oldleaves)*5,
          'changes':['Stone microrelief and physical joints','Lighter balustrades and door hardware',
                     'Pleated curtains','Linen weave, piping and sofa feet','Curved olive leaves and pebble mulch','Books and ceramic dishes'],
          'limits':['No massing/layout/camera change','Original conceptual furniture, not an OPPEIN product catalogue',
                    'No animation, homepage replacement, deployment or push']}
if not preview:
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/manifest['model']))
    (OUT/'manifest-v03.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
bpy.ops.render.render(write_still=True)
if not preview:
    # A real second camera shot, not a fake detail created by sharpening the hero PNG.
    bpy.ops.object.camera_add(location=(-17,-25,11.8))
    c=bpy.context.object;c.name='V03 · courtyard detail review camera'
    c.rotation_euler=(Vector((-4.4,-2.0,2.7))-c.location).to_track_quat('-Z','Y').to_euler()
    c.data.type='ORTHO';c.data.ortho_scale=17.8;c.data.dof.use_dof=False
    hero=s.camera;s.camera=c;s.render.resolution_x=1920;s.render.resolution_y=1080
    s.render.filepath=str(OUT/'house-courtyard-detail-v03.png')
    bpy.ops.render.render(write_still=True)
    s.camera=hero;s.render.resolution_x=2560;s.render.resolution_y=1440
    s.render.filepath=str(OUT/'house-refined-v03.png')
    manifest['objects']=len(s.objects)
    manifest['detail_camera']={'name':c.name,'matrix':[list(r) for r in c.matrix_world],
                               'ortho_scale':c.data.ortho_scale,'resolution':[1920,1080]}
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/manifest['model']))
    (OUT/'manifest-v03.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('DETAIL_PASS_V03_COMPLETE',flush=True)
