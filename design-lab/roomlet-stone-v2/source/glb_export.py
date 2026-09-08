"""Self-contained glTF 2.0 exporter. Binary assets and animation are embedded.
No engine extensions, external URI, mesh merging, or baked background plane.
"""
from __future__ import annotations
import base64, json, struct
import numpy as np
from scipy.spatial.transform import Rotation

def export_glb(scene: dict, state: str = 'original', animated: bool = False) -> bytes:
    if animated: state = 'original'
    if state not in scene['layouts']: raise ValueError('Unknown layout: '+state)
    out={'asset':{'version':'2.0','generator':'ROOMLET 02 source-authored exporter'},'scene':0,
         'scenes':[{'name':'Roomlet_Stone_02','nodes':[scene['root']], 'extras':{'layouts':scene['layouts'],'fixedArchitecture':True,'loopDuration':scene['motion']['duration']}}],
         'nodes':[],'meshes':[],'materials':[],'accessors':[],'bufferViews':[],'buffers':[{'byteLength':0}],
         'images':[],'textures':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]}
    data=bytearray()
    def view(raw,target=None):
        data.extend(b'\0'*((-len(data))%4)); v={'buffer':0,'byteOffset':len(data),'byteLength':len(raw)}
        if target: v['target']=target
        out['bufferViews'].append(v);data.extend(raw);return len(out['bufferViews'])-1
    def acc(a,typ,target=None,bounds=False):
        a=np.ascontiguousarray(a); ai={'bufferView':view(a.tobytes(),target),'componentType':5126 if a.dtype==np.float32 else 5125,'count':len(a),'type':typ}
        if bounds:
            ar=a.reshape((len(a),-1));ai.update(min=ar.min(0).astype(float).tolist(),max=ar.max(0).astype(float).tolist())
        out['accessors'].append(ai);return len(out['accessors'])-1
    def arr(s,columns,dtype=np.float32):return np.frombuffer(base64.b64decode(s),dtype=dtype).reshape(-1,columns)
    for t in scene['textures']:
        i=view(base64.b64decode(t['data'].split(',')[1]));out['images'].append({'name':t['name'],'mimeType':'image/png','bufferView':i});out['textures'].append({'sampler':0,'source':len(out['images'])-1})
    for m in scene['materials']:
        c=np.array(m['color']);lin=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
        pbr={'baseColorFactor':lin.tolist()+[1],'metallicFactor':m['metalness'],'roughnessFactor':m['roughness']}
        if m['texture']>=0:pbr['baseColorTexture']={'index':m['texture']}
        out['materials'].append({'name':m['name'],'pbrMetallicRoughness':pbr,'doubleSided':True})
    gas=[]
    for g in scene['geometries']:
        gas.append({'attributes':{'POSITION':acc(arr(g['positions'],3),'VEC3',34962,True),
                                  'NORMAL':acc(arr(g['normals'],3),'VEC3',34962),
                                  'TEXCOORD_0':acc(arr(g['uvs'],2),'VEC2',34962)},
                    'indices':acc(arr(g['indices'],1,np.uint32).reshape(-1),'SCALAR',34963),'mode':4})
    cache={}
    for n in scene['nodes']:
        nn={'name':n['name'],'translation':n['position'],'rotation':n['rotation'],'scale':n['scale'],
            'extras':{'label':n.get('label',n['name']),'kind':n.get('kind','part')}}
        if n['children']:nn['children']=n['children'][:]
        if n['name'] in scene['layouts'][state]:
            t=scene['layouts'][state][n['name']];nn['translation']=t['position'];nn['rotation']=Rotation.from_euler('y',t['rotationY']).as_quat().tolist()
        if 'geometry' in n:
            key=(n['geometry'],n['material'])
            if key not in cache:
                prim=dict(gas[key[0]]);prim['material']=key[1]
                cache[key]=len(out['meshes']);out['meshes'].append({'name':scene['geometries'][key[0]]['name']+'__'+scene['materials'][key[1]]['name'],'primitives':[prim]})
            nn['mesh']=cache[key]
        out['nodes'].append(nn)
    c=scene['meta']['fixedCamera'];eye=np.array(c['position']);target=np.array(c['target']);z=(eye-target)/np.linalg.norm(eye-target);x=np.cross([0,1,0],z);x/=np.linalg.norm(x);y=np.cross(z,x)
    qr=Rotation.from_matrix(np.stack([x,y,z],axis=1)).as_quat().tolist()
    out['cameras']=[{'name':c['name'],'type':'orthographic','orthographic':{'xmag':c['height']*.60,'ymag':c['height']/2,'znear':c['near'],'zfar':c['far']}}]
    out['nodes'].append({'name':c['name'],'translation':c['position'],'rotation':qr,'camera':0});out['scenes'][0]['nodes'].append(len(out['nodes'])-1)
    if animated:
        motion=scene['motion'];anim={'name':motion['name'],'channels':[],'samplers':[],
            'extras':{'duration':motion['duration'],'seamlessLoop':True,'landmarks':motion['landmarks'],
                      'notes':'Original to modified to original; includes holds, air lifts and ground motion. Set the player to Repeat; glTF does not mandate autoplay.'}}
        times=arr(motion['times'],1).reshape(-1);ti=acc(times,'SCALAR',bounds=True)
        ids={n['name']:i for i,n in enumerate(scene['nodes'])}
        for track in motion['tracks']:
            for path,key,typ,num in [('translation','positions','VEC3',3),('rotation','rotations','VEC4',4)]:
                ai=acc(arr(track[key],num),typ);si=len(anim['samplers']);anim['samplers'].append({'input':ti,'output':ai,'interpolation':'LINEAR'})
                anim['channels'].append({'sampler':si,'target':{'node':ids[track['name']],'path':path}})
        out['animations']=[anim]
    out['buffers'][0]['byteLength']=len(data)
    jb=json.dumps(out,separators=(',',':'),ensure_ascii=False).encode();jb+=b' '*((-len(jb))%4);data+=b'\0'*((-len(data))%4)
    return struct.pack('<4sII',b'glTF',2,12+8+len(jb)+8+len(data))+struct.pack('<I4s',len(jb),b'JSON')+jb+struct.pack('<I4s',len(data),b'BIN\0')+data
