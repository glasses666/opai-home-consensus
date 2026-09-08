"""Deterministic 18 s A -> B -> A furniture choreography, sampled at 60 Hz.
Metres; Y is up. Geometry and architecture do not morph or disappear.
The exact same float32 samples go to the HTML and the animated GLB.
Edit KEYFRAMES / LAYOUTS, then run build_scene.py and tests/validate.py.
"""
from pathlib import Path
import json, math
import numpy as np
SCENE=json.loads((Path(__file__).parent/'scene-config.json').read_text())['scene']
DURATION=18.0
FPS=60
GROUND=.08
P=math.pi

def pose(x,z,yaw=0):return {'position':[x,GROUND,z], 'rotationY':yaw}

if SCENE=='growing':
 LAYOUTS={
  'original':{'Furniture_Daybed':pose(-.72,-1.08),'Furniture_Desk':pose(.48,.66),'Furniture_Cubby':pose(1.51,-.90),'Furniture_Chair':pose(.48,1.42),'Furniture_Rocker':pose(-.94,.78)},
  'modified':{'Furniture_Daybed':pose(-1.52,-.18,P/2),'Furniture_Desk':pose(1.06,-1.30),'Furniture_Cubby':pose(-.25,-1.46),'Furniture_Chair':pose(1.07,-.40),'Furniture_Rocker':pose(-.12,.90)}
 }
 # time, x, z, yaw; repeated positions intentionally create observation / yielding time.
 KEYFRAMES={
  'Furniture_Daybed':[(2.80,-.72,-1.08,0),(3.45,-.60,-.18,0),(4.25,-.60,-.18,P/2),(5.00,-1.52,-.18,P/2)],
  'Furniture_Desk':[(1.95,.48,.66,0),(2.75,1.49,1.14,0),(5.98,1.49,1.14,0),(6.80,1.06,-1.30,0)],
  'Furniture_Cubby':[(5.08,1.51,-.90,0),(5.95,-.25,-1.46,0)],
 }
 FLIGHTS={'Furniture_Chair':(1.00,1.80,6.95,7.65,10.0), 'Furniture_Rocker':(1.14,1.94,7.10,7.80,10.8)}
 PHASES=[(0,'玩耍，先占据中心'),(1.0,'小伙伴，先让一让'),(1.95,'画桌移开，留出转身空间'),(2.8,'小床转身，贴靠侧墙'),(5.08,'玩具柜与书桌重新作伴'),(6.95,'坐下来，也继续做梦'),(7.8,'学习与休息，各有一角')]
else:
 LAYOUTS={
  'original':{'Furniture_Bed':pose(.20,-.38),'Furniture_Wardrobe_A':pose(-1.55,-1.35),'Furniture_Wardrobe_B':pose(-1.55,-.12),'Furniture_Dresser':pose(.08,1.18),'Furniture_Bedside':pose(1.67,-1.13)},
  'modified':{'Furniture_Bed':pose(.48,-.50),'Furniture_Wardrobe_A':pose(-1.80,-1.25,P/2),'Furniture_Wardrobe_B':pose(-1.80,-.29,P/2),'Furniture_Dresser':pose(-1.80,.95,P/2),'Furniture_Bedside':pose(1.81,-1.19)}
 }
 KEYFRAMES={
  'Furniture_Dresser':[(1.80,.08,1.18,0),(2.60,-1.43,1.12,0),(3.45,-1.43,1.08,P/2),(4.05,-1.80,.95,P/2)],
  'Furniture_Wardrobe_A':[(2.0,-1.55,-1.35,0),(2.6,-1.55,-1.12,0),(3.45,-1.55,-1.12,P/2),(4.20,-1.80,-1.25,P/2)],
  'Furniture_Wardrobe_B':[(4.25,-1.55,-.12,0),(4.50,-1.55,-.22,0),(5.28,-1.55,-.22,P/2),(5.90,-1.80,-.29,P/2)],
  'Furniture_Bed':[(5.95,.20,-.38,0),(6.85,.48,-.50,0)]
 }
 FLIGHTS={'Furniture_Bedside':(1.00,1.70,6.95,7.70,10.0)}
 PHASES=[(0,'各自添置，通道被挤窄'),(1.0,'床边的小物，暂时让路'),(1.8,'床尾斗柜先让出通道'),(2.6,'衣柜转向，沿墙排列'),(4.35,'第二座衣柜接成一线'),(5.95,'床向右后方微调'),(6.95,'小物回到手边'),(7.7,'收纳不减，行走更从容')]
SMALL=list(FLIGHTS)
BIG=list(KEYFRAMES)

def ease(t,a,b):
 u=np.clip((float(t)-a)/(b-a),0.,1.)
 return u*u*u*(u*(u*6-15)+10)

def sample_forward(name,t):
 a=LAYOUTS['original'][name]; b=LAYOUTS['modified'][name]
 pos=np.array(a['position'],float);yaw=a['rotationY']
 if name in FLIGHTS:
  up0,up1,down0,down1,h=FLIGHTS[name]
  # All lateral travel happens entirely above the default camera's upper frame.
  u=ease(t,up1+.15,down0-.15)
  pos=pos*(1-u)+np.array(b['position'])*u
  yaw=yaw*(1-u)+b['rotationY']*u
  if t<up1:pos[1]=GROUND+(h-GROUND)*ease(t,up0,up1)
  elif t<down0:pos[1]=h+1.4*math.sin(math.pi*ease(t,up1,down0))**2
  else:pos[1]=GROUND+(h-GROUND)*(1-ease(t,down0,down1))
 else:
  k=KEYFRAMES[name]
  x,z,yaw=k[0][1:]
  for i in range(len(k)-1):
   aa,bb=k[i:i+2]
   if t>=aa[0]:
    u=ease(t,aa[0],bb[0]);x=aa[1]+(bb[1]-aa[1])*u;z=aa[2]+(bb[2]-aa[2])*u;yaw=aa[3]+(bb[3]-aa[3])*u
  pos=np.array([x,GROUND,z],float)
 return pos,np.array([0,math.sin(yaw/2),0,math.cos(yaw/2)])

def sample(name,time):
 t=min(max(float(time),0),DURATION)
 return sample_forward(name,min(t,DURATION-t))

def create_motion():
 times=np.linspace(0,DURATION,round(DURATION*FPS)+1).astype(np.float32)
 tracks=[]
 for name in LAYOUTS['original']:
  values=[sample(name,t) for t in times]
  tracks.append({'name':name,'positions':np.array([p for p,q in values],np.float32),'rotations':np.array([q for p,q in values],np.float32)})
 return times,tracks
