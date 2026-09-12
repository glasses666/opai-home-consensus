import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createExperienceStore, createExperienceScene } from '../server/experience-store.mjs';
import { createExperienceRoutes } from '../server/experience-routes.mjs';
import { readTurnResponse, readJsonResponse, fetchEntryWithRetry } from '../src/experience-client.js';
import { readableEntityName, changedEntities } from '../src/domain/entity-labels.js';
import { reviewFixture } from '../test-support/quality-review-fixture.mjs';

const streamResponse=frames=>new Response(new ReadableStream({start(controller){
  const bytes=new TextEncoder().encode(frames);for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));controller.close();
}}),{headers:{'content-type':'application/x-ndjson'}});

test('fragmented UTF-8 progress updates are real phases and only a complete result is returned',async()=>{
  const phases=[];const result=await readTurnResponse(streamResponse([
    {type:'progress',phase:'observing',elapsedMs:10},{type:'progress',phase:'reviewing',elapsedMs:20},
    {type:'result',data:{trace:{assistantReply:'只改实际家具'},commands:[{type:'objects.setTransforms'}]}}
  ].map(JSON.stringify).join('\n')+'\n'),{onProgress:event=>phases.push(event.phase)});
  assert.deepEqual(phases,['observing','reviewing']);assert.equal(result.trace.assistantReply,'只改实际家具');
});
test('truncated, trailing, oversized/invalid progress and explicit failure streams never return partial actions',async()=>{
  for(const [frames,code] of [
    [JSON.stringify({type:'progress',phase:'planning',elapsedMs:3})+'\n','TURN_STREAM_INTERRUPTED'],
    [JSON.stringify({type:'result',data:{commands:[]}})+'\n'+JSON.stringify({type:'result',data:{commands:[]}})+'\n','TURN_STREAM_TRAILING_FRAME'],
    [JSON.stringify({type:'progress',phase:'invented-percent',elapsedMs:1})+'\n','TURN_PROGRESS_INVALID'],
    ['{broken\n','TURN_STREAM_INVALID'],
    [JSON.stringify({type:'error',error:'DEEPSEEK_RESPONSE_TRUNCATED',trace:{mode:'failed'}})+'\n','DEEPSEEK_RESPONSE_TRUNCATED'],
  ])await assert.rejects(readTurnResponse(streamResponse(frames)),new RegExp(code));
});
test('cancelling a live stream cancels its reader and cannot apply an eventual late result',async()=>{
  const abort=new AbortController();let cancelled=false;
  const response=new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"type":"progress","phase":"planning","elapsedMs":0}\n'));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/x-ndjson'}});
  await assert.rejects(readTurnResponse(response,{signal:abort.signal,onProgress:()=>abort.abort(Error('CANCELLED'))}),/CANCELLED/);
  assert.equal(cancelled,true);
});
test('HTML gateway failures produce HTTP codes; entry retries reuse the same creation ID and stop',async()=>{
  await assert.rejects(readJsonResponse(new Response('<html>Bad Gateway</html>',{status:502})),/HTTP_502/);
  const bodies=[];const body=JSON.stringify({requestId:'same-id'});
  const result=await fetchEntryWithRetry('/api/experience/projects',{method:'POST',body},
    {delay:async()=>{},fetchImpl:async(_p,options)=>{bodies.push(options.body);return bodies.length<3?new Response('<html/>',{status:502}):Response.json({projectId:'fixture'});}});
  assert.equal(result.projectId,'fixture');assert.deepEqual(bodies,[body,body,body]);
  let attempts=0;await assert.rejects(fetchEntryWithRetry('/new',{}, {delay:async()=>{},fetchImpl:async()=>{attempts++;return Response.json({error:'NOT_FOUND'},{status:404});}}),/NOT_FOUND/);
  assert.equal(attempts,3);
});
test('requested project 404 or revoked access is never retried as a newly created project',async()=>{
  for(const status of [403,404]){let attempts=0;
    await assert.rejects(fetchEntryWithRetry('/api/experience/projects/exp-old',{headers:{authorization:'Bearer isolated-fixture'}},
      {requestedProject:true,delay:async()=>{},fetchImpl:async path=>{attempts++;assert.match(path,/exp-old/);return Response.json({error:status===403?'PROJECT_ACCESS_DENIED':'PROJECT_NOT_FOUND'},{status});}}));
    assert.equal(attempts,1);
  }
});
test('bootstrap abort interrupts retry backoff without another creation',async()=>{
  const a=new AbortController();let attempts=0;
  await assert.rejects(fetchEntryWithRetry('/new',{signal:a.signal},{fetchImpl:async()=>{attempts++;a.abort(Error('CANCELLED'));throw Error('HTTP_502');}}),/HTTP_502|CANCELLED/);
  assert.equal(attempts,1);
});
test('version labels identify real furniture and surfaces without internal IDs',()=>{
  const scene=createExperienceScene();
  for(const id of ['object-flex-desk','surface-wall-reference-10','object-child-wardrobe','object-dining-chair-n']){
    const label=readableEntityName(scene,id);assert.equal(label.includes(id),false);assert.match(label,/[\u3400-\u9fff]/u);
  }
  const next=JSON.parse(JSON.stringify(scene));next.objects[0].transform.x+=1;
  assert.deepEqual(changedEntities(scene,next).map(o=>o.id),[scene.objects[0].id]);
});
test('optional living context is skippable, does not fabricate requirements, and does not gate chat on budget/style',()=>{
  const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const page=source.slice(source.indexOf('function ProjectSetupPage()'),source.indexOf('function DetailedProjectSetupPage()'));
  assert.match(page,/跳过/);assert.match(page,/进入 AI 设计|进入AI设计/);assert.doesNotMatch(page,/budgetOptions|styleOptions|canContinue/);
  assert.match(page,/sessionStorage/);assert.doesNotMatch(page,/hardConstraints|fetch\(/);
});
async function runtime(t,provider){
  const dir=mkdtempSync(join(tmpdir(),'opai-stream-test-'));
  const store=createExperienceStore({directory:dir}),handler=createExperienceRoutes({store,provider});
  const server=createServer(async(req,res)=>{if(!await handler(req,res)){res.writeHead(404);res.end();}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();rmSync(dir,{recursive:true,force:true});});
  return {store,directory:dir,url:`http://127.0.0.1:${server.address().port}`};
}
test('real HTTP product route streams observed phases, preserves JSON compatibility, and does not touch family service',async t=>{
  const rt=await runtime(t,async({purpose,reviewData})=>purpose.startsWith('review_')?reviewFixture(reviewData):{
    action:'clarify',question:'平时一个人用，还是常常两个人一起？',providerTrace:{provider:'mock',model:'offline-fixture'}});
  assert.equal((await(await fetch(rt.url+'/api/experience/health')).json()).contract,'harness-review/1');
  const p=rt.store.create(),path=rt.url+`/api/experience/projects/${p.projectId}`;
  const headers={'content-type':'application/json',authorization:`Bearer ${p.accessToken}`,accept:'application/x-ndjson'};
  const phases=[];const r=await readTurnResponse(await fetch(path+'/turn',{method:'POST',headers,
    body:JSON.stringify({input:'厨房显得拥挤',requestId:'stream',expectedRevision:0})}),{onProgress:e=>phases.push(e.phase)});
  assert.equal(r.trace.mode,'clarify');assert.equal(r.revision,1);
  assert.equal(r.conversationDelta.length,2);assert.equal('conversation' in r,false);
  for(const phase of ['preparing','observing','planning','reviewing'])assert.ok(phases.includes(phase));
  const receipt=await(await fetch(path+'/turn',{method:'POST',headers:{...headers,accept:'application/json'},body:JSON.stringify({input:'厨房显得拥挤',requestId:'stream',expectedRevision:0})})).json();
  assert.equal(receipt.replayed,true);assert.equal(receipt.revision,1);
  assert.equal(rt.store.read(p.projectId,p.accessToken).conversation.length,2);
});
test('transport failure journal preserves first attempts privately, survives restart, and is not a design version',async t=>{
  const rt=await runtime(t,async()=>{throw Object.assign(Error('DEEPSEEK_TEST_FAILURE'),{providerTrace:{provider:'mock',model:null,usage:null}});});
  const p=rt.store.create(),path=rt.url+`/api/experience/projects/${p.projectId}`;
  for(const id of ['failed-first','failed-retry']){
    await assert.rejects(readTurnResponse(await fetch(path+'/turn',{method:'POST',headers:{'content-type':'application/json',accept:'application/x-ndjson',authorization:`Bearer ${p.accessToken}`},
      body:JSON.stringify({input:'我想试个不同摆法',requestId:id,expectedRevision:0})})),/DEEPSEEK_TEST_FAILURE/);
  }
  const attempts=await(await fetch(path+'/failed-attempts',{headers:{authorization:`Bearer ${p.accessToken}`}})).json();
  assert.deepEqual(attempts.attempts.map(a=>a.requestId),['failed-first','failed-retry']);
  assert.equal(attempts.attempts[0].trace.modelRequests.length,1);
  assert.equal(rt.store.read(p.projectId,p.accessToken).revision,0);
  assert.equal(createExperienceStore({directory:rt.directory}).failedAttempts(p.projectId,p.accessToken).length,2);
  assert.equal((await fetch(path+'/failed-attempts')).status,403);
});

test('temporarily refused renderer snapshot is retried; exhausted sync is visible and cleanup stops stale retries',async()=>{
  const {synchronizeSnapshot}=await import('../src/pascal/snapshot-sync.js');
  const queue=[],states=[];let attempts=0;
  synchronizeSnapshot(()=>{if(++attempts<3)throw Error('pointer interaction');},{onState:s=>states.push(s.status),schedule:f=>{queue.push(f);return f;},cancel:()=>{}});
  while(queue.length)queue.shift()();
  assert.deepEqual(states,['pending','pending','synced']);
  const failed=[];synchronizeSnapshot(()=>{throw Error('refused');},{maxAttempts:1,onState:s=>failed.push(s.status)});
  assert.deepEqual(failed,['failed']);
  let stale=0;const stop=synchronizeSnapshot(()=>{stale++;throw Error('refused');},{schedule:f=>{queue.push(f);return f;},cancel:()=>{}});
  stop();queue.shift()();assert.equal(stale,1);
});
test('QA probe reads actual matrix and material, not canonical values masquerading as renderer evidence',async()=>{
  const {readRenderedScene}=await import('../src/pascal/qa-scene-probe.js');
  const scene=createExperienceScene(),o=scene.objects[0],actual=[1,0,0,0,0,1,0,0,0,0,1,0,99,88,77,1];
  const root={matrixWorld:{elements:actual},userData:{itemModelSettled:true},traverse:f=>f({isMesh:true,matrixWorld:{elements:actual},visible:true,geometry:{attributes:{position:{count:24}}},material:{color:{getHexString:()=> '123456'}}})};
  const snapshot=readRenderedScene(scene,{canonicalToPascal:{object:{[o.id]:'rendered-id'}}},{nodes:new Map([['rendered-id',root]])});
  assert.deepEqual(snapshot.objects[0].actualWorldPositionM,[99,88,77]);
  assert.notDeepEqual(snapshot.objects[0].expectedCanonicalPositionM,[99,88,77]);
  assert.equal(snapshot.objects[0].meshes[0].materials[0].color,'123456');
  assert.equal(snapshot.objects[1].rendered,false);
});

test('a shared wall face uses its actually changed room name and does not navigate to its unchanged host room',async()=>{
  const {wallFaceRooms}=await import('../src/domain/wall-finishes.js');
  const {affectedRoomIds}=await import('../src/domain/entity-labels.js');
  const scene=createExperienceScene(),wall=scene.surfaces.find(s=>s.kind==='wall'&&Object.values(wallFaceRooms(scene,s)).some(id=>id&&id!==s.roomId));
  const roomId=Object.values(wallFaceRooms(scene,wall)).find(id=>id&&id!==wall.roomId),next=JSON.parse(JSON.stringify(scene));
  next.surfaces.find(s=>s.id===wall.id).roomMaterialIds={...wall.roomMaterialIds,[roomId]:'mat-wall-oak-panel'};
  assert.deepEqual(affectedRoomIds(scene,next),[roomId]);
  assert.ok(readableEntityName(next,wall.id,roomId).startsWith(scene.rooms.find(r=>r.id===roomId).name));
});
