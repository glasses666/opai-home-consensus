"""Independent stroke blocks, local-center elastic scale, seamless 3s loop."""
import bpy, math, json, ast
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-assembly-v01.blend'))
scene=bpy.context.scene;scene.frame_set(120);scene.frame_end=72
root=bpy.data.objects['OPPEIN_ASSEMBLY']
ivory=bpy.data.materials['MG pearl grey - no texture']
# Reuse the reviewed reference-contour helpers, without executing the V01 builder.
tree=ast.parse((OUT/'build.py').read_text())
for node in tree.body:
    if isinstance(node,ast.FunctionDef) and node.name in ('loops','simplify'):
        exec(compile(ast.Module(body=[node],type_ignores=[]),'contour-helper','exec'))
for ob in list(scene.objects):
    if '_stroke_' in ob.name:bpy.data.objects.remove(ob,do_unlink=True)
img=bpy.data.images.load(str(OUT.parent/'opai-preloader/assets/oppein-official-header.jpg'))
w,h=img.size;pixels=list(img.pixels)
mask={(x,y) for x in range(12,151) for y in range(2,33) if max(pixels[((h-1-y)*w+x)*4:((h-1-y)*w+x)*4+3])<.42}
cols=sorted({x for x,y in mask});ranges=[]
for x in cols:
    if not ranges or x>ranges[-1][-1]+1:ranges.append([x])
    else:ranges[-1].append(x)
pieces=[];counts={}
for li,xs in enumerate(ranges):
    cells={(x,y) for x,y in mask if x in xs}
    lo,hi=min(xs),max(xs);top=min(y for x,y in cells);bottom=max(y for x,y in cells)
    width=hi-lo+1;hh=bottom-top+1;cx=(lo+hi+1)/2;cy=(top+bottom+1)/2
    groups={}
    for x,y in cells:
        u=(x+.5-lo)/width;v=(y+.5-top)/hh
        if li==0:part=int((math.atan2(y+.5-cy,x+.5-cx)+math.pi)/(math.pi/2))%4
        elif li in (1,2):part=0 if u<.30 else (1 if v<.34 else 2)
        elif li==3:part=0 if u<.30 else 1+min(2,int(v*3))
        elif li==4:part=min(2,int(v*3))
        else:part=0 if u<.24 else (2 if u>.76 else 1)
        groups.setdefault(part,set()).add((x,y))
    counts[str(li)]=len(groups)
    for part,g in sorted(groups.items()):
        curve=bpy.data.curves.new(f'{li}_{"OPPEIN"[li]}_part{part}','CURVE');curve.dimensions='2D';curve.fill_mode='BOTH';curve.extrude=.095;curve.bevel_depth=.007;curve.bevel_resolution=3
        mx=(min(x for x,y in g)+max(x for x,y in g)+1)/2
        my=(min(y for x,y in g)+max(y for x,y in g)+1)/2
        for loop in loops(g):
            for _ in range(3):
                loop=[p for a,b in zip(loop,loop[1:]+loop[:1]) for p in [(.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]),(.25*a[0]+.75*b[0],.25*a[1]+.75*b[1])]]
            loop=simplify(loop+[loop[0]],.09)[:-1]
            if len(loop)<3:continue
            sp=curve.splines.new('POLY');sp.points.add(len(loop)-1)
            for p,(x,y) in zip(sp.points,loop):p.co=((x-mx)*.032,(my-y)*.032,0,1)
            sp.use_cyclic_u=True
        ob=bpy.data.objects.new(curve.name,curve);scene.collection.objects.link(ob);ob.parent=root
        ob.rotation_euler[0]=math.pi/2;ob.location=((mx-76)*.032,0,(32-my)*.032+.025)
        curve.materials.append(ivory);pieces.append(ob)
for ob in scene.objects:
    if ob.name.startswith('Orange bracket'):
        ob.animation_data_clear();ob.scale=(1,1,1);pieces.append(ob)
assert counts['0']==4
def spring(u):
    if u<=0:return 0.
    if u>=1:return 1.
    return 1-math.exp(-7*u)*(math.cos(11*u)+7/11*math.sin(11*u))
def scale_at(t,i):
    enter=.08+i*.018;leave=1.65+i*.012
    if t<enter:return 0.
    if t<enter+.65:return spring((t-enter)/.65)
    if t<leave:return 1.
    u=(t-leave)/.55
    if u>=1:return 0.
    if u<.22:return 1+.07*math.sin(math.pi/2*u/.22)
    q=(u-.22)/.78
    return 1.07*(1-q)**3
for i,ob in enumerate(pieces):
    for frame in range(1,73):
        s=scale_at((frame-1)/24,i)
        ob.scale=(s,s,s);ob.keyframe_insert('scale',frame=frame)
    for layer in ob.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:k.interpolation='LINEAR'
    assert scale_at(0,i)==scale_at(71/24,i)==0
    assert scale_at(1.3,i)==1
scene.cycles.seed=0
scene.cycles.use_animated_seed=False
scene.frame_set(32)
scene.render.filepath=str(OUT/'v04-assembled.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-elastic-v04.blend'))
bpy.ops.render.render(write_still=True)
scene.frame_set(14);scene.render.filepath=str(OUT/'v04-expanding.png');bpy.ops.render.render(write_still=True)
(OUT/'elastic-v04-manifest.json').write_text(json.dumps({'counts':counts,'total_parts':len(pieces),'fps':24,'frames':72,'seconds':3,'entry':'local-center damped spring with overshoot','exit':'7 percent anticipation then rapid shrink','checks':'O four parts; all scales zero at loop ends; all scales one on hold; fixed geometry centers','limits':'transform-based softness, not deformable sponge simulation; raster-derived logo outlines'},indent=2))
print('ELASTIC_V04_CHECKS_PASSED',len(pieces))
