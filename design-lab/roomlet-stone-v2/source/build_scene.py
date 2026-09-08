#!/usr/bin/env python3
"""Rebuild the ROOMLET 02 low-poly stone diorama, editable scene and animated GLBs.
Based on SCULPT / 01; geometry, assembly and choreography are all source-authored.
"""
from __future__ import annotations
import base64, json, math, struct
from pathlib import Path
import cadquery as cq
import numpy as np
from scipy.spatial import ConvexHull
from PIL import Image
from scipy.ndimage import gaussian_filter
from meshkit import *
from motion import LAYOUTS, DURATION, FPS, SMALL, BIG, create_motion

ROOT = Path(__file__).resolve().parents[1]
for folder in ['assets','src','models','docs']: (ROOT/folder).mkdir(exist_ok=True)
TEXTURES=[]; TEX={}

def texture(name, kind, size=256):
    rng=np.random.default_rng(27+len(TEXTURES))
    yy,xx=np.mgrid[0:size,0:size]/size; noise=rng.normal(0,1,(size,size))
    if kind=='oak':
        warp=.018*np.sin(2*PI*yy)+.006*np.sin(8*PI*yy)
        v=np.sin((xx*39+warp*30)*2*PI)*1.9+gaussian_filter(noise,(12,1),mode='wrap')*12+noise*.6
        rgb=np.array([211,179,137])[None,None,:]+v[:,:,None]
    elif kind=='linen':
        v=np.sin(xx*2*PI*97)*np.sin(yy*2*PI*97)*1.2+noise*.5
        rgb=np.array([247,244,235])[None,None,:]+v[:,:,None]
    else:
        v=gaussian_filter(noise,1.6,mode='wrap')*2.7+noise*.45
        rgb=np.array([244,244,242])[None,None,:]+v[:,:,None]
    p=ROOT/'assets'/f'{name}.png'; Image.fromarray(np.clip(rgb,0,255).astype('uint8')).save(p,optimize=True)
    TEX[name]=len(TEXTURES); TEXTURES.append({'name':name,'uri':f'assets/{name}.png','data':'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()})
for name,kind in [('oak-soft','oak'),('fabric-soft','linen'),('stone-grain','stone')]: texture(name,kind)

def mat(name,color,rough=.8,metal=0,tex=None):
    MAT[name]=len(MATS);MATS.append({'name':name,'color':list(color),'roughness':rough,'metalness':metal,'texture':TEX.get(tex,-1)})
mat('Stone_Grey', [.53,.55,.55],.97,tex='stone-grain')
mat('Wall_Chalk',[.89,.876,.827],.93)
mat('Oak_Light',[1,1,1],.74,tex='oak-soft')
mat('Floor_Light_Oak',[1.0,.98,.95],.88,tex='oak-soft')
mat('Sofa_Cloud',[.97,.935,.864],.95,tex='fabric-soft')
mat('Pillow_Apricot',[.80,.43,.28],.91,tex='fabric-soft')
mat('Chair_Sage',[.58,.66,.53],.91,tex='fabric-soft')
mat('Ceramic_Cream',[.95,.92,.83],.58)
mat('Lamp_Saffron',[.91,.67,.35],.47)
mat('Lamp_Underside',[1,.94,.77],.86)
mat('Pot_Terra',[.69,.36,.25],.85)
mat('Leaf_Olive',[.40,.52,.31],.83)
mat('Leaf_Light',[.58,.64,.38],.90)
mat('Trunk',[.36,.27,.18],.87)
mat('Earth',[.26,.23,.18],1)
mat('Shadow_Reveal',[.34,.32,.28],.98)
mat('Print_Clay',[.80,.49,.33],.94)
mat('Print_Sand',[.88,.77,.56],.94)

root=node('Roomlet_Stone_02',label='石间 · 动态房间摆件',kind='root')
arch=node('Architecture_Fixed',root,label='固定石壳、两墙与矩形地板',kind='architecture')
furn=node('Furniture_Editable',root,label='六件独立家具',kind='furniture-root')

# Broad spherical envelope, still made of individually shaded planar facets.
# The room cut, rectangular linings, furniture and motion below stay untouched.
points=[[.03,-2.40,.015]]
for y in [-2.08,-1.48,-.72,.05,.75,1.48,2.23]:
    ring=math.sqrt(1-((y-1.10)/3.50)**2)
    for i in range(16):
        angle=2*PI*i/16
        irregular=1+.012*math.sin(3*angle+.4)+.008*math.cos(5*angle)
        points.append([.03+3.65*ring*math.cos(angle)*irregular,y,
                       .015+3.30*ring*math.sin(angle)*irregular])
points=np.array(points);hull=ConvexHull(points)
faces=[]
for tri,eq in zip(hull.simplices,hull.equations):
    pts=points[tri]
    if np.dot(np.cross(pts[1]-pts[0],pts[2]-pts[0]),eq[:3])<0:pts=pts[::-1]
    wire=cq.Wire.makePolygon([cq.Vector(*map(float,p)) for p in pts],close=True)
    faces.append(cq.Face.makeFromWires(wire))
rock=cq.Solid.makeSolid(cq.Shell.makeShell(faces))
# Remove the complete positive-facing room quadrant above y=0. This opens both
# front edges AND the top, so no hidden roof or third/fourth wall is generated.
left,back=-2.205,-1.855
cut=cq.Workplane('XY').box(20,12,20).translate((left+10,6,back+10)).val()
rock=rock.cut(cut)
# Tidy the two end cuts; the main back/bottom contour remains irregular and faceted.
frontx=cq.Workplane('XY').box(20,12,20).translate((2.29+10,6,0)).val()
frontz=cq.Workplane('XY').box(20,12,20).translate((0,6,1.97+10)).val()
rock=rock.cut(frontx).cut(frontz).clean()
assert rock.isValid(), 'Stone boolean failed'
# Duplicate vertices per BREP face, preserving true planar normals and sharp facets.
p=[];n=[];f=[]
for face in rock.Faces():
    vs,fs=face.tessellate(.01,.1);vs=np.array([[v.x,v.y,v.z] for v in vs]);normal=np.array(face.normalAt().toTuple());offset=len(p)
    for tri in fs:
        tri=list(tri)
        if np.dot(np.cross(vs[tri[1]]-vs[tri[0]],vs[tri[2]]-vs[tri[0]]),normal)<0:tri=tri[::-1]
        f.append([offset+k for k in tri])
    p.extend(vs);n.extend([normal]*len(vs))
shellgeo=addgeo('Irregular_Carved_Polyhedron',p,f,n)
node('Shell_Stone_LowPoly',arch,shellgeo,'Stone_Grey',label='不规则棱角石质外壳',kind='shell')
# Export the actual solid as optional editable CAD geometry as well.
cq.exporters.export(rock,str(ROOT/'models'/'stone-shell.step'))

# Three separately modeled rectangular linings. Only these are room walls/floor.
box('Wall_Left',arch,(.080,2.045,3.76),(-2.158,1.0225,.018),'Wall_Chalk',.018,s=3)
NODES[-1].update(label='左墙',kind='wall')
box('Wall_Back',arch,(4.43,2.045,.080),(.015,1.0225,-1.808),'Wall_Chalk',.018,s=3)
NODES[-1].update(label='后墙',kind='wall')
box('Floor_Rectangular_Oak',arch,(4.36,.065,3.62),(.03,.0475,.015),'Floor_Light_Oak',.014,s=3)
NODES[-1].update(label='矩形浅木地板',kind='floor')
# Preserve the usable rectangular interior; soften only the two exposed edges
# into a shallow, irregular timber-to-stone apron, not a raised square slab.
floorgeo=NODES[-1]['geometry']
fp=[];ff=[];fu=[]
def smooth(v):
    v=max(0.,min(1.,v));return v*v*(3-2*v)
nx,nz=96,80
for j in range(nz+1):
    v=j/nz
    for i in range(nx+1):
        u=i/nx
        ex=.13+(.20+.075*math.sin(v*PI*4+.4))*(1-smooth((v-.8)/.2))
        ez=.13+(.22+.085*math.sin(u*PI*4-1))*(1-smooth((u-.8)/.2))
        x=-2.15+4.36*u+smooth((u-.88)/.12)*ex
        z=-1.795+3.62*v+smooth((v-.88)/.12)*ez
        t=max(smooth((u-.91)/.09),smooth((v-.91)/.09))
        y=.080*(1-t)-.003*t
        fp.append([x-.03,y-.0475,z-.015]);fu.append([x*.85,z*.6])
for j in range(nz):
    for i in range(nx):
        a=j*(nx+1)+i;b=a+1;c=a+nx+1;d=c+1
        ff.extend([[a,c,b],[b,c,d]])
addgeo('Floor_Rectangular_Core_Organic_Edge',fp,ff,uv=fu)
GEOS[floorgeo]=GEOS.pop()
# Fine base reveals. Wood grain stays in the texture, avoiding subpixel seams.
box('Wall_Left_Reveal',arch,(.013,.025,3.68),(-2.113,.103,.017),'Shadow_Reveal',.003,s=2)
box('Wall_Back_Reveal',arch,(4.31,.025,.013),(.04,.103,-1.762),'Shadow_Reveal',.003,s=2)

# A single flat relief, rather than a showroom wall full of accessories.
art=node('Wall_Art_Geometric',arch,label='固定几何装饰画',kind='decor')
box('Art_Oak_Frame',art,(.91,.92,.050),(-.30,1.46,-1.744),'Oak_Light',.035,s=4)
box('Art_Matte_Field',art,(.827,.837,.012),(-.30,1.46,-1.714),'Ceramic_Cream',.02,s=3)
# Layered simple relief shapes are real editable meshes, not a downloaded image.
node('Art_Sun',art,cylinder(.193,.193,.008,40),'Print_Sand',(-.46,1.62,-1.703),rot=(PI/2,0,0))
box('Art_Clay_Block',art,(.33,.36,.014),(-.18,1.30,-1.696),'Print_Clay',.15,s=8)
box('Art_Horizon',art,(.65,.013,.012),(-.30,1.245,-1.687),'Oak_Light',.005,s=2)


def furniture(name,label):
    a=LAYOUTS['original'][name]
    return node(name,furn,pos=a['position'],rot=(0,a['rotationY'],0),label=label,kind='furniture')

# Generous, softly radiused furniture reads at 320 px. No tiny room accessories.
sofa=furniture('Furniture_Sofa','奶油云朵沙发')
box('Sofa_Oak_Platform',sofa,(2.08,.13,.86),(0,.14,0),'Oak_Light',.06,s=4)
box('Sofa_Puffy_Base',sofa,(2.18,.32,1.00),(0,.35,0),'Sofa_Cloud',.15,s=6)
for j,x in enumerate([-.81,.81]):
    for k,z in enumerate([-.31,.31]):cyl(f'Sofa_Foot_{j}_{k}',sofa,.075,.13,(x,.065,z),'Oak_Light')
for i,x in enumerate([-.47,.47]):
    box(f'Sofa_Seat_{i+1:02}',sofa,(.94,.235,.80),(x,.585,.075),'Sofa_Cloud',.113,s=6)
    box(f'Sofa_Back_{i+1:02}',sofa,(.97,.56,.29),(x,.88,-.30),'Sofa_Cloud',.138,rot=(-.055,0,0),s=6)
for i,x in enumerate([-1.0,1.0]):box(f'Sofa_Arm_{i+1:02}',sofa,(.26,.53,.99),(x,.61,.01),'Sofa_Cloud',.129,s=6)
ball('Sofa_Accent_Pillow',sofa,(.235,.225,.105),(-.54,.845,-.035),'Pillow_Apricot',(.0,.07,-.18),power=.70)

# The one large table works as a compact cafe/dining table. Accessories stay as
# separate children so an editor can remove them without touching the tabletop.
table=furniture('Furniture_DiningTable','小圆角餐桌')
box('Table_Oak_Top',table,(1.26,.14,.98),(0,.80,0),'Oak_Light',.069,s=6)
node('Table_Tapered_Pedestal',table,cylinder(.22,.28,.67,40),'Oak_Light',(0,.425,0),scale=(1.15,1,1))
node('Table_Weighted_Foot',table,cylinder(.32,.33,.10,40),'Oak_Light',(0,.05,0),scale=(1.2,1,1))
node('Table_Ceramic_Dish',table,lathe([(0,0),(.105,0),(.151,.035),(.15,.05),(.135,.048),(.10,.021),(0,.018)],36),'Ceramic_Cream',(-.22,.875,.06))
ball('Table_Fruit',table,(.075,.069,.071),(-.225,.94,.066),'Lamp_Saffron')
box('Table_Linen_Square',table,(.33,.006,.23),(.20,.874,-.07),'Chair_Sage',.003,rot=(0,-.1,0),s=2)

for i in range(2):
    chair=furniture(f'Furniture_DiningChair_{i+1:02}',f'鼠尾草餐椅 {i+1:02}')
    tag=f'Chair_{i+1:02}'
    box(tag+'_Seat_Frame',chair,(.55,.10,.53),(0,.39,0),'Oak_Light',.047,s=4)
    box(tag+'_Soft_Seat',chair,(.53,.14,.50),(0,.485,.025),'Chair_Sage',.065,s=5)
    for j,(x,z) in enumerate([(-.185,-.16),(.185,-.16),(-.185,.175),(.185,.175)]):
        rod(tag+f'_Leg_{j+1:02}',chair,(x*1.15,.032,z*1.13),(x,.43,z),.047,'Oak_Light')
    for j,x in enumerate([-.20,.20]):rod(tag+f'_Back_Post_{j+1}',chair,(x,.415,-.18),(x,.85,-.19),.038,'Oak_Light')
    box(tag+'_Round_Back',chair,(.59,.36,.135),(0,.84,-.21),'Chair_Sage',.066,rot=(-.07,0,0),s=5)

lamp=furniture('Furniture_FloorLamp','蜂蜜蘑菇灯')
node('Lamp_Foot',lamp,cylinder(.225,.24,.075,40),'Lamp_Saffron',(0,.0375,0))
node('Lamp_Stem',lamp,cylinder(.065,.085,.77,32),'Lamp_Saffron',(0,.42,0))
node('Lamp_Mushroom_Dome',lamp,lathe([(0,.73),(.22,.73),(.305,.76),(.326,.79),(.321,.84),(.30,.94),(.255,1.04),(.175,1.125),(.075,1.17),(0,1.175)],48),'Lamp_Saffron')
node('Lamp_Inner_Diffuser',lamp,cylinder(.268,.268,.016,40),'Lamp_Underside',(0,.749,0))

plant=furniture('Furniture_Plant','陶盆橄榄树')
node('Plant_Rounded_Pot',plant,lathe([(0,0),(.19,0),(.225,.028),(.255,.30),(.245,.36),(.216,.36),(.218,.31),(.193,.052),(0,.044)],40),'Pot_Terra')
node('Plant_Soil',plant,cylinder(.218,.218,.010,32),'Earth',(0,.315,0))
rod('Plant_Trunk',plant,(0,.31,0),(.035,1.13,-.02),.037,'Trunk')
for i,(center,size) in enumerate([
    ((-.19,.81,.015),(.205,.30,.20)),((.18,.95,-.015),(.215,.30,.205)),
    ((-.025,1.195,-.02),(.26,.28,.23)),((.08,.79,.15),(.19,.25,.20))]):
    rod(f'Plant_Branch_{i+1}',plant,(.01,.65,0),center,.014,'Trunk')
    node(f'Plant_Leaf_Cluster_{i+1}',plant,ellipsoid(*size,nu=20,nv=12), 'Leaf_Olive' if i%2==0 else 'Leaf_Light',center)

CAMERA={'position':[8.8,9.0,10.8],'target':[0,1.12,.0],'height':7.5,'minWidth':7.85,'near':.1,'far':60,'name':'Camera_Default_Orbit'}
META={'title':'石间 / ROOMLET 02','units':'metres','upAxis':'+Y','fixedCamera':CAMERA,
      'layoutDuration':DURATION,'shell':{'type':'faceted spherical envelope, Boolean carved','solidValid':rock.isValid(),'planarFaces':len(rock.Faces()),'noSphere':False},
      'notes':'Six furniture parent groups. Fixed rectangular floor and two walls. Authored reversible ground/air choreography, not physics.'}
times,tracks=create_motion()
def b64(a): return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
motion={'name':'Roomlet_Full_Loop','duration':DURATION,'fps':FPS,'times':b64(times),'tracks':[{'name':t['name'],'positions':b64(t['positions']),'rotations':b64(t['rotations'])} for t in tracks],
        'landmarks':{'original':0,'modified':8.2},'interpolation':'LINEAR',
        'phases':[{'time':0,'label':'原布局 · 相聚'},{'time':.85,'label':'小件升空'},{'time':2.08,'label':'桌子让位'},{'time':2.78,'label':'沙发转身'},{'time':5.0,'label':'桌子归位'},{'time':5.95,'label':'轻轻落下'},{'time':7.1,'label':'修改布局 · 舒展'}]}
scene={'meta':META,'materials':MATS,'textures':TEXTURES,'nodes':NODES,'root':root,'layouts':LAYOUTS,'motion':motion,
       'geometries':[{'name':g['name'],'positions':b64(g['p']),'normals':b64(g['n']),'uvs':b64(g['uv']),'indices':b64(g['f'])} for g in GEOS]}
(ROOT/'src/scene-data.js').write_text('/* Generated by source/build_scene.py. Edit source/, not this file. */\nwindow.SCULPT_SCENE='+json.dumps(scene,separators=(',',':'),ensure_ascii=False)+';\n')
(ROOT/'assets/layouts.json').write_text(json.dumps(LAYOUTS,indent=2,ensure_ascii=False))
(ROOT/'assets/scene-manifest.json').write_text(json.dumps({'meta':META,'nodes':NODES,'materials':MATS},ensure_ascii=False,indent=2))

# Shared standards-only exporter, factored out of the first version.
from glb_export import export_glb
for filename,state,animated in [('roomlet-original.glb','original',False),('roomlet-modified.glb','modified',False),('roomlet-loop.glb','original',True)]:
    (ROOT/'models'/filename).write_bytes(export_glb(scene,state,animated))
stats={'namedNodes':len(NODES),'furnitureGroups':len(LAYOUTS['original']),'uniqueGeometries':len(GEOS),
       'trianglesUnique':sum(len(g['f']) for g in GEOS), 'trianglesInstanced':sum(len(GEOS[n['geometry']]['f']) for n in NODES if 'geometry' in n),
       'materials':len(MATS),'textures':len(TEXTURES),'walls':2,'floors':1,'shellTriangles':len(GEOS[shellgeo]['f']),
       'shellSolidValid':rock.isValid(),'animationDuration':DURATION,'samplesPerTrack':len(times),'animationChannels':len(tracks)*2}
(ROOT/'docs/model-stats.json').write_text(json.dumps(stats,indent=2))
print(json.dumps(stats,indent=2))
