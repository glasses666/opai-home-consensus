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

// A wall is stored once even when it forms the boundary of two rooms.  Its
// legacy roomId is the owning geometry record, not the complete set of room
// faces that a resident can see.  Keep that distinction in one shared helper
// so room-scoped tools do not accidentally omit partition walls.
export function surfaceRoomIds(scene, surface) {
  if (!surface) return [];
  if (surface.kind !== 'wall') return surface.roomId ? [surface.roomId] : [];
  return [...new Set([
    surface.roomId,
    ...Object.values(wallFaceRooms(scene, surface)),
  ].filter(Boolean))];
}

export function surfaceBelongsToRoom(scene, surface, roomId) {
  return typeof roomId === 'string' && surfaceRoomIds(scene, surface).includes(roomId);
}

export function surfaceMaterialForRoom(scene, surface, roomId) {
  if (surface?.kind === 'wall' && surfaceBelongsToRoom(scene, surface, roomId)) {
    return surface.roomMaterialIds?.[roomId] ?? surface.materialId;
  }
  return surface?.materialId;
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
