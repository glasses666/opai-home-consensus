#!/usr/bin/env python3
"""Parametric ROOMLET stories. No downloaded furniture or baked scene images.
Furniture parts are named meshes, grouped under independent animation parents.
Run python source/build_scene.py from any working directory to regenerate.
"""
from __future__ import annotations
import base64,json,math
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from meshkit import *
from motion import SCENE,LAYOUTS,DURATION,FPS,SMALL,BIG,PHASES,create_motion
from architecture import build_architecture
from glb_export import export_glb
ROOT=Path(__file__).resolve().parents[1]
for f in ['assets','models','docs','src']:(ROOT/f).mkdir(exist_ok=True)
TEXTURES=[];TEX={}

def texture(name,kind,size=256):
 rng=np.random.default_rng(27+len(TEXTURES)); yy,xx=np.mgrid[0:size,0:size]/size; noise=rng.normal(0,1,(size,size))
 if kind=='oak':
  warp=.018*np.sin(2*PI*yy)+.006*np.sin(8*PI*yy)
  v=np.sin((xx*39+warp*30)*2*PI)*1.9+gaussian_filter(noise,(12,1),mode='wrap')*12+noise*.6;rgb=np.array([211,179,137])+v[:,:,None]
 elif kind=='linen':
  v=np.sin(xx*2*PI*97)*np.sin(yy*2*PI*97)*1.2+noise*.5;rgb=np.array([247,244,235])+v[:,:,None]
 else:
  v=gaussian_filter(noise,1.6,mode='wrap')*2.7+noise*.45;rgb=np.array([244,244,242])+v[:,:,None]
 p=ROOT/'assets'/f'{name}.png';Image.fromarray(np.clip(rgb,0,255).astype('uint8')).save(p,optimize=True)
 TEX[name]=len(TEXTURES);TEXTURES.append({'name':name,'uri':f'assets/{name}.png','data':'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()})
for n,k in [('oak-soft','oak'),('fabric-soft','linen'),('stone-grain','stone')]:texture(n,k)

def mat(name,c,rough=.85,tex=None,metal=0):
 MAT[name]=len(MATS);MATS.append({'name':name,'color':list(c),'roughness':rough,'metalness':metal,'texture':TEX.get(tex,-1)})
mat('Stone_Grey',[.53,.55,.55],.97,'stone-grain')
mat('Wall_Chalk',[.89,.876,.827],.93)
mat('Oak_Light',[1,1,1],.74,'oak-soft')
mat('Floor_Light_Oak',[1,.98,.95],.88,'oak-soft')
mat('Shadow_Reveal',[.34,.32,.28],.98)
mat('Cream',[.96,.93,.86],.9,'fabric-soft')
mat('Warm_White',[.94,.91,.84],.72)
mat('Sage',[.57,.66,.56],.90,'fabric-soft')
mat('Honey',[.85,.62,.32],.76)
mat('Clay',[.75,.43,.31],.86,'fabric-soft')
mat('Mist_Blue',[.51,.63,.66],.94,'fabric-soft')
mat('Night_Blue',[.38,.50,.54],.92,'fabric-soft')
mat('Cocoa',[.34,.26,.20],.86)
mat('Butter',[.89,.79,.55],.83)
mat('Peach',[.91,.65,.50],.9)
mat('Book_Green',[.37,.48,.42],.92)
mat('Paper',[.95,.93,.86],.96)

root=node('Roomlet_'+SCENE,label='陪孩子慢慢长大' if SCENE=='growing' else '把不同，安放在一起',kind='root')
arch=node('Architecture_Fixed',root,label='固定石壳、两墙与矩形地板',kind='architecture')
furn=node('Furniture_Editable',root,label='五组独立家具 · 全程保留',kind='furniture-root')
shell=build_architecture(arch,ROOT)

# Modestly rounded parts; texture grain, not geometry, carries the fine detail.
def B(name,parent,dims,pos,material,r=.025,rot=(0,0,0),s=3):return box(name,parent,dims,pos,material,r,rot,s)
def E(name,parent,dim,pos,material,rot=(0,0,0),power=1):
 return node(name,parent,ellipsoid(*dim,nu=24,nv=16,power=power),material,pos,rot)
def C(name,parent,r,h,pos,material,seg=24):return node(name,parent,cylinder(r,r,h,seg),material,pos)
def furniture(name,label):
 a=LAYOUTS['original'][name]
 return node(name,furn,pos=a['position'],rot=(0,a['rotationY'],0),label=label,kind='furniture')
def feet(tag,g,xx,zz,height=.12,r=.055):
 for i,x in enumerate(xx):
  for j,z in enumerate(zz):C(f'{tag}_Foot_{i}_{j}',g,r,height,(x,height/2,z),'Oak_Light')
def book(tag,g,pos,size,cover,rot=(0,0,0)):
 b=node(tag,g,pos=pos,rot=rot,label='独立书本',kind='accessory')
 w,h,d=size;B(tag+'_Pages',b,(w,h*.72,d),(0,0,0),'Paper',.005,s=2)
 for v,y in enumerate([-h*.43,h*.43]):B(tag+f'_Cover_{v}',b,(w+.02,h*.13,d+.02),(0,y,0),cover,.004,s=2)
 B(tag+'_Spine',b,(.019,h,d+.02),(-w/2,0,0),cover,.007,s=2)
 return b

def child_scene():
 # Wide single daybed: the rear bolster becomes the wall-side bolster in layout B.
 g=furniture('Furniture_Daybed','云朵小床')
 feet('Daybed',g,[-.79,.79],[-.34,.34],.14,.065)
 B('Daybed_Oak_Frame',g,(2.04,.18,1.00),(0,.225,0),'Oak_Light',.07,s=4)
 B('Daybed_Mattress',g,(1.95,.24,.94),(0,.425,.015),'Cream',.115,s=5)
 B('Daybed_Linen_Duvet',g,(1.25,.19,.91),(-.275,.56,.045),'Sage',.085,s=5)
 B('Daybed_Folded_Edge',g,(.14,.032,.89),(.29,.661,.045),'Cream',.015,s=3)
 B('Daybed_Soft_Back',g,(2.00,.49,.14),(0,.635,-.447),'Sage',.065,s=4)
 for j,x in enumerate([-1.00,1.00]):B('Daybed_Rounded_End_'+str(j),g,(.11,.47,1.03),(x,.545,0),'Oak_Light',.054,s=4)
 E('Daybed_Pillow',g,(.27,.13,.33),(.62,.625,.01),'Cream',rot=(0,-.04,-.06),power=.55)
 # Little round cushion reads as a single playful accent, not a pile of toys.
 E('Daybed_Honey_Cushion',g,(.165,.165,.078),(-.44,.785,-.277),'Honey',rot=(.08,0,.1))

 g=furniture('Furniture_Desk','从画桌到书桌')
 B('Desk_Top',g,(1.18,.12,.70),(0,.72,0),'Peach',.055,s=4)
 B('Desk_Underframe',g,(.99,.10,.50),(0,.614,0),'Oak_Light',.04)
 feet('Desk',g,[-.435,.435],[-.21,.21],.63,.065)
 book('Desk_Notebook',g,(-.20,.804,.03),(.32,.045,.26),'Sage',rot=(0,-.08,0))
 cup=node('Desk_Pencil_Cup',g,label='独立笔筒',kind='accessory')
 node('Desk_Cup_Ceramic',cup,lathe([(0,0),(.067,0),(.076,.018),(.078,.14),(.062,.14),(.058,.025),(0,.025)],24),'Honey',(.37,.786,-.16))
 for j,(dx,dz) in enumerate([(-.028,.014),(.028,-.013),(0,.02)]):
  rod('Desk_Pencil_'+str(j),cup,(.37+dx,.813,-.16+dz),(.37+dx*1.7,1.01+j*.018,-.16+dz*1.4),.012,['Clay','Book_Green','Oak_Light'][j])

 g=furniture('Furniture_Cubby','同一座玩具与书本柜')
 feet('Cubby',g,[-.37,.37],[-.145,.145],.10,.045)
 for tag,dims,pos in [ ('Back',(.96,.61,.04),(0,.395,-.215)),('Base',(.96,.06,.48),(0,.10,0)),('Top',(.96,.08,.48),(0,.72,0)),('Left',(.06,.61,.48),(-.45,.405,0)),('Right',(.06,.61,.48),(.45,.405,0)),('Middle',(.86,.042,.45),(0,.417,.003)),('Divide',(.045,.59,.43),(0,.413,.008))]:B('Cubby_'+tag,g,dims,pos,'Oak_Light',.013)
 for j,x in enumerate([-.22,.22]):
  B('Cubby_Storage_Bin_'+str(j),g,(.35,.22,.32),(x,.235,.035),'Sage' if j==0 else 'Clay',.028)
  B('Cubby_Bin_Grip_'+str(j),g,(.105,.035,.01),(x,.27,.200),'Butter',.016)
 for j,(x,ht,co) in enumerate([(-.33,.22,'Peach'),(-.245,.27,'Book_Green'),(-.15,.235,'Butter')]):
  b=book('Cubby_Upright_Book_'+str(j),g,(x,.461+ht/2,-.01),(ht,.059,.22),co,rot=(0,0,PI/2))
 E('Cubby_Ball',g,(.109,.109,.109),(.23,.55,.04),'Honey')

 g=furniture('Furniture_Chair','蜂蜜小椅')
 feet('Chair',g,[-.15,.15],[-.15,.15],.34,.045)
 B('Chair_Seat',g,(.47,.13,.45),(0,.37,0),'Honey',.06,s=4)
 for j,x in enumerate([-.165,.165]):rod('Chair_Back_Post_'+str(j),g,(x,.29,.147),(x,.69,.168),.035,'Oak_Light')
 B('Chair_Back',g,(.47,.235,.11),(0,.68,.166),'Honey',.053,s=4)

 g=furniture('Furniture_Rocker','留在童年的摇摇兔')
 for j,z in enumerate([-.19,.19]):
  # Wood rocker rails are curved meshes with ground-tangent bottoms at x=0.
  pts=[(x,.035+.15*(x/.36)**2,z) for x in np.linspace(-.36,.36,17)]
  node('Rocker_Curved_Rail_'+str(j),g,tube(pts,.035,10),'Oak_Light')
 for j,x in enumerate([-.18,.18]):rod('Rocker_Crossbar_'+str(j),g,(x,.15,-.19),(x,.15,.19),.030,'Oak_Light')
 E('Rocker_Rabbit_Body',g,(.265,.19,.18),(0,.33,0),'Cream')
 E('Rocker_Rabbit_Head',g,(.13,.15,.135),(.185,.54,0),'Cream')
 for j,z in enumerate([-.063,.063]):
  E('Rocker_Ear_'+str(j),g,(.047,.17,.041),(.23,.737,z),'Cream',rot=(0,0,-.16))
  E('Rocker_Inner_Ear_'+str(j),g,(.025,.115,.009),(.237,.746,z+.034),'Peach',rot=(0,0,-.16))
  E('Rocker_Eye_'+str(j),g,(.017,.022,.011),(.264,.557,z*1.80),'Cocoa')
 E('Rocker_Tail',g,(.071,.072,.071),(-.25,.383,0),'Cream')
 B('Rocker_Saddle',g,(.24,.055,.32),(-.04,.516,0),'Clay',.026,s=4)
 rod('Rocker_Handle',g,(.16,.51,-.25),(.16,.51,.25),.031,'Honey')

 art=node('Wall_Art_Childhood',arch,label='固定的晨光与小山',kind='decor')
 B('Art_Frame',art,(1.00,.85,.048),(.35,1.46,-1.73),'Oak_Light',.10,s=5)
 B('Art_Quiet_Field',art,(.91,.76,.010),(.35,1.46,-1.698),'Warm_White',.088,s=5)
 node('Art_Sun',art,cylinder(.16,.16,.007,32),'Honey',(.13,1.64,-1.688),rot=(PI/2,0,0))
 B('Art_Sage_Hill',art,(.36,.36,.014),(.47,1.306,-1.68),'Sage',.17,s=5)
 B('Art_Clay_Hill',art,(.20,.23,.015),(.68,1.24,-1.67),'Clay',.09,s=5)


def wardrobe(name,label,variant):
 g=furniture(name,label)
 # Internal cabinet + independent doors preserve usable storage, not just solid blocks.
 feet(name,g,[-.34,.34],[-.16,.16],.10,.045)
 B(name+'_Back',g,(.90,1.49,.045),(0,.825,-.2275),'Oak_Light',.018)
 for s,x in [('L',-.423),('R',.423)]:B(name+'_Side_'+s,g,(.055,1.49,.50),(x,.825,0),'Oak_Light',.022)
 B(name+'_Bottom',g,(.90,.07,.50),(0,.10,0),'Oak_Light',.025)
 B(name+'_Crown',g,(.90,.07,.50),(0,1.565,0),'Oak_Light',.033)
 for i,y in enumerate([.56,1.12]):B(name+'_Shelf_'+str(i),g,(.81,.025,.43),(0,y,0),'Oak_Light',.01,s=2)
 for i,x in enumerate([-.21,.21]):
  B(name+'_Door_'+str(i),g,(.411,1.40,.038),(x,.819,.246),'Warm_White',.017)
  B(name+'_Inset_'+str(i),g,(.335,1.30,.009),(x,.819,.271),'Cream',.027)
  B(name+'_Handle_'+str(i),g,(.026,.24,.048),(x+(.124 if i==0 else -.124),.80,.291),'Honey',.012)
 return g

def adult_scene():
 g=furniture('Furniture_Bed','两个人的低靠背床')
 feet('Bed',g,[-.72,.72],[-.84,.84],.14,.074)
 B('Bed_Oak_Platform',g,(1.86,.19,2.14),(0,.225,0),'Oak_Light',.08,s=4)
 B('Bed_Mattress',g,(1.77,.23,2.03),(0,.424,.01),'Cream',.11,s=5)
 B('Bed_Upholstered_Headboard',g,(1.88,.79,.15),(0,.635,-1.014),'Night_Blue',.073,s=5)
 B('Bed_Duvet',g,(1.80,.19,1.36),(0,.578,.35),'Mist_Blue',.09,s=5)
 B('Bed_Duvet_Fold',g,(1.79,.055,.18),(0,.682,-.23),'Cream',.026,s=4)
 B('Bed_Foot_Throw',g,(1.80,.027,.32),(0,.687,.81),'Night_Blue',.012,s=3)
 for i,x in enumerate([-.43,.43]):E('Bed_Pillow_'+str(i),g,(.373,.125,.282),(x,.607,-.641),'Cream',rot=(0,(-1 if i else 1)*.035,0),power=.55)
 E('Bed_Clay_Cushion',g,(.175,.16,.070),(-.40,.762,-.637),'Clay',rot=(.20,0,-.09),power=.68)
 E('Bed_Butter_Cushion',g,(.155,.14,.070),(.39,.747,-.637),'Butter',rot=(.18,0,.09),power=.65)
 wardrobe('Furniture_Wardrobe_A','独立衣柜 · A',0)
 wardrobe('Furniture_Wardrobe_B','独立衣柜 · B',1)
 g=furniture('Furniture_Dresser','不再挡路的双抽斗柜')
 feet('Dresser',g,[-.43,.43],[-.15,.15],.10,.052)
 B('Dresser_Carcass',g,(1.18,.49,.46),(0,.335,0),'Oak_Light',.035)
 B('Dresser_Top',g,(1.18,.08,.48),(0,.62,0),'Oak_Light',.035)
 for i,y in enumerate([.235,.459]):
  B('Dresser_Drawer_'+str(i),g,(1.065,.19,.03),(0,y,.237),'Warm_White',.025)
  B('Dresser_Handle_'+str(i),g,(.29,.025,.035),(0,y,.264),'Honey',.012)
 # Two restrained books remain on the dresser in BOTH layouts.
 book('Dresser_Book_1',g,(.27,.70,.0),(.36,.072,.23),'Book_Green',rot=(0,-.05,0))
 book('Dresser_Book_2',g,(.255,.76,.0),(.31,.043,.21),'Clay',rot=(0,.09,0))

 g=furniture('Furniture_Bedside','一盏灯，一张小边几')
 C('Bedside_Base',g,.195,.065,(0,.0325,0),'Oak_Light')
 C('Bedside_Stem',g,.073,.43,(0,.255,0),'Oak_Light')
 B('Bedside_Top',g,(.42,.075,.42),(0,.49,0),'Oak_Light',.036,s=4)
 lamp=node('Bedside_Lamp',g,label='独立小夜灯',kind='accessory')
 C('Lamp_Foot',lamp,.101,.033,(0,.544,0),'Honey')
 C('Lamp_Stem',lamp,.032,.18,(0,.638,0),'Honey')
 node('Lamp_Cream_Shade',lamp,lathe([(0,.735),(.156,.735),(.173,.759),(.151,.830),(.098,.882),(0,.90)],32),'Warm_White')
 art=node('Wall_Art_Together',arch,label='固定双圆壁画',kind='decor')
 B('Art_Frame',art,(1.04,.63,.04),(.48,1.64,-1.731),'Oak_Light',.03)
 B('Art_Field',art,(.957,.55,.012),(.48,1.64,-1.704),'Warm_White',.015)
 node('Art_Circle_Clay',art,cylinder(.181,.181,.007,32),'Clay',(.295,1.655,-1.691),rot=(PI/2,0,0))
 node('Art_Circle_Sage',art,cylinder(.181,.181,.009,32),'Sage',(.64,1.655,-1.684),rot=(PI/2,0,0))
 B('Art_Shared_Line',art,(.79,.013,.008),(.48,1.493,-1.678),'Honey',.005,s=2)

if SCENE=='growing':child_scene()
else:adult_scene()
# Exact default family view from the approved homepage: left-biased, orthographic.
eye=np.array([8.8,9,10.8]);target=np.array([0,1.12,0]);v=eye-target;angle=-.18
v=np.array([v[0]*math.cos(angle)+v[2]*math.sin(angle),v[1],-v[0]*math.sin(angle)+v[2]*math.cos(angle)])
CAMERA={'position':(target+v).tolist(),'target':target.tolist(),'height':7.50,'minWidth':7.85,'near':.1,'far':60,'name':'Camera_Default_Orbit'}
INFO={
 'growing':{'title':'陪孩子慢慢长大','subtitle':'房间不必长大，也能陪他长大。','english':'A LITTLE ROOM TO GROW','number':'02','accent':'#dec596','originalTitle':'玩耍，是房间的中心','modifiedTitle':'学习与休息，各有一角','originalText':'画桌、摇摇兔和小椅围出玩耍的中心，小床靠着后墙。','modifiedText':'小床转向侧墙，桌柜靠墙相伴。玩具没有离开，只是留出学习的位置。','metric':'5 件家具，仍然都在','idea':'不急着换掉童年，只慢慢调整它的位置。'},
 'together':{'title':'把不同，安放在一起','subtitle':'多一点收纳，也多一点从容。','english':'ROOM FOR BOTH OF YOU','number':'03','accent':'#b9c9c5','originalTitle':'各有位置，床尾稍显局促','modifiedTitle':'收纳归整，床尾留白','originalText':'两座衣柜背靠侧墙，柜门朝向房间，床尾另放斗柜。日常可以使用，但收纳分散，床尾通道偏紧。','modifiedText':'衣柜沿墙并拢，斗柜接入同一收纳区；床稍向右移，保留柜前空间，同时释放床尾。','metric':'3 组收纳，全部保留','idea':'不是少放谁的东西，而是重新安排彼此的日常。'}
}[SCENE]
META={'title':INFO['title'],'slug':'roomlet-'+SCENE,'scene':SCENE,'units':'metres','upAxis':'+Y','fixedCamera':CAMERA,'layoutDuration':DURATION,'shell':shell,'story':INFO,'ground':.08,'fixedArchitecture':True,'furnitureCount':5,'small':SMALL,'big':BIG,'designNote':'Stylized room-object, not construction/ergonomic specification. Stable shell and floor, full storage retained. Preview lighting is viewer-side PBR + SSAO, not baked into GLB.'}
times,tracks=create_motion()
def b64(a):return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
motion={'name':'Roomlet_'+SCENE+'_Full_Loop','duration':DURATION,'fps':FPS,'times':b64(times),'tracks':[{'name':t['name'],'positions':b64(t['positions']),'rotations':b64(t['rotations'])} for t in tracks],'landmarks':{'original':0,'modified':9},'interpolation':'LINEAR','phases':[{'time':t,'label':v} for t,v in PHASES],'holdAEnd':1.,'holdBStart':7.8 if SCENE=='growing' else 7.7}
scene={'meta':META,'materials':MATS,'textures':TEXTURES,'nodes':NODES,'root':root,'layouts':LAYOUTS,'motion':motion,'geometries':[{'name':g['name'],'positions':b64(g['p']),'normals':b64(g['n']),'uvs':b64(g['uv']),'indices':b64(g['f'])} for g in GEOS]}
(ROOT/'src/scene-data.js').write_text('/* Generated by source/build_scene.py. */\nwindow.SCULPT_SCENE='+json.dumps(scene,separators=(',',':'),ensure_ascii=False)+';\n')
(ROOT/'assets/layouts.json').write_text(json.dumps(LAYOUTS,indent=2,ensure_ascii=False))
(ROOT/'assets/scene-manifest.json').write_text(json.dumps({'meta':META,'nodes':NODES,'materials':MATS},indent=2,ensure_ascii=False))
for suffix,state,animated in [('original','original',False),('modified','modified',False),('loop','original',True)]:
 (ROOT/'models'/f'roomlet-{SCENE}-{suffix}.glb').write_bytes(export_glb(scene,state,animated))
stats={'scene':SCENE,'namedNodes':len(NODES),'furnitureGroups':len(LAYOUTS['original']),'uniqueGeometries':len(GEOS),'trianglesUnique':sum(len(g['f']) for g in GEOS),'trianglesInstanced':sum(len(GEOS[n['geometry']]['f']) for n in NODES if 'geometry' in n),'materials':len(MATS),'textures':len(TEXTURES),'walls':2,'floors':1,'shell':shell,'animationDuration':DURATION,'samplesPerTrack':len(times),'animationChannels':len(tracks)*2}
(ROOT/'docs/model-stats.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats,indent=2))
