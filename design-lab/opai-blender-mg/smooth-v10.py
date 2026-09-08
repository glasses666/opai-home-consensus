"""Regularize raster-derived strokes into clean lines and analytic arcs."""
import bpy, math, json
from pathlib import Path
OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'oppein-mg-1080p-v08.blend'))
scene=bpy.context.scene;scene.frame_set(42)
def rect(x0,y0,x1,y1):return [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]
def arc(cx,cy,rx,ry,a,b,n=48):
    return [(cx+rx*math.cos(a+(b-a)*i/n),cy+ry*math.sin(a+(b-a)*i/n)) for i in range(n+1)]
report=[]
for li,letter in enumerate('OPPEIN'):
    objects=sorted([o for o in scene.objects if o.name.startswith(f'{li}_{letter}_part')],key=lambda o:o.name)
    pts=[(p.co.x+o.location.x,p.co.y+o.location.z) for o in objects for sp in o.data.splines for p in sp.points]
    xmin,xmax=min(x for x,y in pts),max(x for x,y in pts)
    ymin,ymax=min(y for x,y in pts),max(y for x,y in pts)
    if li==0:
        paths=[]
        for a,b in [(math.pi/2,math.pi),(0,math.pi/2),(-math.pi/2,0),(-math.pi,-math.pi/2)]:
            paths.append(arc(.5,.5,.5,.5,a,b)+arc(.5,.5,.265,.265,b,a))
    elif li in (1,2):
        top=[(.28,1)]+arc(.57,.725,.43,.275,math.pi/2,0)+arc(.57,.725,.19,.12,0,math.pi/2)+[(.28,.845)]
        bottom=[(.28,.605)]+arc(.57,.725,.19,.12,-math.pi/2,0)+arc(.57,.725,.43,.275,0,-math.pi/2)+[(.28,.45)]
        paths=[rect(0,0,.28,1),top,bottom]
    elif li==3:
        paths=[rect(0,0,.28,1),rect(.28,.8,1,1),rect(.28,.4,.91,.6),rect(.28,0,1,.2)]
    elif li==4:
        paths=[rect(0,2/3,1,1),rect(0,1/3,1,2/3),rect(0,0,1,1/3)]
    else:
        paths=[rect(0,0,.24,1),[(.24,1),(.76,.36),(.76,0),(.24,.64)],rect(.76,0,1,1)]
    assert len(paths)==len(objects)
    for ob,path in zip(objects,paths):
        c=ob.data;c.splines.clear()
        sp=c.splines.new('POLY');sp.points.add(len(path)-1);sp.use_cyclic_u=True
        for p,(u,v) in zip(sp.points,path):p.co=(xmin+u*(xmax-xmin)-ob.location.x,ymin+v*(ymax-ymin)-ob.location.z,0,1)
        c.bevel_depth=.004;c.bevel_resolution=5
    report.append({'letter_index':li,'letter':letter,'bounds':[xmin,ymin,xmax,ymax],'parts':len(paths)})
scene.render.filepath=str(OUT/'v10-smooth-still.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'oppein-mg-smooth-v10.blend'))
bpy.ops.render.render(write_still=True)
(OUT/'smooth-v10-manifest.json').write_text(json.dumps({'method':'Regularized line and ellipse strokes within previous letter bounds; no replacement font','letters':report,'preserved':'Letter bounds, object transforms, all animation, colors, lights and camera','limitation':'Clean geometric reconstruction from previous raster proportions, not official vector artwork','resolution':[1920,1080],'samples':64},indent=2))
