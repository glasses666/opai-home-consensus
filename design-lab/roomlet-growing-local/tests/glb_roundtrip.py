"""Small read-only GLB bridge used ONLY for visual round-trip QA.
Not the preview's export path and not an external certification library.
It reads meshes, node hierarchy, embedded PNGs, PBR colors and animation buffers
from the actual GLB file. UI copy / lighting camera framing comes from metadata.
"""
from pathlib import Path
import base64,json,struct,copy

def read_glb(path:Path,ui_metadata:dict)->dict:
 raw=path.read_bytes();magic,ver,total=struct.unpack_from('<4sII',raw);assert (magic,ver,total)==(b'glTF',2,len(raw))
 size,kind=struct.unpack_from('<I4s',raw,12);assert kind==b'JSON';g=json.loads(raw[20:20+size]);n,kind=struct.unpack_from('<I4s',raw,20+size);assert kind==b'BIN\0';data=raw[28+size:28+size+n]
 def view(i):
  v=g['bufferViews'][i];assert not v.get('byteStride');return data[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
 def b64(b):return base64.b64encode(b).decode()
 def acc(i):
  a=g['accessors'][i];assert a['componentType'] in [5126,5125] and not a.get('byteOffset');return b64(view(a['bufferView']))
 geos=[];mesh_ids=[];cache={}
 for mesh in g['meshes']:
  assert len(mesh['primitives'])==1;p=mesh['primitives'][0];assert p.get('mode',4)==4
  a=p['attributes'];key=(a['POSITION'],a['NORMAL'],a['TEXCOORD_0'],p['indices'])
  if key not in cache:
   cache[key]=len(geos);geos.append({'name':mesh['name'],'positions':acc(a['POSITION']),'normals':acc(a['NORMAL']),'uvs':acc(a['TEXCOORD_0']),'indices':acc(p['indices'])})
  mesh_ids.append((cache[key],p['material']))
 materials=[]
 def srgb(v):return 12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055
 for m in g['materials']:
  p=m['pbrMetallicRoughness'];materials.append({'name':m['name'],'color':[srgb(v) for v in p['baseColorFactor'][:3]],'roughness':p['roughnessFactor'],'metalness':p['metallicFactor'],'texture':p.get('baseColorTexture',{}).get('index',-1)})
 textures=[]
 for t in g['textures']:
  im=g['images'][t['source']];textures.append({'name':im['name'],'data':'data:'+im['mimeType']+';base64,'+b64(view(im['bufferView']))})
 nodes=[]
 for n in g['nodes']:
  nn={'name':n['name'],'position':n.get('translation',[0,0,0]),'rotation':n.get('rotation',[0,0,0,1]),'scale':n.get('scale',[1,1,1]),'children':n.get('children',[]),'label':n.get('extras',{}).get('label',n['name']),'kind':n.get('extras',{}).get('kind','part')}
  if 'mesh' in n:nn['geometry'],nn['material']=mesh_ids[n['mesh']]
  nodes.append(nn)
 a=g['animations'][0];tracks={};time_acc=None
 for ch in a['channels']:
  n=nodes[ch['target']['node']]['name'];sa=a['samplers'][ch['sampler']];assert sa['interpolation']=='LINEAR';time_acc=sa['input']
  if n not in tracks:tracks[n]={'name':n}
  tracks[n][{'translation':'positions','rotation':'rotations'}[ch['target']['path']]]=acc(sa['output'])
 motion=copy.deepcopy(ui_metadata['motion']);motion.update({'name':a['name'],'times':acc(time_acc),'tracks':list(tracks.values())})
 return {'meta':copy.deepcopy(ui_metadata['meta']),'materials':materials,'textures':textures,'geometries':geos,'nodes':nodes,'root':g['scenes'][g.get('scene',0)]['nodes'][0],'layouts':g['scenes'][0]['extras']['layouts'],'motion':motion}
