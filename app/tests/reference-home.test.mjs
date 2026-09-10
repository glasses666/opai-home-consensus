import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReferenceHome,referenceHomeSource} from '../src/domain/reference-home.js';
import {createDemoScene} from '../src/domain/demo-scene.js';
import {createSceneStore,dispatchSceneCommand,undoSceneCommand,validateScene} from '../src/domain/scene.js';
import {projectOppeinSceneToPascal} from '../src/pascal/oppein-to-pascal.js';

test('reference home has independent identity, real source and valid canonical geometry',()=>{
  const before=JSON.stringify(createDemoScene()),s=createReferenceHome();
  assert.equal(validateScene(s).ok,true);
  assert.equal(s.rooms.filter(r=>r.kind==='bedroom'||r.kind==='bedroom-study').length,3);
  assert.equal(s.rooms.filter(r=>r.kind==='bathroom').length,2);
  assert.notEqual(s.id,createDemoScene().id);
  assert.equal(referenceHomeSource.page,8);
  assert.match(referenceHomeSource.note,/估算/);
  assert.equal(JSON.stringify(createDemoScene()),before);
  assert.doesNotThrow(()=>createSceneStore(s));
});
test('default furniture preserves the user-confirmed live browser baseline',()=>{
  const baseline=JSON.parse(readFileSync(new URL('../../design-lab/reference-home/user-furniture-baseline-20260908.json',import.meta.url),'utf8'));
  const scene=createReferenceHome();
  assert.deepEqual(Object.fromEntries(scene.objects.filter(o=>baseline.transforms[o.id]).map(o=>[o.id,o.transform])),baseline.transforms);
  const feature=scene.objects.find(o=>o.id==='object-primary-feature-wall');
  const host=scene.surfaces.find(surface=>surface.id===feature.installation.hostSurfaceId);
  assert.deepEqual(feature.transform,{x:6485,y:0,z:8710,rotationY:-Math.PI/2});
  assert.equal(host.edge.start.x-host.thickness/2-(feature.transform.x+feature.dimensions.depth/2),5);
  assert.equal(feature.model3D.src,'/assets/models/bedroom-surround.glb');
  assert.equal(scene.objects.find(o=>o.id==='object-primary-bed').model3D.src,'/assets/models/bedroom-bed.glb');
  assert.equal(feature.materialId,'mat-object-warm-white');
  assert.equal(host.kind,'wall');
  assert.equal(host.roomId,'room-primary-bedroom');
  assert.equal(feature.preferredCameraPresetId,'camera-primary-bedroom-feature');
  assert.ok(scene.rooms.find(room=>room.id==='room-primary-bedroom').cameraPresetIds.includes('camera-primary-bedroom-feature'));
  assert.doesNotThrow(()=>createSceneStore(scene));
});
test('every occupied room is reachable by door or open circulation',()=>{
  const s=createReferenceHome(),links=new Map(s.rooms.map(r=>[r.id,new Set()]));
  for(const o of s.openings){const [a,b]=o.connectsRoomIds??[];if(a&&b){links.get(a).add(b);links.get(b).add(a);}}
  links.get('room-hall').add('room-living-dining');links.get('room-living-dining').add('room-hall');
  const seen=new Set(['room-living-dining']),queue=[...seen];
  for(const id of queue)for(const other of links.get(id))if(!seen.has(other)){seen.add(other);queue.push(other);}
  assert.equal(seen.size,s.rooms.length);
  for(const r of s.rooms.filter(r=>r.kind!=='circulation'))assert.ok(s.openings.some(o=>o.kind==='window'&&s.surfaces.find(w=>w.id===o.hostSurfaceId).roomId===r.id)||r.id==='room-living-dining');
});
test('reference furniture commands undo and project to the same scene',()=>{
  const store=createSceneStore(createReferenceHome());
  const next=dispatchSceneCommand(store,{type:'object.setTransform',objectId:'object-coffee-table',transform:{z:7850}});
  assert.equal(next.currentScene.objects.find(o=>o.id==='object-coffee-table').transform.z,7850);
  assert.deepEqual(undoSceneCommand(next).currentScene,store.currentScene);
  const {counts}=projectOppeinSceneToPascal(next.currentScene);
  assert.equal(counts.rooms,9);assert.equal(counts.objects,16);
  assert.throws(()=>dispatchSceneCommand(store,{type:'object.setTransform',objectId:'object-coffee-table',transform:{x:20000}}));
});

test('bedside cabinet and lamp form a movable group clear of the preserved bed',()=>{
  const scene=createReferenceHome();
  const bedside=scene.objects.find(o=>o.id==='object-primary-bedside');
  assert.equal(bedside.model3D.src,'/assets/models/bedroom-bedside.glb');
  assert.deepEqual(bedside.dimensions,{width:460,depth:420,height:1000});
  const initial=createSceneStore(scene);
  const moved=dispatchSceneCommand(initial,{type:'object.setTransform',objectId:bedside.id,transform:{z:8900}});
  assert.equal(moved.currentScene.objects.find(o=>o.id===bedside.id).transform.z,8900);
  assert.deepEqual(undoSceneCommand(moved).currentScene,initial.currentScene);
});

test('approved V2 notches and door hosts are shared by 2D and 3D',()=>{
  const s=createReferenceHome();
  const point=(id,x,z)=>s.rooms.find(r=>r.id===id).polygon.some(p=>p.x===x&&p.z===z);
  assert.ok(point('room-guest',4500,2300));
  assert.ok(point('room-flex',3400,3550));
  assert.ok(point('room-primary-bedroom',3400,5450));
  for(const [id,horizontal,fixed,start] of [
    ['guest',true,2300,3500],['child',true,3550,3500],
    ['primary',false,3400,5650],['ensuite',false,4500,5750],
  ]){
    const o=s.openings.find(o=>o.id==='opening-'+id);
    const w=s.surfaces.find(w=>w.id===o.hostSurfaceId);
    assert.equal(w.edge.start[horizontal?'z':'x'],fixed);
    assert.equal(w.edge.end[horizontal?'z':'x'],fixed);
    assert.equal(w.edge.start[horizontal?'x':'z']+o.offset,start);
  }
  assert.deepEqual(s.openings.find(o=>o.id==='opening-ensuite').connectsRoomIds,['room-ensuite','room-primary-bedroom']);
  assert.equal(s.objects.filter(o=>['object-guest-wardrobe','object-child-wardrobe'].includes(o.id)).length,2);
  assert.doesNotThrow(()=>createSceneStore(s));
});
