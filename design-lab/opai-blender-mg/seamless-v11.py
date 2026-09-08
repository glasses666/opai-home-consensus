"""Whole letter silhouettes during exact assembled hold; original pieces otherwise."""
import bpy, math, json
from pathlib import Path
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-smooth-v10.blend'))
s=bpy.context.scene;s.frame_set(42)
def arc(cx,cy,rx,ry,a,b,n=96):return [(cx+rx*math.cos(a+(b-a)*i/n),cy+ry*math.sin(a+(b-a)*i/n)) for i in range(n+1)]
report=[]
for li,letter in enumerate('OPPEIN'):
    parts=sorted([o for o in s.objects if o.name.startswith(f'{li}_{letter}_part')],key=lambda o:o.name)
    pts=[(p.co.x+o.location.x,p.co.y+o.location.z) for o in parts for sp in o.data.splines for p in sp.points]
    x0,x1=min(x for x,y in pts),max(x for x,y in pts);y0,y1=min(y for x,y in pts),max(y for x,y in pts)
    if li==0:paths=[arc(.5,.5,.5,.5,0,2*math.pi)[:-1],arc(.5,.5,.265,.265,2*math.pi,0)[:-1]]
    elif li in (1,2):paths=[[(0,0),(.28,0),(.28,.45)]+arc(.57,.725,.43,.275,-math.pi/2,math.pi/2)+[(0,1)],[(.28,.605),(.28,.845)]+arc(.57,.725,.19,.12,math.pi/2,-math.pi/2)]
    elif li==3:paths=[[(0,0),(1,0),(1,.2),(.28,.2),(.28,.4),(.91,.4),(.91,.6),(.28,.6),(.28,.8),(1,.8),(1,1),(0,1)]]
    elif li==4:paths=[[(0,0),(1,0),(1,1),(0,1)]]
    else:paths=[[(0,0),(.24,0),(.24,.64),(.76,0),(1,0),(1,1),(.76,1),(.76,.36),(.24,1),(0,1)]]
    c=bpy.data.curves.new(f'{li}_{letter}_solid','CURVE');c.dimensions='2D';c.fill_mode='BOTH';c.extrude=.095;c.bevel_depth=.004;c.bevel_resolution=5
    for path in paths:
        sp=c.splines.new('POLY');sp.points.add(len(path)-1);sp.use_cyclic_u=True
        for p,(u,v) in zip(sp.points,path):p.co=(x0+u*(x1-x0),y0+v*(y1-y0),0,1)
    c.materials.append(parts[0].data.materials[0])
    ob=bpy.data.objects.new(c.name,c);s.collection.objects.link(ob);ob.parent=parts[0].parent;ob.rotation_euler.x=math.pi/2
    holds=[]
    for frame in range(1,97):
        s.frame_set(frame)
        assembled=all(abs(v-1)<1e-7 for part in parts for v in part.scale)
        ob.hide_render=not assembled;ob.hide_viewport=not assembled
        for prop in ('hide_render','hide_viewport'):ob.keyframe_insert(prop,frame=frame)
        for part in parts:
            part.hide_render=assembled;part.hide_viewport=assembled
            for prop in ('hide_render','hide_viewport'):part.keyframe_insert(prop,frame=frame)
        if assembled:holds.append(frame)
    report.append({'letter':letter,'index':li,'solid_frames':holds})
s.frame_set(42);s.render.filepath=str(OUT/'v11-seamless-still.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-seamless-v11.blend'))
bpy.ops.render.render(write_still=True)
(OUT/'seamless-v11-manifest.json').write_text(json.dumps({'method':'Matching single-silhouette letter on exact unit-scale hold, stroke pieces during animation','visibility':report,'resolution':[1920,1080],'samples':64,'limit':'Geometric reconstruction; not official vector source'},indent=2))
