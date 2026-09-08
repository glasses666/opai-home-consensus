import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(counts.rooms,9);assert.equal(counts.objects,12);
  assert.throws(()=>dispatchSceneCommand(store,{type:'object.setTransform',objectId:'object-coffee-table',transform:{x:20000}}));
});
