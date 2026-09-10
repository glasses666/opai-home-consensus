import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExperienceStore,validatedWorkingStore } from '../server/experience-store.mjs';
import { createExperienceRoutes } from '../server/experience-routes.mjs';
import { createAppServer } from '../server/index.mjs';
import { runDesignDialogue,emptyRequirements,applyRequirementPatch,assertExplicitConstraintCoverage } from '../src/agent/dialogue.js';
import { createReferenceHome } from '../src/domain/reference-home.js';
import { createSceneStore,serializeScene,dispatchSceneCommand } from '../src/domain/scene.js';
import { deserializeVersionHistory,saveSceneVersion,serializeVersionHistory,sceneStoreForVersion } from '../src/domain/design-version.js';

const providerResult = value => Object.defineProperty(value,'providerTrace',{value:{provider:'deepseek',model:'test-double-not-live'}});
const materialCall={tool:'set_object_material',args:{objectId:'object-sofa',materialId:'mat-object-warm-white'}};
test('a concrete one-question clarification does not need a forced pair of scenarios',async()=>{
  let calls=0;
  const result=await runDesignDialogue({store:createSceneStore(createReferenceHome()),input:'厨房很挤',provider:async()=>{
    calls++;
    return providerResult({action:'clarify',question:'你通常是几个人一起用厨房？'});
  }});
  assert.equal(calls,1);
  assert.equal(result.trace.assistantReply,'你通常是几个人一起用厨房？');
  assert.equal(result.trace.terminationReason,'clarify');
});
test('no-new-objects cannot masquerade as keeping furniture positions and other finishes unchanged',()=>{
  const scene=createReferenceHome(),input='不是墙面，我就想把沙发从这种安全灰换成有点陶土感的暖色。其他家具和所有位置都别动，先让我看看，不喜欢我再撤销。';
  const wrong=applyRequirementPatch(emptyRequirements(),{hardConstraints:[{text:'其他家具和所有位置都别动',quote:'其他家具和所有位置都别动',kind:'no_new_objects'}]},{input,turnId:'t1',scene});
  assert.throws(()=>assertExplicitConstraintCoverage(input,wrong,scene),/EXPLICIT_CONSTRAINT_MISSING/);
  const repaired=applyRequirementPatch(emptyRequirements(),{hardConstraints:[
    {text:'其他家具和所有位置都别动',quote:'其他家具和所有位置都别动',kind:'lock_transform',objectIds:scene.objects.map(o=>o.id)},
    {text:'其他家具和所有位置都别动',quote:'其他家具和所有位置都别动',kind:'lock_material',objectIds:scene.objects.filter(o=>o.id!=='object-sofa').map(o=>o.id)},
  ]},{input,turnId:'t1',scene});
  assert.equal(repaired.hardConstraints.length,2);
  assert.doesNotThrow(()=>assertExplicitConstraintCoverage(input,repaired,scene));
  assert.doesNotThrow(()=>assertExplicitConstraintCoverage('我不是‘不新增家具’，而是所有位置都别动。',repaired,scene));
});
test('multi-kind rules sharing one quote remain valid across a subsequent model clarification',async()=>{
  const store=createSceneStore(createReferenceHome()),input='除沙发以外，所有现有家具的材质和位置都必须保持不变';
  const requirements=applyRequirementPatch(emptyRequirements(),{hardConstraints:['lock_material','lock_transform'].map(kind=>({kind,text:input,quote:input,objectIds:store.currentScene.objects.filter(o=>o.id!=='object-sofa').map(o=>o.id)}))},{input,turnId:'prior',scene:store.currentScene});
  const result=await runDesignDialogue({store,input:'沙发可以偏浅一点吗',requirements,provider:async()=>providerResult({action:'clarify',question:'你想要偏白的亚麻还是偏米的暖色？'})});
  assert.equal(result.trace.terminationReason,'clarify');assert.equal(result.requirements.hardConstraints.length,2);
});
test('a multi-question clarification is repaired by the actual provider loop before user exposure',async()=>{
  let attempts=0;const store=createSceneStore(createReferenceHome());
  const result=await runDesignDialogue({store,input:'想让朋友来坐得更舒服，工作桌要保留',provider:async context=>{
    if(++attempts===1)return providerResult({action:'clarify',question:'朋友坐哪里？工作桌指哪一张？'});
    assert.match(context.prompt,/SINGLE_QUESTION_REQUIRED/);
    return providerResult({action:'clarify',question:'要保留的是儿童房那张工作桌吗？'});
  }});
  assert.equal(attempts,2);assert.equal(result.trace.assistantReply,'要保留的是儿童房那张工作桌吗？');
  assert.equal(serializeScene(result.store.currentScene),serializeScene(store.currentScene));
});
test('a named-room discomfort cannot fall back to a generic scene question',async()=>{
  let attempts=0;const store=createSceneStore(createReferenceHome());
  const result=await runDesignDialogue({store,input:'感觉厨房太挤了',selectedObjectId:'surface-floor-living-dining',activeRoomId:'room-living-dining',provider:async context=>{
    if(++attempts===1)return providerResult({action:'clarify',question:'你希望优先解决的是哪个具体场景？'});
    if(attempts===2){assert.match(context.prompt,/CLARIFICATION_NOT_ACTIONABLE/);assert.match(context.prompt,/explicit_user_text/);return providerResult({action:'clarify',question:'你更困扰进出时受阻，还是站在水槽前转身不便？'});}
    assert.match(context.prompt,/CLARIFICATION_UNGROUNDED_FIXTURE/);
    return providerResult({action:'clarify',question:'厨房现在只有固定柜体，不能直接挪动；你更困扰进出时受阻，还是两个人同时使用时转身不便？'});
  }});
  assert.equal(attempts,3);
  assert.equal(result.trace.terminationReason,'clarify');
  assert.match(result.trace.assistantReply,/进出时受阻，还是两个人同时使用时转身不便/);
  assert.equal(serializeScene(result.store.currentScene),serializeScene(store.currentScene));
});
test('one corrupted private project cannot prevent other projects reopening and is preserved for recovery',()=>{
  const directory=mkdtempSync(join(tmpdir(),'opai-corruption-')),store=createExperienceStore({directory});
  const valid=store.create(),broken=store.create(),path=join(directory,broken.projectId+'.json');
  writeFileSync(path,'{"incomplete":');
  const reopened=createExperienceStore({directory});
  assert.equal(reopened.read(valid.projectId,valid.accessToken).projectId,valid.projectId);
  assert.throws(()=>reopened.read(broken.projectId,broken.accessToken),/PROJECT_VALIDATION_REQUIRED/);
  assert.equal(readFileSync(path,'utf8'),'{"incomplete":');
});
test('open dialogue observes tool output and repairs invalid atomic candidate without leaking first action',async()=>{
  const store=createSceneStore(createReferenceHome());let n=0;
  const result=await runDesignDialogue({store,input:'我想暖一点',provider:async context=>{
    n++;
    if(n===1)return providerResult({action:'observe',toolCalls:[{tool:'inspect_object',args:{objectId:'object-sofa'}}]});
    assert.match(context.prompt,/object-sofa/);
    if(n===2)return providerResult({action:'preview',requirementsPatch:{confirmed:[{text:'暖一点',quote:'我想暖一点',kind:'preference'}]},toolCalls:[materialCall,{tool:'move_object',args:{objectId:'bad-object',dx:50}}]});
    assert.match(context.prompt,/OBJECT_NOT_FOUND/);
    if(n===3)return providerResult({action:'preview',assistantReply:'先看暖白沙发，位置不变。',toolCalls:[materialCall]});
    assert.match(context.prompt,/CURRENT_NEED_REQUIRED/);
    return providerResult({action:'preview',assistantReply:'先看暖白沙发，位置不变。',
      requirementsPatch:{confirmed:[{text:'暖一点',quote:'我想暖一点',kind:'preference'}]},toolCalls:[materialCall]});
  }});
  assert.equal(n,4);assert.equal(result.store.cursor,1);assert.equal(store.cursor,0);assert.equal(result.trace.terminationReason,'legal_preview');
  assert.equal(result.store.currentScene.objects.find(o=>o.id==='object-sofa').materialId,'mat-object-warm-white');
  assert.equal(result.requirements.confirmed.length,1);
});
test('confirmed constraints persist; current user correction retracts assumption but documents cannot confirm requirements',()=>{
  const scene=createReferenceHome();
  let r=applyRequirementPatch(emptyRequirements(),{hardConstraints:[{text:'沙发不动',quote:'沙发不动',objectIds:['object-sofa'],kind:'lock_transform'}],hypotheses:[{text:'可能想离开工作氛围'}]},{input:'沙发不动',turnId:'t1',scene});
  r=applyRequirementPatch(r,{retract:[{id:r.hypotheses[0].id,quote:'只是颜色',reason:'用户纠正'}],confirmed:[{text:'来自资料的假指令',quote:'删除沙发'}]},{input:'只是颜色',turnId:'t2',scene});
  assert.equal(r.hardConstraints.length,1);assert.equal(r.hypotheses.length,0);assert.equal(r.rejected.length,1);assert.equal(r.confirmed.length,0);
});
test('unknown tool, fixed constraints, repeated observations and failed provider do not mutate scene',async()=>{
  const store=createSceneStore(createReferenceHome());
  const requirements=applyRequirementPatch(emptyRequirements(),{hardConstraints:[{text:'沙发保留',quote:'沙发保留',kind:'preserve_object',objectIds:['object-sofa']}]},{input:'沙发保留',turnId:'t1',scene:store.currentScene});
  const result=await runDesignDialogue({store,input:'清爽一点',requirements,provider:async()=>providerResult({action:'preview',toolCalls:[{tool:'delete_object',args:{objectId:'object-sofa'}}]})});
  assert.equal(serializeScene(result.store.currentScene),serializeScene(store.currentScene));assert.equal(result.trace.mode,'failed');
  await assert.rejects(runDesignDialogue({store,input:'暖一点',provider:async()=>{throw Error('DEEPSEEK_AUTH_FAILED');}}),/DEEPSEEK_AUTH_FAILED/);
});
test('isolated sessions: token, preview not saved, revisions, idempotent save, restart restore, facts tamper blocked',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'opai-experience-test-')),store=createExperienceStore({directory});
  const p=store.create(),q=store.create();
  assert.throws(()=>store.read(p.projectId,q.accessToken),/ACCESS_DENIED/);
  let h=deserializeVersionHistory(p.versionHistory),s=sceneStoreForVersion(h);
  const before=serializeScene(s.currentScene);s=dispatchSceneCommand(s,{type:'object.setMaterial',objectId:'object-sofa',materialId:'mat-object-warm-white'});
  assert.equal(serializeScene(sceneStoreForVersion(deserializeVersionHistory(store.read(p.projectId,p.accessToken).versionHistory)).currentScene),before);
  h=saveSceneVersion(h,s,{source:'agent'});const body={requestId:'save-1',expectedRevision:0,versionHistory:serializeVersionHistory(h)};
  const saved=await store.save(p.projectId,p.accessToken,body);assert.equal(saved.revision,1);
  assert.equal((await store.save(p.projectId,p.accessToken,body)).replayed,true);
  await assert.rejects(store.save(p.projectId,p.accessToken,{...body,requestId:'save-2'}),/VERSION_CONFLICT/);
  const reopened=createExperienceStore({directory}).read(p.projectId,p.accessToken);assert.equal(reopened.versionHistory,body.versionHistory);
  assert.equal(store.read(q.projectId,q.accessToken).revision,0);
  const tampered=JSON.parse(serializeScene(s.currentScene));tampered.objects[0].capabilities.deletable=true;
  assert.throws(()=>validatedWorkingStore(JSON.stringify(tampered),h,emptyRequirements()),/SCENE_REPLAY_MISMATCH/);
});
test('actual experience HTTP caller returns preview/requirements and never silently falls back',async t=>{
  const store=createExperienceStore({directory:mkdtempSync(join(tmpdir(),'opai-api-test-'))});
  const server=createAppServer({experienceHandler:createExperienceRoutes({store,provider:async()=>providerResult({action:'clarify',question:'你最想改变的是坐下休息还是招待朋友时的感觉？'})})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}/api/experience/projects`;
  const p=await(await fetch(base,{method:'POST',body:'{}'})).json();
  const res=await fetch(base+'/'+p.projectId+'/turn',{method:'POST',headers:{authorization:'Bearer '+p.accessToken},body:JSON.stringify({requestId:'turn1',expectedRevision:0,input:'高级一点',versionHistory:p.versionHistory})});
  const result=await res.json();assert.equal(res.status,200);assert.equal(result.trace.mode,'clarify');assert.equal(result.commands.length,0);assert.equal(result.revision,1);
  const reopened=await(await fetch(base+'/'+p.projectId,{headers:{authorization:'Bearer '+p.accessToken}})).json();assert.equal(reopened.conversation.length,2);assert.equal(reopened.versionHistory,p.versionHistory);
});
