"""Local MG study: trace the supplied Latin mark, extrude and assemble.
Run with Blender --background --python build.py. No external packages.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector

OUT = Path(__file__).resolve().parent
OUT.mkdir(exist_ok=True)
(OUT/'frames').mkdir(exist_ok=True)
SOURCE = OUT.parent/'opai-preloader/assets/oppein-official-header.jpg'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=12
scene.cycles.use_denoising=True
scene.render.resolution_x=960
scene.render.resolution_y=540
scene.render.resolution_percentage=100
scene.render.fps=24
scene.frame_start=1
scene.frame_end=120
scene.world=bpy.data.worlds.new('Soft studio')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(0.78,0.81,0.85,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=0.6
scene.view_settings.view_transform='AgX'

def mat(name,col):
    m=bpy.data.materials.new(name); m.diffuse_color=(*col,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*col,1)
    bs.inputs['Roughness'].default_value=.36
    return m
ivory=mat('MG pearl grey - no texture',(.30,.34,.39))
orange=mat('Brand orange',(.95,.245,.025))
ground=mat('Clean cool grey',(.82,.85,.89))
ground.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=1
root=bpy.data.objects.new('OPPEIN_ASSEMBLY',None); scene.collection.objects.link(root)
pieces=[]

def animate(obj,i):
    obj.parent=root
    final=obj.location.copy()
    start=3+i*3
    offset=Vector((0, -.28 if i%2 else .22, .55 if i%2 else -.38))
    obj.location=final+offset; obj.scale=(.001,)*3
    obj.keyframe_insert('location',frame=1); obj.keyframe_insert('scale',frame=1)
    obj.keyframe_insert('location',frame=start); obj.keyframe_insert('scale',frame=start)
    obj.scale=(1,1,1);obj.keyframe_insert('scale',frame=start+5)
    obj.location=final;obj.keyframe_insert('location',frame=start+21)
    obj.keyframe_insert('location',frame=120)
    pieces.append(obj)

# Pixel-edge loops maintain the reference's holes and spacing, not substitute typography.
img=bpy.data.images.load(str(SOURCE)); w,h=img.size; pixels=list(img.pixels)
def dark(x,y):
    p=((h-1-y)*w+x)*4
    return max(pixels[p:p+3])<.42
mask={(x,y) for x in range(12,151) for y in range(2,33) if dark(x,y)}
def loops(cells):
    edges={}
    for x,y in cells:
        for a,b,neighbor in [((x,y),(x+1,y),(x,y-1)),((x+1,y),(x+1,y+1),(x+1,y)),((x+1,y+1),(x,y+1),(x,y+1)),((x,y+1),(x,y),(x-1,y))]:
            if neighbor not in cells: edges.setdefault(a,[]).append(b)
    out=[]
    while edges:
        first=next(iter(edges)); p=first; chain=[]
        while True:
            chain.append(p); q=edges[p].pop()
            if not edges[p]: del edges[p]
            p=q
            if p==first:break
        if len(chain)>5:out.append(chain)
    return out
def simplify(points,eps=.38):
    if len(points)<3:return points
    a,b=Vector(points[0]),Vector(points[-1]);d=b-a
    ds=[(Vector(p)-a-d*max(0,min(1,(Vector(p)-a).dot(d)/max(d.length_squared,1e-9)))).length for p in points]
    k=max(range(len(ds)),key=ds.__getitem__)
    if ds[k]>eps:return simplify(points[:k+1],eps)[:-1]+simplify(points[k:],eps)
    return [points[0],points[-1]]

# Detect six connected x ranges; each letter becomes two complementary stroke groups.
cols=sorted({x for x,y in mask}); ranges=[]
for x in cols:
    if not ranges or x>ranges[-1][-1]+1:ranges.append([x])
    else:ranges[-1].append(x)
assert len(ranges)==6, ranges
for li,xs in enumerate(ranges):
    for half in range(2):
        cells={(x,y) for x,y in mask if x in xs and (y<17)==(half==1)}
        curve=bpy.data.curves.new(f'{"OPPEIN"[li]}_stroke_{half}','CURVE');curve.dimensions='2D'
        curve.resolution_u=12;curve.fill_mode='BOTH';curve.extrude=.095;curve.bevel_depth=.009;curve.bevel_resolution=3
        for loop in loops(cells):
            # Subpixel corner cutting removes raster stair steps without substituting a font.
            for _ in range(3):
                loop=[p for a,b in zip(loop,loop[1:]+loop[:1]) for p in
                      [(.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]),(.25*a[0]+.75*b[0],.25*a[1]+.75*b[1])]]
            loop=simplify(loop+[loop[0]],.09)[:-1]
            if len(loop)<3:continue
            sp=curve.splines.new('POLY');sp.points.add(len(loop)-1)
            for p,(x,y) in zip(sp.points,loop):p.co=((x-76)*.032,(32-y)*.032,0,1)
            sp.use_cyclic_u=True
        obj=bpy.data.objects.new(curve.name,curve);scene.collection.objects.link(obj)
        obj.rotation_euler[0]=math.pi/2;obj.location.z=.025;curve.materials.append(ivory)
        animate(obj,li*2+half)

def block(name,location,size,material):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location)
    ob=bpy.context.object;ob.name=name;ob.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bevel=ob.modifiers.new('Small clean bevel','BEVEL');bevel.width=.01;bevel.segments=3
    ob.data.materials.append(material);return ob
for i,(loc,size) in enumerate([((-2.40,0,.54),(.052,.21,1.08)),((-1.95,0,1.065),(.94,.21,.052)),((-1.95,0,.025),(.94,.21,.052))]):
    animate(block('Orange bracket '+str(i),loc,size,orange),i)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.035));bpy.context.object.data.materials.append(ground)
def aim(ob,target):ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
for name,loc,power,size in [('Key',(-3,-4,7),550,5),('Fill',(4,-1,4),220,4)]:
    bpy.ops.object.light_add(type='AREA',location=loc);ob=bpy.context.object;ob.name=name;ob.data.energy=power;ob.data.shape='DISK';ob.data.size=size;aim(ob,(0,0,.4))
bpy.ops.object.camera_add(location=(1.3,-10,3.7));cam=bpy.context.object;cam.name='MG review camera';aim(cam,(0,0,.55));cam.data.type='ORTHO';cam.data.ortho_scale=15.5;scene.camera=cam
scene.frame_set(95)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(OUT/'assembled.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-assembly-v01.blend'))
bpy.ops.render.render(write_still=True)
scene.frame_set(35);scene.render.filepath=str(OUT/'assembling.png');bpy.ops.render.render(write_still=True)
(OUT/'manifest.json').write_text(json.dumps({'source':str(SOURCE.relative_to(OUT.parent)), 'blender':bpy.app.version_string,'pieces':len(pieces),'frames':120,'fps':24,'size':[960,540],'direction':'MG plain materials, Latin only, small centered assembly','limitation':'Low-resolution official raster contour; final vector source still needed'},indent=2))
