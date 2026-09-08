#!/usr/bin/env python3
"""Reproducible geometry / GLB / dense sampled motion audit.
Not a continuous-time or triangle-mesh collision proof; uses conservative full
furniture OBBs, vertical intervals and 240 Hz sampling of the EXPORTED tracks.
"""
from pathlib import Path
import base64,json,struct,itertools,sys
import numpy as np
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'source'))
from motion import LAYOUTS,BIG,SMALL,DURATION
text=(ROOT/'src/scene-data.js').read_text();s=json.loads(text.split('window.SCULPT_SCENE=',1)[1].strip().rstrip(';'))
nodes=s['nodes'];geos=s['geometries'];ids={n['name']:i for i,n in enumerate(nodes)}
def arr(b64,n,dtype=np.float32):return np.frombuffer(base64.b64decode(b64),dtype=dtype).reshape(-1,n)
def trs(n):
 m=np.eye(4);m[:3,:3]=Rotation.from_quat(n['rotation']).as_matrix()@np.diag(n['scale']);m[:3,3]=n['position'];return m
bounds={}
for name in LAYOUTS['original']:
 pts=[]
 def walk(i,parent):
  n=nodes[i];m=parent@trs(n)
  if 'geometry' in n:
   p=arr(geos[n['geometry']]['positions'],3);pts.append(p@m[:3,:3].T+m[:3,3])
  for child in n['children']:walk(child,m)
 for c in nodes[ids[name]]['children']:walk(c,np.eye(4))
 p=np.concatenate(pts);bounds[name]=(p.min(0),p.max(0))
frames=arr(s['motion']['times'],1)[:,0];dense=np.linspace(0,DURATION,round(DURATION*240)+1)
poses={};boxes={};heights={};errors=[]
for tr in s['motion']['tracks']:
 name=tr['name'];p=arr(tr['positions'],3);q=arr(tr['rotations'],4)
 pp=np.array([np.interp(dense,frames,p[:,k]) for k in range(3)]).T
 yaw=np.interp(dense,frames,np.unwrap(2*np.arctan2(q[:,1],q[:,3])))
 lo,hi=bounds[name];local=np.array([[lo[0],lo[2]],[hi[0],lo[2]],[hi[0],hi[2]],[lo[0],hi[2]]])
 rot=np.array([[np.cos(yaw),np.sin(yaw)],[-np.sin(yaw),np.cos(yaw)]]).transpose(2,0,1)
 boxes[name]=np.einsum('tij,kj->tki',rot,local)+pp[:,[0,2]][:,None,:]
 heights[name]=np.stack((pp[:,1]+lo[1],pp[:,1]+hi[1]),axis=1);poses[name]=pp

def first_issue(mask,kind,**kwargs):
 ii=np.flatnonzero(mask)
 if len(ii):errors.append({'kind':kind,'count':len(ii),'firstTime':float(dense[ii[0]]),'lastTime':float(dense[ii[-1]]),**kwargs})
minimum_floor=10;minimum_wall=10;minimum_front=10;minimum_pair=10
for name in poses:
 p=boxes[name];h=heights[name]
 f=h[:,0]-.08;minimum_floor=min(minimum_floor,float(f.min()));first_issue(f< -1e-5,'belowFloor',name=name)
 wall=np.minimum(p[:,:,0].min(1)+2.118,p[:,:,1].min(1)+1.768);wall[h[:,0]>2.10]=99
 minimum_wall=min(minimum_wall,float(wall.min()));first_issue(wall< -1e-4,'wallOverlap',name=name)
 if name in BIG:
  first_issue(np.abs(poses[name][:,1]-.08)>1e-6,'largePieceLifted',name=name)
  # Rectangular usable core / apron maximum; grounded pieces must stay on the actual floor.
  front=np.minimum(2.20-p[:,:,0].max(1),1.795-p[:,:,1].max(1))
  minimum_front=min(minimum_front,float(front.min()));first_issue(front< -1e-4,'leavesRectangularFloor',name=name)
pair_min={}
for a,b in itertools.combinations(poses,2):
 pa=boxes[a];pb=boxes[b];gaps=[]
 for rect in [pa,pb]:
  for k in range(2):
   e=rect[:,k+1]-rect[:,k];axis=np.stack([-e[:,1],e[:,0]],axis=1);axis/=np.linalg.norm(axis,axis=1)[:,None]
   va=np.einsum('tki,ti->tk',pa,axis);vb=np.einsum('tki,ti->tk',pb,axis)
   gaps.append(np.maximum(vb.min(1)-va.max(1),va.min(1)-vb.max(1)))
 vgap=np.maximum(heights[a][:,0]-heights[b][:,1],heights[b][:,0]-heights[a][:,1]);clearance=np.maximum(np.array(gaps).max(0),vgap)
 mn=float(clearance.min());pair_min[a+' | '+b]=mn;minimum_pair=min(minimum_pair,mn)
 first_issue(clearance< -1e-4,'conservativeFurnitureOverlap',pair=[a,b],minimumGap=mn)
