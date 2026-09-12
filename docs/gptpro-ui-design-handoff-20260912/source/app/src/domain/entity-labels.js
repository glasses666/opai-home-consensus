import { wallFaceRooms } from './wall-finishes.js';
const categoryNames={bed:'床',desk:'书桌',sofa:'沙发',chair:'椅子','dining-chair':'餐椅','dining-table':'餐桌',
  'coffee-table':'茶几','fixed-cabinet':'柜体',cabinet:'柜体',wardrobe:'衣柜',shelf:'置物架','tv-console':'电视柜',
  'feature-wall':'背景墙',nightstand:'床头柜'};
const readable=value=>typeof value==='string'&&/[\u3400-\u9fff]/u.test(value);
/** User-facing identification derives from real room/category/geometry, not an internal ID. */
export function readableEntityName(scene,id,faceRoomId) {
  const object=scene.objects.find(item=>item.id===id),surface=scene.surfaces.find(item=>item.id===id);
  const item=object??surface;if(!item)return '已移除的对象';
  const room=scene.rooms.find(r=>r.id===(surface&&faceRoomId?faceRoomId:item.roomId))??scene.rooms.find(r=>r.id===item.roomId),roomName=room?.name??'房间';
  if(object){
    const name=readable(object.name)?object.name:categoryNames[object.category]??'家具';
    const peers=scene.objects.filter(o=>o.roomId===object.roomId&&o.category===object.category);
    return `${roomName} · ${name}${peers.length>1?` ${peers.indexOf(object)+1}`:''}`;
  }
  if(surface.kind!=='wall')return `${roomName} · ${{floor:'地面',ceiling:'顶面'}[surface.kind]??'饰面'}`;
  if(!surface.edge||!room?.polygon?.length)return `${roomName} · 墙面`;
  const center={x:room.polygon.reduce((sum,p)=>sum+p.x,0)/room.polygon.length,
    z:room.polygon.reduce((sum,p)=>sum+p.z,0)/room.polygon.length};
  const x=(surface.edge.start.x+surface.edge.end.x)/2-center.x,z=(surface.edge.start.z+surface.edge.end.z)/2-center.z;
  const side=Math.abs(x)>Math.abs(z)?x>0?'东侧':'西侧':z>0?'南侧':'北侧';
  const peers=scene.surfaces.filter(s=>s.kind==='wall'&&(s.roomId===room.id||Object.values(wallFaceRooms(scene,s)).includes(room.id)));
  // Wall sequence is an ordinary readable locator, not an opaque entity ID.
  return `${roomName} · ${side}墙面（${peers.indexOf(surface)+1}）`;
}
export function changedEntities(before,after) {
  return [...after.objects,...after.surfaces].filter(item=>{
    const old=[...before.objects,...before.surfaces].find(prior=>prior.id===item.id);
    return JSON.stringify(old)!==JSON.stringify(item);
  });
}

export function affectedRoomIds(before,after) {
  const result=new Set();
  for(const item of changedEntities(before,after).filter(o=>o.transform))result.add(item.roomId);
  for(const old of before.objects)if(!after.objects.some(o=>o.id===old.id))result.add(old.roomId);
  for(const next of after.surfaces){
    const old=before.surfaces.find(s=>s.id===next.id);
    if(!old){result.add(next.roomId);continue;}
    const rooms=new Set([...Object.keys(old.roomMaterialIds??{}),...Object.keys(next.roomMaterialIds??{}),
      next.roomId,...Object.values(wallFaceRooms(after,next))]);
    for(const id of rooms)if((old.roomMaterialIds?.[id]??old.materialId)!==(next.roomMaterialIds?.[id]??next.materialId))result.add(id);
  }
  return [...result].filter(id=>after.rooms.some(r=>r.id===id));
}
