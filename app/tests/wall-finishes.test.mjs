import test from 'node:test';
import assert from 'node:assert/strict';
import {createReferenceHome} from '../src/domain/reference-home.js';
import {surfaceBelongsToRoom,surfaceMaterialForRoom,surfaceRoomIds,wallFaceRooms,wallFinishSlots,wallFaceSemantics} from '../src/domain/wall-finishes.js';
import {createSceneStore,dispatchSceneCommand,undoSceneCommand,serializeScene} from '../src/domain/scene.js';
import {createVersionHistory,saveSceneVersion,compareSceneVersions} from '../src/domain/design-version.js';
import {validatedWorkingStore} from '../server/experience-store.mjs';

test('all seven bedroom boundary faces coordinate without painting neighbouring rooms',()=>{
  const scene=createReferenceHome(),walls=scene.surfaces.filter(w=>w.roomMaterialIds);
  assert.equal(walls.length,7);
  for(const wall of walls){
    const sides=wallFaceRooms(scene,wall),slots=wallFinishSlots(scene,wall);
    assert.equal(wall.roomMaterialIds['room-primary-bedroom'],'mat-wall-bedroom-ivory');
    if(sides.front&&sides.back){
      assert.equal(slots[sides.front==='room-primary-bedroom'?'interior':'exterior'],'mat-wall-bedroom-ivory');
      assert.equal(slots[sides.front==='room-primary-bedroom'?'exterior':'interior'],'mat-wall-warm-white');
    }else{
      assert.equal(slots.interior,'mat-wall-bedroom-ivory');
      assert.equal(slots.exterior,'mat-wall-warm-white');
      assert.equal(wallFaceSemantics(scene,wall)[sides.front?'frontSide':'backSide'],'interior');
    }
  }
});
test('room membership includes every visible side of shared bedroom walls',()=>{
  const scene=createReferenceHome();
  const bedroomWalls=scene.surfaces.filter(surface=>surface.kind==='wall'&&surfaceBelongsToRoom(scene,surface,'room-primary-bedroom'));
  assert.equal(bedroomWalls.length,7);
  assert.equal(bedroomWalls.some(surface=>surface.roomId!=='room-primary-bedroom'),true);
  for(const wall of bedroomWalls){
    assert.equal(surfaceRoomIds(scene,wall).includes('room-primary-bedroom'),true);
    assert.equal(surfaceMaterialForRoom(scene,wall,'room-primary-bedroom'),'mat-wall-bedroom-ivory');
  }
});
test('room-side finish edits validate, show in version differences, replay and undo',()=>{
  const initial=createSceneStore(createReferenceHome()),history=createVersionHistory(initial);
  const changed=dispatchSceneCommand(initial,{type:'surface.setMaterial',surfaceId:'surface-wall-reference-11',roomId:'room-primary-bedroom',materialId:'mat-wall-greige'});
  const next=saveSceneVersion(history,changed);
  assert.equal(compareSceneVersions(history.versions[0],next.versions[1]).surfaceDiffs[0].roomId,'room-primary-bedroom');
  assert.deepEqual(validatedWorkingStore(serializeScene(changed.currentScene),history,{}).currentScene,changed.currentScene);
  assert.deepEqual(undoSceneCommand(changed).currentScene,initial.currentScene);
  assert.throws(()=>dispatchSceneCommand(initial,{type:'surface.setMaterial',surfaceId:'surface-wall-reference-11',roomId:'room-kitchen',materialId:'mat-wall-greige'}),/WALL_ROOM_FINISH_INVALID/);
  assert.throws(()=>dispatchSceneCommand(initial,{type:'surface.setMaterial',surfaceId:'surface-wall-reference-11',roomId:'room-primary-bedroom',materialId:'mat-floor-light-oak'}),/SURFACE_MATERIAL_INCOMPATIBLE/);
  const ownerEdit=dispatchSceneCommand(initial,{type:'surface.setMaterial',surfaceId:'surface-wall-reference-18',materialId:'mat-wall-greige'});
  const ownerHistory=saveSceneVersion(history,ownerEdit);
  assert.equal(compareSceneVersions(history.versions[0],ownerHistory.versions[1]).surfaceDiffs.length,1);
});