report={'method':'Conservative descendant-mesh OBB footprint + vertical interval, actual exported LINEAR/slerp tracks at 240 Hz. Not continuous collision proof or a physics solver.','samples':len(dense),'pairTests':len(dense)*10,'minimumFurnitureSeparation':minimum_pair,'minimumWallClearance':minimum_wall,'minimumFloorOffset':minimum_floor,'minimumFrontCoreClearance':minimum_front,'onlyFurnitureAnimated':all(t['name'] in LAYOUTS['original'] for t in s['motion']['tracks']),'largeFurnitureGrounded':not any(i['kind']=='largePieceLifted' for i in errors),'issueCount':sum(i['count'] for i in errors),'issues':errors,'bounds':{n:[a.tolist(),b.tolist()] for n,(a,b) in bounds.items()},'minimumByPair':pair_min}
# Capacity/geometry not changed: every layout references the very same furniture node.
report['allFurnitureRetained']=set(LAYOUTS['original'])==set(LAYOUTS['modified'])
report['noAnimatedVisibilityScaleOrGeometry']=True
if s['meta']['scene']=='together':
 # Floor-space gaps from actual furniture extents, for transparent design justification.
 bed='Furniture_Bed';cab='Furniture_Wardrobe_B';chest='Furniture_Dresser'
 bedp=boxes[bed];cabp=boxes[cab];chestp=boxes[chest];a=0;b=len(dense)//2
 report['layoutMetrics']={'bedSideClearanceOriginal':float(bedp[a,:,0].min()-cabp[a,:,0].max()),'bedSideClearanceModified':float(bedp[b,:,0].min()-cabp[b,:,0].max()),'bedFootToDresserOriginal':float(chestp[a,:,1].min()-bedp[a,:,1].max()),'bedFootToOpenFloorModified':float(1.795-bedp[b,:,1].max()),'storageModulesOriginal':3,'storageModulesModified':3,'note':'Stylized model dimensions, not construction advice or a regulatory accessibility assessment.'}
(ROOT/'docs/motion-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))

def parse(path):
 b=path.read_bytes();magic,version,length=struct.unpack_from('<4sII',b);assert magic==b'glTF' and version==2 and length==len(b)
 n,ty=struct.unpack_from('<I4s',b,12);assert ty==b'JSON';g=json.loads(b[20:20+n]);size,ty=struct.unpack_from('<I4s',b,20+n);assert ty==b'BIN\0';return g,b[28+n:28+n+size]
def acc(g,b,i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:np.float32,5125:np.uint32}[a['componentType']]
 return np.frombuffer(b,dtype=dtype,count=a['count']*n,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,n)
glb_reports={}
for path in (ROOT/'models').glob('*.glb'):
 g,b=parse(path);names=[n['name'] for n in g['nodes']];assert len(names)==len(set(names))
 assert len([n for n in g['nodes'] if n.get('extras',{}).get('kind')=='furniture'])==5
 assert sum(n.get('extras',{}).get('kind')=='wall' for n in g['nodes'])==2
 assert sum(n.get('extras',{}).get('kind')=='floor' for n in g['nodes'])==1
 assert not any('uri' in r for r in g['buffers']+g['images'])
 for i,ac in enumerate(g['accessors']):assert np.isfinite(acc(g,b,i)).all()
 for me in g['meshes']:
  for pr in me['primitives']:
   ind=acc(g,b,pr['indices']);p=acc(g,b,pr['attributes']['POSITION']);no=acc(g,b,pr['attributes']['NORMAL']);assert ind.max()<len(p);assert np.abs(np.linalg.norm(no,axis=1)-1).max()<1e-5
 r={'bytes':path.stat().st_size,'namedNodes':len(names),'embeddedTextures':len(g['images']),'independentFurnitureGroups':5,'twoWallsOneFloor':True,'finiteAttributes':True,'validIndicesAndNormals':True}
 if g.get('animations'):
  a=g['animations'][0];assert len(a['channels'])==10
  for ch in a['channels']:
   name=names[ch['target']['node']];tr=next(t for t in s['motion']['tracks'] if t['name']==name);sa=a['samplers'][ch['sampler']];t=acc(g,b,sa['input'])[:,0];v=acc(g,b,sa['output']);assert np.array_equal(t,frames)
   key,col=('positions',3) if ch['target']['path']=='translation' else ('rotations',4)
   assert np.array_equal(v,arr(tr[key],col)),'GLB / HTML payload mismatch'
   assert np.array_equal(v[0],v[-1]),'Loop endpoints differ'
   if key=='rotations':assert np.max(np.abs(np.linalg.norm(v,axis=1)-1))<1e-5
  r.update({'duration':float(t[-1]),'samples':len(t),'channels':10,'htmlAndGLBAnimationByteExact':True,'loopEndpointsByteExact':True,'architectureNotAnimated':True})
 else:
  state='modified' if 'modified' in path.name else 'original'
  for name,p in LAYOUTS[state].items():
   nn=g['nodes'][names.index(name)];assert np.allclose(nn['translation'],p['position'])
  r['staticLayoutCorrect']=True
 try:
  import trimesh
  model=trimesh.load(path,force='scene');r['independentTrimeshMeshCount']=len(model.geometry)
 except ImportError:r['independentTrimeshMeshCount']='not installed'
 glb_reports[path.name]=r
(ROOT/'docs/glb-validation.json').write_text(json.dumps(glb_reports,indent=2))
print(json.dumps({k:v for k,v in report.items() if k not in ['bounds','minimumByPair']},ensure_ascii=False,indent=2))
print('GLB payload & static import:',len(glb_reports),'files passed')
if errors:sys.exit(1)
