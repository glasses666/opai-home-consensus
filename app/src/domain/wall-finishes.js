import {pointInPolygon} from './geometry.js';

// Pascal's physical front is left of the directed X/Z edge. Sample off the
// centreline, so a shared wall can have two finishes without altering geometry.
export function wallFaceRooms(scene, surface) {
  if(surface.kind!=='wall'||!surface.edge)return {};
  const {start:a,end:b}=surface.edge,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  if(!length)return {};
  const centre={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
  const at=sign=>({x:centre.x-sign*dz/length,z:centre.z+sign*dx/length});
  return {
    front:scene.rooms.find(room=>pointInPolygon(at(1),room.polygon))?.id,
    back:scene.rooms.find(room=>pointInPolygon(at(-1),room.polygon))?.id,
  };
}

export function wallFinishSlots(scene,surface) {
  // Preserve the legacy appearance unless room-specific finishes were set.
  if(!surface.roomMaterialIds)return {interior:surface.materialId,exterior:'mat-wall-warm-white'};
  const sides=wallFaceRooms(scene,surface);
  const finish=roomId=>surface.roomMaterialIds[roomId]??surface.materialId;
  // Shared walls remain front/back = interior/exterior when both sides are
  // enclosed. External faces are classified by wallFaceSemantics at hydration.
  if(sides.front&&sides.back)return {interior:finish(sides.front),exterior:finish(sides.back)};
  return {interior:finish(sides.front??sides.back),exterior:'mat-wall-warm-white'};
}

export function wallFaceSemantics(scene,surface){
  const sides=surface.roomMaterialIds?wallFaceRooms(scene,surface):{};
  if(sides.front&&!sides.back)return {frontSide:'interior',backSide:'exterior'};
  if(sides.back&&!sides.front)return {frontSide:'exterior',backSide:'interior'};
  return {frontSide:'unknown',backSide:'unknown'};
}
