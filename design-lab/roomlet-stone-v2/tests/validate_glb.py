#!/usr/bin/env python3
"""Check GLB structure, full loop endpoints, embedded resources and architecture.
This is a project regression test, not official Khronos certification.
"""
import json,struct,base64
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
def parse(path):
 b=path.read_bytes();magic,version,length=struct.unpack_from('<4sII',b);assert magic==b'glTF' and version==2 and length==len(b)
 n,typ=struct.unpack_from('<I4s',b,12);assert typ==b'JSON';g=json.loads(b[20:20+n]);size,typ=struct.unpack_from('<I4s',b,20+n);assert typ==b'BIN\0';data=b[28+n:28+n+size]
 return g,data
def accessor(g,b,i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];num={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dt=np.float32 if a['componentType']==5126 else np.uint32
 return np.frombuffer(b,dtype=dt,count=a['count']*num,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,num)
report={}
files=list((ROOT/'models').glob('*.glb'))
for path in files:
 g,b=parse(path);nodes=g['nodes'];names=[n['name'] for n in nodes];assert len(names)==len(set(names))
 furn=[i for i,n in enumerate(nodes) if n.get('extras',{}).get('kind')=='furniture'];assert len(furn)==6
 assert sum(n.get('extras',{}).get('kind')=='wall' for n in nodes)==2
 assert sum(n.get('extras',{}).get('kind')=='floor' for n in nodes)==1
 assert all('bufferView' in image and 'uri' not in image for image in g['images'])
 assert 'uri' not in g['buffers'][0]
 for mesh in g['meshes']:
  for p in mesh['primitives']:
   xyz=accessor(g,b,p['attributes']['POSITION']);nor=accessor(g,b,p['attributes']['NORMAL']);inds=accessor(g,b,p['indices'])
   assert np.isfinite(xyz).all() and np.isfinite(nor).all() and inds.max()<len(xyz)
   assert np.max(np.abs(np.linalg.norm(nor,axis=1)-1))<1e-4
 result={'bytes':path.stat().st_size,'nodes':len(nodes),'furnitureGroups':len(furn),'embeddedImages':len(g['images']),'animationClips':len(g.get('animations',[]))}
 if 'animations' in g:
  anim=g['animations'][0];assert len(anim['channels'])==12
  maxPosError=0;maxQuatError=0
  for channel in anim['channels']:
   idx=channel['target']['node'];assert idx in furn
   sampler=anim['samplers'][channel['sampler']];t=accessor(g,b,sampler['input']);v=accessor(g,b,sampler['output'])
   assert np.all(np.diff(t[:,0])>0) and len(v)==len(t);assert sampler['interpolation']=='LINEAR'
   assert np.allclose(v[0],v[-1]);name=nodes[idx]['name'];a=g['scenes'][0]['extras']['layouts']['original'][name];z=g['scenes'][0]['extras']['layouts']['modified'][name]
   mid=np.argmin(np.abs(t[:,0]-8.2))
   if channel['target']['path']=='translation':
    assert np.allclose(v[0],a['position']) and np.allclose(v[mid],z['position']);maxPosError=max(maxPosError,float(np.max(np.abs(v[0]-v[-1]))))
   else:
    assert np.max(np.abs(np.linalg.norm(v,axis=1)-1))<1e-5;maxQuatError=max(maxQuatError,float(np.max(np.abs(v[0]-v[-1]))))
  result.update(duration=float(t[-1,0]),samples=len(t),channels=12,onlyFurnitureAnimated=True,loopPositionError=maxPosError,loopQuaternionError=maxQuatError)
 # An independent loader must be able to read each static/default scene.
 try:
  import trimesh
  model=trimesh.load(path,force='scene');result['independentImporterMeshes']=len(model.geometry)
 except ImportError:result['independentImporterMeshes']='trimesh not installed'
 report[path.name]=result
(ROOT/'docs/glb-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
