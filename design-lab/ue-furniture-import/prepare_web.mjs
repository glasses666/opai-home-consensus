// Normalize private UE exports to unit bounds for the canonical dimensional bridge.
import fs from 'node:fs/promises';
import { Box3, Matrix4, Quaternion, Vector3 } from '../../app/node_modules/three/build/three.module.js';
const input=new URL('./OpaiFurnitureImport/Saved/WebExports/',import.meta.url);
const output=new URL('../../app/public/assets/models/fab/',import.meta.url);
const mapping={
  sofa:['SM_Modern_Sofa_2',-Math.PI/2],
  'dining-table':['SM_Modern_Table',0],
  'dining-chair':['SM_Modern_Chair_1',0],
  'coffee-table':['SM_Coffee_Table',0],
  'lounge-chair':['SM_Elegant_chair',0],
  'double-bed':['SM_Modern_Bed_1',0],
  wardrobe:['wardrobe-assembled',0],
  desk:['SM_Modern_Table',0],
};
await fs.mkdir(output,{recursive:true});
const manifest={};
for(const [name,[source,angle]] of Object.entries(mapping)){
  const b=await fs.readFile(new URL(source+'.glb',input));
  const n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n));
  const bin=b.subarray(20+n); // Includes original BIN chunk header and padding.
  const box=new Box3(),turn=new Matrix4().makeRotationY(angle);
  const visit=(id,parent)=>{
    const node=j.nodes[id];
    const local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(
      new Vector3(...(node.translation??[0,0,0])),
      new Quaternion(...(node.rotation??[0,0,0,1])),
      new Vector3(...(node.scale??[1,1,1])));
    const world=parent.clone().multiply(local);
    for(const p of j.meshes?.[node.mesh]?.primitives??[]){
      const a=j.accessors[p.attributes.POSITION];
      box.union(new Box3(new Vector3(...a.min),new Vector3(...a.max)).applyMatrix4(world));
    }
    for(const c of node.children??[])visit(c,world);
  };
  const scene=j.scenes[j.scene??0];for(const id of scene.nodes)visit(id,turn);
  const baseline = ['sofa','double-bed','dining-chair','lounge-chair'].includes(name)
    ? 'mat-fabric-warm-gray' : name==='wardrobe' ? 'mat-object-warm-white' : 'mat-oak-veneer';
  for (const node of j.nodes) if (node.mesh !== undefined) node.extras={...node.extras, fabDefaultMaterial:baseline};
  const size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
  if(!size.toArray().every(v=>v>0))throw Error('Invalid bounds: '+name);
  const matrix=new Matrix4().makeScale(1/size.x,1/size.y,1/size.z)
    .multiply(new Matrix4().makeTranslation(-center.x,-box.min.y,-center.z)).multiply(turn);
  j.nodes.push({name:'FabUnitBounds',matrix:matrix.toArray(),children:scene.nodes});
  scene.nodes=[j.nodes.length-1];
  j.asset.extras={sourcePack:'Next Level 3D Free Furniture Pack',sourceMesh:source,license:'Fab Standard',normalizedBounds:[1,1,1]};
  let json=Buffer.from(JSON.stringify(j));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const bytes=Buffer.concat([header,json,bin]);await fs.writeFile(new URL(name+'.glb',output),bytes);
  manifest[name]={source,bytes:bytes.length,sourceBounds:size.toArray(),rotationY:angle};
}
await fs.writeFile(new URL('./web-manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(manifest);
