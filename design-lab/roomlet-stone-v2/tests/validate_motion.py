#!/usr/bin/env python3
"""Conservative bounding-box audit of the authored animation at 240 Hz.
Uses full descendant mesh extents, not furniture anchor points. The 2D SAT is
combined with vertical interval separation. Not a physics/collision solver.
"""
from __future__ import annotations
import base64,json,sys,itertools
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'source'))
from motion import sample, DURATION, LAYOUTS, BIG
text=(ROOT/'src/scene-data.js').read_text();scene=json.loads(text[text.index('window.SCULPT_SCENE=')+len('window.SCULPT_SCENE='):].rstrip().rstrip(';'))
nodes=scene['nodes'];geos=scene['geometries'];ids={n['name']:i for i,n in enumerate(nodes)}
def transform(n):
 m=np.eye(4);m[:3,:3]=Rotation.from_quat(n['rotation']).as_matrix()@np.diag(n['scale']);m[:3,3]=n['position'];return m
bounds={}
for name in LAYOUTS['original']:
 pts=[]
 def walk(i,parent):
  n=nodes[i];m=parent@transform(n)
  if 'geometry' in n:
   p=np.frombuffer(base64.b64decode(geos[n['geometry']]['positions']),dtype=np.float32).reshape(-1,3);pts.append(p@m[:3,:3].T+m[:3,3])
  for child in n['children']:walk(child,m)
 for c in nodes[ids[name]]['children']:walk(c,np.eye(4))
 p=np.concatenate(pts);bounds[name]=[p.min(0),p.max(0)]
def box(name,t):
 pos,q=sample(name,t);lo,hi=bounds[name];r=Rotation.from_quat(q).as_matrix()
 corners=np.array([[x,0,z] for x,z in [(lo[0],lo[2]),(hi[0],lo[2]),(hi[0],hi[2]),(lo[0],hi[2])]])@r.T+pos
 return corners[:,[0,2]],(pos[1]+lo[1],pos[1]+hi[1])
def gap(a,b):
 axes=[]
 for p in [a,b]:
  for i in [0,1]:
   e=p[(i+1)%4]-p[i];n=np.array([-e[1],e[0]]);n/=np.linalg.norm(n);axes.append(n)
 gaps=[]
 for axis in axes:
  p=a@axis;q=b@axis;gaps.append(max(q.min()-p.max(),p.min()-q.max()))
 return max(gaps)
issues=[];minfloor=1.;minwall=1.;mingap=1.;pairs=list(itertools.combinations(LAYOUTS['original'],2))
times=np.linspace(0,DURATION,round(DURATION*240)+1)
for t in times:
 boxes={name:box(name,t) for name in LAYOUTS['original']}
 for name,(p,y) in boxes.items():
  minfloor=min(minfloor,y[0]-.08)
  if y[0] < .08-1e-5:issues.append({'type':'belowFloor','name':name,'time':float(t),'minY':y[0]})
  if y[0]<2.09:
   clearance=min(p[:,0].min()-(-2.118),p[:,1].min()-(-1.768));minwall=min(minwall,clearance)
   if clearance<-.0001:issues.append({'type':'wallAABB','name':name,'time':float(t),'clearance':clearance})
  if name in BIG and abs(sample(name,t)[0][1]-.08)>1e-7:issues.append({'type':'largeLift','name':name,'time':float(t)})
 for a,b in pairs:
  pa,ya=boxes[a];pb,yb=boxes[b];vg=max(ya[0]-yb[1],yb[0]-ya[1]);hg=gap(pa,pb);clearance=max(vg,hg);mingap=min(mingap,clearance)
  if clearance<-.0001:issues.append({'type':'overlap','pair':[a,b],'time':float(t),'overlapUpperBound':-clearance})
report={'method':'Conservative full-descendant OBB footprints + height intervals, authored path sampled at 240 Hz. Not continuous-time proof or physics simulation.',
 'timeSamples':len(times),'pairTests':len(times)*len(pairs),'duration':DURATION,'minimumFurnitureGap':mingap,'minimumFloorOffset':minfloor,'minimumWallClearance':minwall,
 'loopEndpointsMatch':all(np.allclose(sample(n,0)[0],sample(n,DURATION)[0]) and np.allclose(sample(n,0)[1],sample(n,DURATION)[1]) for n in LAYOUTS['original']),
 'largePiecesAlwaysGrounded':not any(i['type']=='largeLift' for i in issues), 'issueCount':len(issues),'firstIssues':issues[:20],
 'localBounds':{n:[a.tolist(),b.tolist()] for n,(a,b) in bounds.items()}}
(ROOT/'docs/motion-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='localBounds'},ensure_ascii=False,indent=2))
if issues:sys.exit(1)
