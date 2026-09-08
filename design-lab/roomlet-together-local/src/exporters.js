/* Standard glTF 2.0 / GLB packaging. No external export library is required. */
(() => {
'use strict';
const decode=s=>{const b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;};
const quat=y=>[0,Math.sin(y/2),0,Math.cos(y/2)];
function buildGLB(data,state='original',animated=false){
 if(animated)state='original';
 if(!data.layouts[state])throw new Error('Unknown layout '+state);
 const g={asset:{version:'2.0',generator:'ROOMLET Stories browser exporter'},scene:0,scenes:[{name:data.meta.slug,nodes:[data.root],extras:{layouts:data.layouts,fixedArchitecture:true}}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[{byteLength:0}],images:[],textures:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}]};
 const parts=[];let offset=0;
 function view(bytes,target){const pad=(-offset)&3;if(pad){parts.push(new Uint8Array(pad));offset+=pad;}const v={buffer:0,byteOffset:offset,byteLength:bytes.byteLength};if(target)v.target=target;g.bufferViews.push(v);parts.push(bytes);offset+=bytes.byteLength;return g.bufferViews.length-1;}
 function acc(bytes,type,componentType,components,target,bounds=false){let ar=componentType===5126?new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4):new Uint32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);const a={bufferView:view(bytes,target),componentType,count:ar.length/components,type};if(bounds){let lo=Array(components).fill(Infinity),hi=Array(components).fill(-Infinity);for(let i=0;i<ar.length;i++){let j=i%components;lo[j]=Math.min(lo[j],ar[i]);hi[j]=Math.max(hi[j],ar[i]);}a.min=lo;a.max=hi;}g.accessors.push(a);return g.accessors.length-1;}
 function floatAcc(values,type,components,bounds=false){return acc(new Uint8Array(new Float32Array(values).buffer),type,5126,components,undefined,bounds);}
 for(const t of data.textures){let bytes=decode(t.data.split(',')[1]),v=view(bytes);g.images.push({name:t.name,mimeType:'image/png',bufferView:v});g.textures.push({sampler:0,source:g.images.length-1});}
 const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
 for(const m of data.materials){const p={baseColorFactor:[...m.color.map(linear),1],roughnessFactor:m.roughness,metallicFactor:m.metalness};if(m.texture>=0)p.baseColorTexture={index:m.texture};g.materials.push({name:m.name,pbrMetallicRoughness:p,doubleSided:true});}
 const geos=data.geometries.map(geo=>({attributes:{POSITION:acc(decode(geo.positions),'VEC3',5126,3,34962,true),NORMAL:acc(decode(geo.normals),'VEC3',5126,3,34962),TEXCOORD_0:acc(decode(geo.uvs),'VEC2',5126,2,34962)},indices:acc(decode(geo.indices),'SCALAR',5125,1,34963),mode:4}));
 const cache=new Map();
 for(const n of data.nodes){const t=data.layouts[state][n.name],out={name:n.name,translation:t?t.position:n.position,rotation:t?quat(t.rotationY):n.rotation,scale:n.scale,extras:{label:n.label||n.name,kind:n.kind||'part'}};if(n.children.length)out.children=[...n.children];if(n.geometry!==undefined){const key=n.geometry+':'+n.material;if(!cache.has(key)){cache.set(key,g.meshes.length);g.meshes.push({name:data.geometries[n.geometry].name+'__'+data.materials[n.material].name,primitives:[{...geos[n.geometry],material:n.material}]});}out.mesh=cache.get(key);}g.nodes.push(out);}
 // Standard orthographic camera; scene lighting is intentionally a viewer concern.
 const c=data.meta.fixedCamera,viewMatrix=SculptMath.look(c.position,c.target),world=SculptMath.inv(viewMatrix);
 g.cameras=[{name:c.name,type:'orthographic',orthographic:{xmag:c.height*.60,ymag:c.height/2,znear:c.near,zfar:c.far}}];g.nodes.push({name:c.name,matrix:Array.from(world),camera:0});g.scenes[0].nodes.push(g.nodes.length-1);
 if(animated){
  const motion=data.motion,a={name:motion.name,channels:[],samplers:[],extras:{duration:motion.duration,seamlessLoop:true,landmarks:motion.landmarks,notes:'Full A to B to A cycle; enable Repeat in your player.'}};
  const timeAcc=acc(decode(motion.times),'SCALAR',5126,1,undefined,true);
  for(const t of motion.tracks){
   const index=data.nodes.findIndex(n=>n.name===t.name);
   for(const [path,key,type,num] of [['translation','positions','VEC3',3],['rotation','rotations','VEC4',4]]){
    const output=acc(decode(t[key]),type,5126,num),si=a.samplers.length;
    a.samplers.push({input:timeAcc,output,interpolation:'LINEAR'});a.channels.push({sampler:si,target:{node:index,path}});
   }
  }
  g.animations=[a];
 }
 g.buffers[0].byteLength=offset;
 const text=new TextEncoder().encode(JSON.stringify(g)),jp=(-text.length)&3,bp=(-offset)&3,total=12+8+text.length+jp+8+offset+bp;
 const buffer=new ArrayBuffer(total),v=new DataView(buffer),bytes=new Uint8Array(buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,total,true);v.setUint32(12,text.length+jp,true);v.setUint32(16,0x4e4f534a,true);bytes.set(text,20);bytes.fill(32,20+text.length,20+text.length+jp);let pos=20+text.length+jp;v.setUint32(pos,offset+bp,true);v.setUint32(pos+4,0x004e4942,true);pos+=8;for(const p of parts){bytes.set(p,pos);pos+=p.length;}return new Blob([buffer],{type:'model/gltf-binary'});
}
function download(blob,name){if(!blob)throw new Error('Export produced an empty file.');let url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
window.SculptExport={buildGLB,download};
})();
