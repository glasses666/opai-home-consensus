import { createDemoScene } from './demo-scene.js';
import { wallFaceRooms } from './wall-finishes.js';

export const referenceHomeSource = {
  title: '首开·熙悦丽博 C 户型', page: 8, publishedGrossAreaM2: 89,
  url: 'https://www.bjfsh.gov.cn/zwgk/zfbz/202208/P020220822344918196348.pdf',
  note: '依据公开选房手册的空间关系与标注尺寸重建；墙厚、门窗净尺寸及局部过道为演示估算，不是施工图。',
};
const polygon = points => points.map(([x,z])=>({x,z}));
const rect = (x,z,w,d)=>polygon([[x,z],[x+w,z],[x+w,z+d],[x,z+d]]);

export function createReferenceHome() {
  const base=createDemoScene();
  base.materials.push(
    {id:'mat-wall-bedroom-sage',name:'主卧鼠尾草灰绿',kind:'paint',appliesTo:['wall'],source:'demo',color:'#9bA28f'},
    {id:'mat-wall-bedroom-ivory',name:'主卧暖米灰墙面',kind:'paint',appliesTo:['wall'],source:'demo',color:'#ded4c5'},
    {id:'mat-floor-bedroom-oak',name:'主卧烟熏浅橡木',kind:'wood',appliesTo:['floor'],source:'demo',color:'#b5a18b'},
    {id:'mat-object-bedroom-putty',name:'主卧亚麻灰柜面',kind:'painted-wood',appliesTo:['object'],source:'demo',color:'#c5b8a2'},
  );
  const specs=[
    ['kitchen','厨房','kitchen',rect(0,0,1650,3550)],
    ['bathroom','公卫','bathroom',rect(1650,0,1750,2300)],
    ['guest','次卧 / 客房','bedroom',polygon([[3400,0],[6600,0],[6600,2850],[4500,2850],[4500,2300],[3400,2300]])],
    ['hall','卧室过道','circulation',rect(1650,2300,2850,1250)],
    ['flex','儿童房','bedroom-study',polygon([[4500,2850],[6600,2850],[6600,5450],[3400,5450],[3400,3550],[4500,3550]])],
    ['ensuite','主卫','bathroom',rect(4500,5450,2100,1500)],
    ['primary-bedroom','主卧','bedroom',polygon([[3400,5450],[4500,5450],[4500,6950],[6600,6950],[6600,10500],[3400,10500]])],
    ['living-dining','客餐厅 / 玄关','living-dining',rect(0,3550,3400,5750)],
    ['balcony','南向阳台','balcony',rect(550,9300,2850,1200)],
  ];
  const rooms=specs.map(([key,name,kind,shape])=>({id:'room-'+key,name,kind,polygon:shape,adjacentRoomIds:[],cameraPresetIds:['camera-'+key+'-overhead']}));
  const surfaces=rooms.flatMap(r=>['floor','ceiling'].map(kind=>({id:`surface-${kind}-${r.id.slice(5)}`,kind,roomId:r.id,polygon:r.polygon,
    ...(kind==='ceiling'?{elevation:2800}:{}),materialId:kind==='ceiling'?'mat-ceiling-warm-white':r.kind==='bathroom'||r.kind==='kitchen'?'mat-floor-tile-warm':'mat-floor-light-oak',source:'demo',capabilities:{materialEditable:true},ruleIds:['rule-room-boundary']})));
  // Split collinear boundaries, then merge only segments with identical owners.
  const edges=rooms.flatMap(r=>r.polygon.map((a,i)=>{const b=r.polygon[(i+1)%r.polygon.length],horizontal=a.z===b.z;return{room:r.id,horizontal,fixed:horizontal?a.z:a.x,lo:Math.min(horizontal?a.x:a.z,horizontal?b.x:b.z),hi:Math.max(horizontal?a.x:a.z,horizontal?b.x:b.z)};}));
  const lines=new Map();for(const e of edges){const key=e.horizontal+':'+e.fixed;if(!lines.has(key))lines.set(key,[]);lines.get(key).push(e);}
  const walls=[];
  for(const list of lines.values()){
    const cuts=[...new Set(list.flatMap(e=>[e.lo,e.hi]))].sort((a,b)=>a-b);let previous;
    for(let i=0;i<cuts.length-1;i++){
      const lo=cuts[i],hi=cuts[i+1],owners=[...new Set(list.filter(e=>e.lo<=lo&&e.hi>=hi).map(e=>e.room))].sort();
      if(!owners.length){previous=null;continue;}
      for(const id of owners)for(const other of owners)if(id!==other){const r=rooms.find(r=>r.id===id);if(!r.adjacentRoomIds.includes(other))r.adjacentRoomIds.push(other);}
      if(owners.includes('room-hall')&&owners.includes('room-living-dining')){previous=null;continue;}
      if(previous&&previous.owners.join()===owners.join()&&previous.hi===lo)previous.hi=hi;
      else{previous={...list[0],lo,hi,owners};walls.push(previous);}
    }
  }
  walls.forEach((w,i)=>{w.id='surface-wall-reference-'+i;const pt=n=>w.horizontal?{x:n,z:w.fixed}:{x:w.fixed,z:n};surfaces.push({id:w.id,kind:'wall',roomId:w.owners[0],edge:{start:pt(w.lo),end:pt(w.hi)},height:2800,thickness:w.owners.length===1?180:120,materialId:'mat-wall-warm-white',source:'demo',capabilities:{materialEditable:true},ruleIds:['rule-opening-clearance']});});
  const openings=[];
  const opening=(id,owners,horizontal,fixed,start,width,kind='interior-door')=>{
    const w=walls.find(w=>w.horizontal===horizontal&&w.fixed===fixed&&owners.every(id=>w.owners.includes('room-'+id))&&w.lo<=start&&w.hi>=start+width);
    if(!w)throw Error('Reference opening has no continuous host: '+id);
    const window=kind==='window';openings.push({id:'opening-'+id,kind,hostSurfaceId:w.id,offset:start-w.lo,width,height:window?1400:2200,sillHeight:window?900:0,materialId:'mat-door-warm-white',...(['interior-door','exterior-door'].includes(kind)?{swing:{hinge:'start',side:1}}:{}),...(owners.length===1?{connectsExterior:true}:{connectsRoomIds:owners.map(id=>'room-'+id)}),ruleIds:['rule-opening-clearance']});
  };
  opening('entry',['living-dining'],false,0,3800,900,'exterior-door');
  opening('kitchen',['kitchen','living-dining'],true,3550,650,850);
  opening('bath',['bathroom','hall'],true,2300,2350,800);
  opening('guest',['guest','hall'],true,2300,3500,850);
  opening('child',['flex','hall'],true,3550,3500,850);
  opening('primary',['primary-bedroom','living-dining'],false,3400,5650,850);
  opening('ensuite',['ensuite','primary-bedroom'],false,4500,5750,800);
  opening('balcony',['balcony','living-dining'],true,9300,850,2300,'shared-doorway');
  opening('kitchen-window',['kitchen'],true,0,350,1000,'window');
  opening('bath-window',['bathroom'],true,0,2150,800,'window');
  opening('guest-window',['guest'],true,0,3950,2100,'window');
  opening('child-window',['flex'],false,6600,3500,1500,'window');
  opening('ensuite-window',['ensuite'],false,6600,5800,700,'window');
  opening('primary-window',['primary-bedroom'],true,10500,3950,2100,'window');
  opening('balcony-window',['balcony'],true,10500,850,2300,'window');
  const objects=[];
  const add=(source,id,room,x,z,angle=0,dimensions)=>{
    const o=structuredClone(base.objects.find(o=>o.id===source));o.id=id;o.externalId='REFERENCE-'+id;o.roomId='room-'+room;o.preferredCameraPresetId='camera-'+room+'-overhead';o.transform={x,y:0,z,rotationY:angle};if(dimensions)o.dimensions={...o.dimensions,...dimensions};
    if(o.installation)o.installation.hostSurfaceId='surface-floor-'+room;
    o.hierarchy.parentId=o.roomId;o.placement.hostSurfaceId='surface-floor-'+room;
    o.collision.dimensions={...o.dimensions};o.model3D.renderBounds={...o.dimensions};o.model3D.slotId='slot-'+id;
    o.ruleIds=o.ruleIds.filter(id=>!['rule-child-activity-clearance','rule-tv-distance-1800-3600'].includes(id));objects.push(o);
  };
  add('object-primary-bed','object-primary-bed','primary-bedroom',5500,7750,-Math.PI/2,{width:1500,depth:1900});
  objects.at(-1).model3D.src='/assets/models/bedroom-bed.glb';
  add('object-primary-wardrobe','object-primary-wardrobe','primary-bedroom',3750,9450,Math.PI/2,{width:1800,depth:500});
  objects.at(-1).materialId='mat-object-bedroom-putty';
  // Keep the user-confirmed bed and wardrobe exactly where they are. The old
  // master-bedroom story still needs a material-editable focal surface, so fit
  // its feature panel to the real east wall instead of reviving the old room.
  const primaryHeadboardSurface=surfaces.find(surface=>surface.kind==='wall'
    && surface.roomId==='room-primary-bedroom'
    && surface.edge?.start.x===6600&&surface.edge?.end.x===6600
    && Math.min(surface.edge.start.z,surface.edge.end.z)<=6950
    && Math.max(surface.edge.start.z,surface.edge.end.z)>=10500);
  if(!primaryHeadboardSurface)throw Error('Reference primary-bedroom headboard wall is missing');
  primaryHeadboardSurface.materialId='mat-wall-bedroom-ivory';
  for(const surface of surfaces.filter(surface=>surface.kind==='wall')){
    if(Object.values(wallFaceRooms({rooms},surface)).includes('room-primary-bedroom'))surface.roomMaterialIds={'room-primary-bedroom':'mat-wall-bedroom-ivory'};
  }
  surfaces.find(surface=>surface.id==='surface-floor-primary-bedroom').materialId='mat-floor-bedroom-oak';
  // East wall's inner face is 6510 mm (180 mm wall thickness). Keep the
  // entire 40 mm panel outside it, with a real 5 mm gap rather than coplanar art.
  // Its front also clears the unchanged bed footprint by 15 mm.
  add('object-primary-feature-wall','object-primary-feature-wall','primary-bedroom',6485,8710,-Math.PI/2,{width:3380,depth:40,height:2700});
  const primaryFeatureWall=objects.at(-1);
  primaryFeatureWall.name='床头主景墙';
  primaryFeatureWall.preferredCameraPresetId='camera-primary-bedroom-feature';
  primaryFeatureWall.materialId='mat-object-warm-white';
  primaryFeatureWall.model3D.src='/assets/models/bedroom-surround.glb';
  delete primaryFeatureWall.wallArt; // Artwork is authored geometry inside this GLB.
  primaryFeatureWall.placement.hostSurfaceId=primaryHeadboardSurface.id;
  primaryFeatureWall.installation.hostSurfaceId=primaryHeadboardSurface.id;
  add('object-coffee-table','object-primary-bedside','primary-bedroom',6200,8800,-Math.PI/2,{width:460,depth:420,height:1000});
  const bedside=objects.at(-1);
  bedside.name='床头柜与暖光台灯';
  bedside.category='bedside-table';
  bedside.materialId='mat-oak-veneer';
  bedside.model3D.src='/assets/models/bedroom-bedside.glb';
  bedside.preferredCameraPresetId='camera-primary-bedroom-feature';
  for(const object of objects.filter(object=>['object-primary-bed','object-primary-feature-wall','object-primary-bedside'].includes(object.id))){
    object.model3D.generator='scripts/build_bedroom_assets.py';
    object.model3D.revision+=1;
    object.model3D.provenance={...object.model3D.provenance,provider:'local-blender',generationId:'bedroom-restyle-20260910',humanReviewed:false};
  }
  // User-reviewed baseline promoted on 2026-09-11. New projects and Agent
  // sessions must start from these final manual placements, not the earlier
  // reconstruction draft.
  surfaces.find(surface=>surface.id==='surface-floor-living-dining').materialId='mat-floor-bedroom-oak';
  for(const id of ['surface-wall-reference-2','surface-wall-reference-14','surface-wall-reference-15','surface-wall-reference-20']){
    surfaces.find(surface=>surface.id===id).materialId='mat-wall-bedroom-ivory';
  }
  add('object-flex-bed','object-flex-bed','flex',5500,4500,-Math.PI/2,{width:1000,depth:1950});
  add('object-primary-wardrobe','object-guest-wardrobe','guest',5540,2565,Math.PI,{width:1900,depth:430});
  objects.at(-1).materialId='mat-oak-veneer';
  add('object-primary-wardrobe','object-child-wardrobe','flex',3685,4950,Math.PI/2,{width:1000,depth:430});
  add('object-flex-desk','object-flex-desk','flex',6300,3375,-Math.PI/2,{width:950,depth:500});
  add('object-dining-chair-n','object-flex-chair','flex',5650,3375,0,{width:420,depth:430,height:820});
  const flexChair=objects.at(-1);
  flexChair.name='窗边书桌椅';
  flexChair.category='task-chair';
  flexChair.ruleIds=['rule-room-boundary'];
  flexChair.model3D.src='/assets/models/dining-chair.glb';
  flexChair.model3D.provenance={generationId:'flex-imagegen-layout-20260911',humanReviewed:true,provider:'local-generator'};
  add('object-primary-bed','object-guest-bed','guest',5750,1400,-Math.PI,{width:1350,depth:1900});
  add('object-coffee-table','object-guest-bedside','guest',6200,210,0,{width:460,depth:420,height:1000});
  const guestBedside=objects.at(-1);
  guestBedside.name='次卧床头柜与暖光台灯';
  guestBedside.category='bedside-table';
  guestBedside.materialId='mat-oak-veneer';
  guestBedside.model3D.src='/assets/models/bedroom-bedside.glb';
  guestBedside.model3D.generator='scripts/build_bedroom_assets.py';
  guestBedside.model3D.revision=2;
  guestBedside.model3D.provenance={generationId:'guest-imagegen-layout-20260911',humanReviewed:false,provider:'local-blender'};
  add('object-sofa','object-sofa','living-dining',620,7700,Math.PI/2,{width:2100,depth:850});
  add('object-tv-console','object-tv-console','living-dining',3080,7900,-Math.PI/2);
  add('object-coffee-table','object-coffee-table','living-dining',1830,7750,-Math.PI/2,{width:800,depth:550});
  add('object-dining-table','object-dining-table','living-dining',2100,5100,0,{width:1100,depth:700});
  add('object-dining-chair-n','object-dining-chair-n','living-dining',1800,4520,-Math.PI/2,{width:420,depth:430});
  add('object-dining-chair-s','object-dining-chair-s','living-dining',1800,5750,Math.PI/2,{width:420,depth:430});
  add('object-kitchen-counter','object-kitchen-counter','kitchen',360,1600,Math.PI/2);
  const cameraPresets=[{id:'camera-home-overview',roomId:null,kind:'whole_home',label:'整屋',position:{x:12700,y:14000,z:17600},target:{x:3300,y:0,z:5250},fov:40},...rooms.map(r=>{const xs=r.polygon.map(p=>p.x),zs=r.polygon.map(p=>p.z),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;return{id:r.cameraPresetIds[0],roomId:r.id,kind:'room_overhead',label:'俯视',position:{x:x+60,y:Math.max(7200,Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs))*1.8),z:z+60},target:{x,y:0,z},fov:50};})];
  const primaryFeatureCamera={id:'camera-primary-bedroom-feature',roomId:'room-primary-bedroom',kind:'object_feature',label:'床头主景',position:{x:4450,y:2450,z:10300},target:{x:5650,y:750,z:8050},fov:55};
  cameraPresets.push(primaryFeatureCamera);
  rooms.find(room=>room.id==='room-primary-bedroom').cameraPresetIds.push(primaryFeatureCamera.id);
  return {...base,id:'scene-reference-xiyue-c',floorPlan:{...base.floorPlan,id:'floor-reference-c',bounds:{x:0,z:0,width:6600,depth:10500,height:2800}},rooms,surfaces,openings,objects,cameraPresets,clearanceZones:[],reference:referenceHomeSource};
}
