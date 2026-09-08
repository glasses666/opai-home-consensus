"""Union animated 2D contours before extrusion, using boundary arrangements."""
import bpy, math, json
from pathlib import Path
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-smooth-v10.blend'))
s=bpy.context.scene
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def sub(a,b):return (a[0]-b[0],a[1]-b[1])
def inside(p,poly):
    hit=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:hit=not hit
    return hit
def union(polys):
    edges=[]
    for idx,poly in enumerate(polys):
        for a,b in zip(poly,poly[1:]+poly[:1]):edges.append((idx,a,b))
    kept=[]
    for idx,a,b in edges:
        r=sub(b,a);ts=[0.,1.]
        for j,c,d in edges:
            if j==idx:continue
            if max(a[0],b[0])+1e-9<min(c[0],d[0]) or max(c[0],d[0])+1e-9<min(a[0],b[0]) or max(a[1],b[1])+1e-9<min(c[1],d[1]) or max(c[1],d[1])+1e-9<min(a[1],b[1]):continue
            q=sub(d,c);den=cross(r,q)
            if abs(den)<1e-12:
                if abs(cross(sub(c,a),r))<1e-10:
                    rr=r[0]*r[0]+r[1]*r[1]
                    if rr>1e-14:
                        for end in (c,d):
                            delta=sub(end,a);v=(delta[0]*r[0]+delta[1]*r[1])/rr
                            if 0<v<1:ts.append(v)
                continue
            t=cross(sub(c,a),q)/den;u=cross(sub(c,a),r)/den
            if -1e-9<=t<=1+1e-9 and -1e-9<=u<=1+1e-9:ts.append(max(0,min(1,t)))
        ts=sorted(set(round(t,10) for t in ts))
        for t,u in zip(ts,ts[1:]):
            if u-t<1e-8:continue
            mid=(a[0]+r[0]*(t+u)/2,a[1]+r[1]*(t+u)/2)
            length=math.hypot(*r)
            outside=(mid[0]+r[1]/length*1e-8,mid[1]-r[0]/length*1e-8)
            if any(inside(outside,p) for p in polys):continue
            kept.append(((a[0]+r[0]*t,a[1]+r[1]*t),(a[0]+r[0]*u,a[1]+r[1]*u)))
    key=lambda p:(round(p[0],7),round(p[1],7))
    graph={}
    seen=set()
    for a,b in kept:
        edge=(key(a),key(b))
        if edge in seen:continue
        seen.add(edge);graph.setdefault(key(a),[]).append((a,b))
    result=[]
    while graph:
        start=next(iter(graph));at=start;loop=[]
        for _ in range(len(kept)+1):
            options=graph.get(at)
            if not options:raise RuntimeError(f'Open union boundary {at}')
            a,b=options.pop()
            if not options:del graph[at]
            loop.append(a);at=key(b)
            if at==start:break
        assert at==start
        if len(loop)>2:result.append(loop)
    return result
sources=[o for o in s.objects if o.type=='CURVE' and '_part' in o.name]
def scale(ob,f):
    return next(fc for l in ob.animation_data.action.layers for st in l.strips for bag in st.channelbags for fc in bag.fcurves if fc.data_path=='scale' and fc.array_index==0).evaluate(f)
cache={};frames={}
for f in range(1,97):
    visible=[]
    for li in range(6):
        parts=sorted([o for o in sources if o.name.startswith(f'{li}_')],key=lambda o:o.name)
        scales=tuple(float(scale(o,f)) for o in parts);key=(li,scales)
        if key not in cache:
            polygons=[]
            for o,v in zip(parts,scales):
                if v<.0001:continue
                for sp in o.data.splines:
                    # A small geometric overlap closes subpixel undershoot gaps.
                    poly=[(p.co.x*v*1.012+o.location.x,p.co.y*v*1.012+o.location.z) for p in sp.points]
                    area=sum(cross(a,b) for a,b in zip(poly,poly[1:]+poly[:1]))
                    if area<0:poly.reverse()
                    polygons.append(poly)
            loops=union(polygons) if polygons else []
            if loops:
                c=bpy.data.curves.new(f'Union_{li}_{f:03d}','CURVE');c.dimensions='2D';c.fill_mode='BOTH';c.extrude=.095;c.bevel_depth=.004;c.bevel_resolution=5
                for loop in loops:
                    sp=c.splines.new('POLY');sp.points.add(len(loop)-1);sp.use_cyclic_u=True
                    for p,(x,y) in zip(sp.points,loop):p.co=(x,y,0,1)
                c.materials.append(parts[0].data.materials[0]);ob=bpy.data.objects.new(c.name,c);s.collection.objects.link(ob);ob.parent=parts[0].parent;ob.rotation_euler.x=math.pi/2
                cache[key]=ob
            else:cache[key]=None
        if cache[key]:visible.append(cache[key])
    frames[f]=visible
    print('PLANAR',f,flush=True)
for ob in sources:ob.hide_render=True;ob.hide_viewport=True
for ob in set(o for o in cache.values() if o):
    for f in range(1,97):
        ob.hide_render=ob not in frames[f];ob.hide_viewport=ob.hide_render
        ob.keyframe_insert('hide_render',frame=f);ob.keyframe_insert('hide_viewport',frame=f)
s.frame_set(20);s.render.filepath=str(OUT/'v13-rebound-check.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-planar-v13.blend'))
bpy.ops.render.render(write_still=True)
(OUT/'planar-v13-manifest.json').write_text(json.dumps({'method':'2D contour union before extrusion; shared depth; exterior bevel','frames':96,'resolution':[1920,1080],'samples':64,'stroke_overlap_scale':1.012,'unique_states':len(cache),'limit':'Discrete 24fps geometry bake; original XY timing preserved, depth fixed'},indent=2))
