import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExperienceScene, createExperienceStore, validatedWorkingStore } from '../server/experience-store.mjs';
import { createSceneStore, dispatchSceneCommand, serializeScene, undoSceneCommand, redoSceneCommand } from '../src/domain/scene.js';
import { createVersionHistory, saveSceneVersion, serializeVersionHistory, deserializeVersionHistory, sceneStoreForVersion } from '../src/domain/design-version.js';
import { polygonInsidePolygon } from '../src/domain/geometry.js';
import { assertRequirementConstraints, effectivePermissions } from '../src/agent/requirement-constraints.js';
import { exploreLayout, applyLayoutOption, observeRoomLayout, candidateFacts, assertNoNewOpeningObstruction } from '../src/agent/spatial-observation.js';
import { runDesignDialogue, emptyRequirements, applyRequirementPatch } from '../src/agent/dialogue.js';
import { qualityReviewData, validateQualityVerdict } from '../src/agent/design-quality.js';
import { approveReview, reviewFixture } from '../test-support/quality-review-fixture.mjs';
import { retractUnretainedPreview } from '../src/workbench-session.js';
import { callDesignDeepSeek } from '../server/deepseek.mjs';

const clone=v=>JSON.parse(JSON.stringify(v));
const desk='object-flex-desk',bed='object-flex-bed';
const requirement=kind=>({hardConstraints:[{id:'desk-rule',kind,objectIds:[desk]}]});
const scene=createExperienceScene(), base=createSceneStore(scene);
const registry=new Map();
const explored=exploreLayout(base,{roomId:'room-flex',objectIds:[desk,bed]},{layoutOptions:registry,requirements:requirement('preserve_object')});
const option=explored.options.find(o=>o.items.some(i=>i.objectId===desk));
assert.ok(option,'The real canonical room must have a legal desk rearrangement');
const moved=applyLayoutOption(base,option.id,{layoutOptions:registry}).store;
const parseContext=prompt=>{const marker='数据：\n',index=prompt.indexOf(marker);assert.ok(index>=0);return JSON.parse(prompt.slice(index+marker.length));};
const mockTrace={provider:'mock',model:'deterministic-not-live',parameters:{thinking:'not_applicable'}};
const model=value=>({...value,providerTrace:mockTrace});
const need=(input,ids=[desk])=>({confirmed:[{text:input,quote:input,kind:'preference',objectIds:ids}]});

for(const [phrase,kind] of [['书桌要留','preserve_object'],['书桌留在原位','lock_transform'],['书桌什么都别动','lock_object']]){
  test(`structured semantics ${phrase}: ${kind}`,()=>{
    const r=applyRequirementPatch(emptyRequirements(),{hardConstraints:[{text:phrase,quote:phrase,kind,objectIds:[desk]}]},
      {input:phrase,turnId:'semantics',scene});
    assert.equal(r.hardConstraints[0].kind,kind);
    const changed=clone(scene);changed.objects.find(o=>o.id===desk).materialId='mat-object-warm-white';
    if(kind==='lock_object')assert.throws(()=>assertRequirementConstraints(scene,changed,r),/REQUIREMENT_CONSTRAINT/);
    else assert.doesNotThrow(()=>assertRequirementConstraints(scene,changed,r));
    if(kind==='preserve_object')assert.doesNotThrow(()=>assertRequirementConstraints(base.currentScene,moved.currentScene,r));
    else assert.throws(()=>assertRequirementConstraints(base.currentScene,moved.currentScene,r),/REQUIREMENT_CONSTRAINT/);
    const removed=clone(scene);removed.objects=removed.objects.filter(o=>o.id!==desk);
    assert.throws(()=>assertRequirementConstraints(scene,removed,r),/preserve/);
    const permissions=effectivePermissions(scene,r,desk);
    assert.equal(permissions.canMove,kind==='preserve_object');
    assert.equal(permissions.canChangeMaterial,kind!=='lock_object');
  });
}

test('full lock rejects rotation, size, model replacement and metadata; retain alone does not freeze them',()=>{
  for(const mutate of [o=>o.transform.rotationY+=.01,o=>o.dimensions.width+=1,o=>o.model3D.src='other.glb',o=>o.name='different']){
    const next=clone(scene);mutate(next.objects.find(o=>o.id===desk));
    assert.throws(()=>assertRequirementConstraints(scene,next,requirement('lock_object')),/REQUIREMENT_CONSTRAINT/);
    assert.doesNotThrow(()=>assertRequirementConstraints(scene,next,requirement('preserve_object')));
  }
});
test('hard constraints never silently expire, and unknown target IDs fail instead of disappearing',()=>{
  const old={...emptyRequirements(),hardConstraints:Array.from({length:80},(_,i)=>({id:`r${i}`,text:`保留 ${i}`,kind:'preserve_object',objectIds:[desk]}))};
  const next=applyRequirementPatch(old,{}, {input:'再看看',turnId:'next',scene});
  assert.equal(next.hardConstraints.length,80);
  assert.throws(()=>applyRequirementPatch(emptyRequirements(),{hardConstraints:[{text:'保留',quote:'保留',kind:'preserve_object',objectIds:['invented']}]},{input:'保留',turnId:'bad',scene}),/REQUIREMENT_SCOPE_UNKNOWN/);
});
test('layout observations expose actual openings, entry proxies and permissions, never the nonexistent repro chair',()=>{
  const room=observeRoomLayout(scene,'room-flex',requirement('preserve_object'));
  assert.ok(room.openings.some(o=>o.kind==='interior-door'));
  assert.ok(room.openings.some(o=>o.kind==='window'));
  assert.ok(room.objects.find(o=>o.id===desk).entryViews.length);
  assert.equal(room.objects.some(o=>o.id==='object-flex-chair'),false);
  assert.equal(room.objects.find(o=>o.id===desk).permissions.canMove,true);
  assert.ok(room.relations.every(r=>r.measurement.includes('not_walkway')));
});
test('search returns diverse legal observed options without mutating canonical scene or inventing furniture',()=>{
  assert.ok(explored.options.length>0);
  assert.equal(explored.search.exhaustive,false);
  assert.equal(base.cursor,0);
  assert.ok(explored.options.every(choice=>choice.qualitySignals?.movements?.length));
  assert.ok(explored.options[0].qualitySignals.worstGapDeltaMm>=0,
    'the first candidate should not make an existing furniture gap worse when such a candidate exists');
  assert.ok(explored.options.slice(1).some(choice=>choice.qualitySignals.maxDisplacementRelativeToSize>1),
    'the bounded result must still expose a visibly different alternative instead of only tiny moves');
  for(const choice of explored.options){
    const next=applyLayoutOption(base,choice.id,{layoutOptions:registry,requirements:requirement('preserve_object')}).store;
    assert.deepEqual(next.currentScene.objects.map(o=>o.id),base.currentScene.objects.map(o=>o.id));
    assertNoNewOpeningObstruction(base.currentScene,next.currentScene);
  }
});
test('pose/all locks prohibit search, stale or invented choices cannot be applied',()=>{
  for(const kind of ['lock_transform','lock_object'])assert.throws(()=>exploreLayout(base,{roomId:'room-flex',objectIds:[desk]},
    {layoutOptions:new Map(),requirements:requirement(kind)}),/LOCKED/);
  assert.throws(()=>applyLayoutOption(base,'invented',{layoutOptions:registry}),/NOT_OBSERVED/);
  const recolored=dispatchSceneCommand(base,{type:'object.setMaterial',objectId:bed,materialId:'mat-fabric-linen'});
  assert.throws(()=>applyLayoutOption(recolored,option.id,{layoutOptions:registry}),/STALE/);
});
test('observed coordinated layout is one atomic command with byte-identical undo, redo and version restore',()=>{
  assert.equal(moved.cursor,1);assert.equal(moved.commands[0].type,'objects.setTransforms');
  const old=serializeScene(base.currentScene),fresh=serializeScene(moved.currentScene);
  assert.equal(serializeScene(undoSceneCommand(moved).currentScene),old);
  assert.equal(serializeScene(redoSceneCommand(undoSceneCommand(moved)).currentScene),fresh);
  const h=createVersionHistory(base);const saved=saveSceneVersion(h,moved,{source:'agent-provider',summary:'fixture layout'});
  assert.equal(serializeScene(sceneStoreForVersion(deserializeVersionHistory(serializeVersionHistory(saved))).currentScene),fresh);
  assert.equal(serializeScene(validatedWorkingStore(fresh,h,requirement('preserve_object')).currentScene),fresh);
});
test('invalid multi-member command is atomic, including duplicate, fixed, unknown and invalid transform members',()=>{
  const first=option.items[0];const before=serializeScene(base.currentScene);
  for(const items of [[first,{objectId:'ghost',transform:{x:1}}],[first,first],
    [first,{objectId:'object-child-wardrobe',transform:{x:1}}],[first,{objectId:bed,transform:{width:1}}]]){
    assert.throws(()=>dispatchSceneCommand(base,{type:'objects.setTransforms',items}));
    assert.equal(serializeScene(base.currentScene),before);assert.equal(base.cursor,0);
  }
});
test('door obstruction warning is not advertised as a legal new layout',()=>{
  const blocked=dispatchSceneCommand(base,{type:'object.setTransform',objectId:desk,transform:{x:3925,z:3850,rotationY:Math.PI}});
  assert.throws(()=>assertNoNewOpeningObstruction(base.currentScene,blocked.currentScene),/OPENING_OBSTRUCTION/);
});
test('concave room edge cannot bridge a notch even when all four corners are inside',()=>{
  const room=[{x:0,z:0},{x:8,z:0},{x:8,z:8},{x:6,z:8},{x:6,z:2},{x:2,z:2},{x:2,z:8},{x:0,z:8}];
  assert.equal(polygonInsidePolygon([{x:1,z:1},{x:7,z:1},{x:7,z:7},{x:1,z:7}],room),false);
  assert.equal(polygonInsidePolygon([{x:0,z:0},{x:8,z:0},{x:8,z:1},{x:0,z:1}],room),true);
});
test('review requires real changed facts and cannot cite model-injected fake evidence',()=>{
  const after=dispatchSceneCommand(base,{type:'object.setMaterial',objectId:bed,materialId:'mat-fabric-linen'}).currentScene;
  const data=qualityReviewData({input:'床换暖亚麻',before:base.currentScene,after,draft:{action:'preview',reasons:[{factId:'fake:perfect'}]}});
  assert.equal(validateQualityVerdict(reviewFixture(data),data).accepted,true);
  const bad=reviewFixture(data);bad.checks.goalFit.factIds=['fake:perfect'];
  assert.equal(validateQualityVerdict(bad,data).accepted,false);
  const words=reviewFixture(data);words.checks.noticeability.factIds=['user:current'];
  assert.equal(validateQualityVerdict(words,data).accepted,false);
  const hallucinatedIssue=reviewFixture(data);
  hallucinatedIssue.accepted=false;hallucinatedIssue.checks.goalFit.pass=false;
  hallucinatedIssue.issues=[{code:'HALLUCINATED',detail:'引用了不存在的对象',factIds:['object:invented-sofa'],repair:'重新读取真实对象'}];
  const rejected=validateQualityVerdict(hallucinatedIssue,data);
  assert.equal(rejected.accepted,false);assert.ok(rejected.schemaErrors.includes('REVIEW_ISSUE_FACT_INVALID'));
  assert.equal(JSON.stringify(rejected).includes('object:invented-sofa'),false);
  assert.equal(validateQualityVerdict({accepted:true},data).accepted,false);
});
test('requirement review receives an explicit fact allowlist, never requirement record ids',()=>{
  const requirements={...emptyRequirements(),hardConstraints:[{id:'model-made-rule-id',kind:'preserve_object',objectIds:[desk]}]};
  const data=qualityReviewData({phase:'requirements',input:'书桌要留下',before:base.currentScene,
    requirements,previousRequirements:emptyRequirements(),turnStartRequirements:emptyRequirements(),
    draft:{action:'observe',requirementsPatch:{}}});
  assert.ok(data.allowedFactIds.includes('user:current'));
  assert.ok(data.allowedFactIds.includes(`object:${desk}`));
  assert.equal(data.allowedFactIds.includes('model-made-rule-id'),false);
});
test('quality review includes real objects cited by a clarification reason',()=>{
  const data=qualityReviewData({input:'回到家还是像坐在工位',before:scene,after:scene,
    previousRequirements:emptyRequirements(),turnStartRequirements:emptyRequirements(),requirements:emptyRequirements(),
    draft:{action:'clarify',question:'是书桌区，还是平时待的客厅？',reasons:[{objectIds:['object-flex-desk','object-sofa']}]}});
  assert.ok(data.allowedFactIds.includes('object:object-flex-desk'));
  assert.ok(data.allowedFactIds.includes('object:object-sofa'));
});
test('a single expressly requested finish can pass; action count is not the quality criterion',async()=>{
  const input='把单人床织物换成暖亚麻，我只想看这一处。';
  const r=await runDesignDialogue({store:base,input,provider:async()=>model({action:'preview',assistantReply:'只换床的织物。',
    requirementsPatch:need(input,[bed]),toolCalls:[{tool:'set_object_material',args:{objectId:bed,materialId:'mat-fabric-linen'}}]}),reviewProvider:approveReview});
  assert.equal(r.trace.mode,'execute');assert.equal(r.store.cursor,1);assert.equal(r.trace.qualityReview.accepted,true);
});

test('a planner cannot inspect layout and then use finish-only work as a generic spatial answer',async()=>{
  const input='回家还是像坐在工位，书桌要留着。';let plans=0;
  const patch={...need(input),hardConstraints:[{text:'保留书桌',quote:'书桌要留着',kind:'preserve_object',objectIds:[desk]}]};
  const result=await runDesignDialogue({store:base,input,provider:async({prompt})=>{
    plans++;const context=parseContext(prompt);
    if(plans===1)return model({action:'observe',requirementsPatch:patch,toolCalls:[
      {tool:'inspect_room',args:{roomId:'room-flex'}},{tool:'explore_layout',args:{roomId:'room-flex',objectIds:[desk,bed]}}]});
    if(plans===2)return model({action:'preview',assistantReply:'先换个颜色。',requirementsPatch:patch,
      toolCalls:[{tool:'set_object_material',args:{objectId:desk,materialId:'mat-object-bedroom-putty'}}]});
    assert.match(prompt,/LAYOUT_OBSERVATION_UNUSED/);
    const option=context.observations.findLast(item=>item.tool==='explore_layout').result.options[0];
    return model({action:'preview',assistantReply:'保留书桌，先试一个可撤销的布局变化。',requirementsPatch:patch,
      toolCalls:[{tool:'apply_layout_option',args:{optionId:option.id}}]});
  },reviewProvider:approveReview});
  assert.equal(result.trace.mode,'execute');
  assert.ok(result.trace.validationFeedback.some(item=>item.error==='LAYOUT_OBSERVATION_UNUSED'));
  assert.ok(result.trace.toolCalls.some(call=>call.tool==='apply_layout_option'));
});

test('an explicit natural-language finish experiment stays valid after layout inspection',async()=>{
  const input='儿童房有点冷，先从床的颜色开始。';let plans=0;
  const patch=need(input,[bed]);
  const result=await runDesignDialogue({store:base,input,provider:async()=>{
    if(++plans===1)return model({action:'observe',requirementsPatch:patch,toolCalls:[
      {tool:'inspect_room',args:{roomId:'room-flex'}},{tool:'explore_layout',args:{roomId:'room-flex',objectIds:[desk,bed]}}]});
    return model({action:'preview',assistantReply:'先只把床换成暖亚麻色，其他布局不动。',requirementsPatch:patch,
      toolCalls:[{tool:'set_object_material',args:{objectId:bed,materialId:'mat-fabric-linen'}}]});
  },reviewProvider:approveReview});
  assert.equal(result.trace.mode,'execute');
  assert.equal(result.store.currentScene.objects.find(item=>item.id===bed).materialId,'mat-fabric-linen');
  assert.equal(result.trace.validationFeedback.some(item=>item.error==='LAYOUT_OBSERVATION_UNUSED'),false);
});

test('negated finish language cannot excuse a finish-only answer after layout inspection',async()=>{
  const input='回家还是像坐在工位，书桌要留着。不要只换颜色糊弄我。';let plans=0;
  const patch={...need(input),hardConstraints:[{text:'保留书桌',quote:'书桌要留着',kind:'preserve_object',objectIds:[desk]}]};
  const result=await runDesignDialogue({store:base,input,provider:async({prompt})=>{
    plans++;const context=parseContext(prompt);
    if(plans===1)return model({action:'observe',requirementsPatch:patch,toolCalls:[
      {tool:'inspect_room',args:{roomId:'room-flex'}},{tool:'explore_layout',args:{roomId:'room-flex',objectIds:[desk,bed]}}]});
    if(plans===2)return model({action:'preview',assistantReply:'先换个颜色。',requirementsPatch:patch,
      toolCalls:[{tool:'set_object_material',args:{objectId:desk,materialId:'mat-object-bedroom-putty'}}]});
    assert.match(prompt,/LAYOUT_OBSERVATION_UNUSED/);
    const option=context.observations.findLast(item=>item.tool==='explore_layout').result.options[0];
    return model({action:'preview',assistantReply:'保留书桌，先试一个可撤销的布局变化。',requirementsPatch:patch,
      toolCalls:[{tool:'apply_layout_option',args:{optionId:option.id}}]});
  },reviewProvider:approveReview});
  assert.equal(result.trace.mode,'execute');
  assert.ok(result.trace.validationFeedback.some(item=>item.error==='LAYOUT_OBSERVATION_UNUSED'));
  assert.ok(result.trace.toolCalls.some(call=>call.tool==='apply_layout_option'));
});

for (const input of [
  '回家还是像坐在工位，书桌要留着。光换颜色没用。',
  '回家还是像坐在工位，书桌要留着。只换颜色不够。',
]) test(`dismissed finish-only wording cannot bypass layout work: ${input}`,async()=>{
  let plans=0;
  const patch={...need(input),hardConstraints:[{text:'保留书桌',quote:'书桌要留着',kind:'preserve_object',objectIds:[desk]}]};
  const result=await runDesignDialogue({store:base,input,provider:async({prompt})=>{
    plans++;const context=parseContext(prompt);
    if(plans===1)return model({action:'observe',requirementsPatch:patch,toolCalls:[
      {tool:'inspect_room',args:{roomId:'room-flex'}},{tool:'explore_layout',args:{roomId:'room-flex',objectIds:[desk,bed]}}]});
    if(plans===2)return model({action:'preview',assistantReply:'先换个颜色。',requirementsPatch:patch,
      toolCalls:[{tool:'set_object_material',args:{objectId:desk,materialId:'mat-object-bedroom-putty'}}]});
    assert.match(prompt,/LAYOUT_OBSERVATION_UNUSED/);
    const option=context.observations.findLast(item=>item.tool==='explore_layout').result.options[0];
    return model({action:'preview',assistantReply:'保留书桌，先试一个可撤销的布局变化。',requirementsPatch:patch,
      toolCalls:[{tool:'apply_layout_option',args:{optionId:option.id}}]});
  },reviewProvider:approveReview});
  assert.equal(result.trace.mode,'execute');
  assert.ok(result.trace.validationFeedback.some(item=>item.error==='LAYOUT_OBSERVATION_UNUSED'));
  assert.ok(result.trace.toolCalls.some(call=>call.tool==='apply_layout_option'));
});

test('replayed recorded failure is rejected for quality, then repaired through observed real geometry; first failure survives',async()=>{
  const repro=JSON.parse(readFileSync(new URL('../../docs/gptpro-handoff-20260910/REPRO-TRACE.json',import.meta.url),'utf8'));
  const stages=[],planPromptLengths=[];let plans=0;
  const r=await runDesignDialogue({store:base,input:repro.input,onProgress:e=>stages.push(e.phase),provider:async({purpose,prompt,reviewData,systemPrompt})=>{
    // The default independent reviewer is the SAME provider, explicitly exercising production routing.
    if(purpose.startsWith('review_')){
      assert.match(systemPrompt,/复核/);
      if(reviewData.phase==='proposal'&&reviewData.draft.action==='preview'&&!reviewData.measuredDelta.facts.some(f=>f.kind==='pose')){
        return model(reviewFixture(reviewData,{fail:['goalFit','explanationTruth'],detail:'只有两个饰面变化，没有改变工位与休息关系，且不能据此声称采光变化。',repair:'读取门窗与家具关系，使用布局搜索，把桌子保留但允许重新布置。'}));
      }
      return model(reviewFixture(reviewData));
    }
    plans++;planPromptLengths.push(prompt.length);const c=parseContext(prompt);
    const patch={...need(repro.input),hardConstraints:[
      {text:'书桌要留下',quote:'书桌要留下',kind:'preserve_object',objectIds:[desk]},
      {text:'先别加大件',quote:'先别加大件',kind:'no_new_large_objects',objectIds:[]}]};
    if(plans===1)return model({action:'preview',assistantReply:repro.assistantReply,requirementsPatch:patch,toolCalls:repro.toolCalls});
    if(plans===2){assert.match(prompt,/DESIGN_QUALITY_REJECTED/);return model({action:'observe',requirementsPatch:patch,
      toolCalls:[{tool:'inspect_room',args:{roomId:'room-flex'}},{tool:'explore_layout',args:{roomId:'room-flex',objectIds:[desk,bed]}}]});}
    const options=c.observations.findLast(o=>o.tool==='explore_layout').result.options;
    const chosen=options.find(o=>o.items.some(item=>item.objectId===desk));
    return model({action:'preview',assistantReply:'书桌保留，重新布置桌子与床的关系；先看这个可撤销的尝试。',requirementsPatch:patch,
      toolCalls:[{tool:'apply_layout_option',args:{optionId:chosen.id}}]});
  }});
  assert.equal(r.trace.mode,'execute');
  assert.equal(r.trace.candidateHistory[0].status,'quality_rejected');
  assert.deepEqual(r.trace.candidateHistory[0].toolCalls,repro.toolCalls);
  assert.equal(r.trace.candidateHistory.at(-1).status,'reviewed_preview');
  assert.equal(r.trace.modelRequests[0].response.assistantReply,repro.assistantReply);
  assert.ok(planPromptLengths[2]<30000,`focused repair prompt should stay bounded, got ${planPromptLengths[2]}`);
  assert.ok(stages.includes('repairing')&&stages.includes('preview_ready'));
  assert.notDeepEqual(r.store.currentScene.objects.find(o=>o.id===desk).transform,base.currentScene.objects.find(o=>o.id===desk).transform);
  assert.equal(r.store.currentScene.objects.find(o=>o.id===bed).materialId,base.currentScene.objects.find(o=>o.id===bed).materialId);
  assert.equal(r.store.currentScene.surfaces.find(o=>o.id==='surface-wall-reference-10').materialId,base.currentScene.surfaces.find(o=>o.id==='surface-wall-reference-10').materialId);
  assert.equal(serializeScene(undoSceneCommand(r.store).currentScene),serializeScene(base.currentScene));
  assert.equal(r.trace.modelRequests.every(q=>q.providerTrace?.provider==='mock'),true);
  // Explicit test-only evidence export. These are real canonical commands driven
  // by deterministic fixtures, NEVER a claim about DeepSeek or a rendered page.
  if(process.env.OPAI_TEST_EVIDENCE_DIR){
    const dir=process.env.OPAI_TEST_EVIDENCE_DIR;mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'recorded-repro-mechanics.json'),JSON.stringify({
      nonLive:true,provider:'mock',scope:'canonical mechanical regression; no browser or live model acceptance',
      originalInput:repro.input,stages,commands:r.store.commands.slice(base.cursor),
      trace:r.trace,before:base.currentScene,after:r.store.currentScene,
      undoByteIdentical:serializeScene(undoSceneCommand(r.store).currentScene)===serializeScene(base.currentScene),
      measuredDelta:candidateFacts(base.currentScene,r.store.currentScene),
    },null,2)+'\n');
  }
});

test('semantic review rejects preserving an object being inflated to a position lock',async()=>{
  const input='书桌留下，房间重新安排一下。';let plans=0,reviews=0;
  const result=await runDesignDialogue({store:base,input,provider:async()=>model({action:'clarify',question:'你更想留出活动地方，还是让休息的位置更突出？',
    requirementsPatch:{hardConstraints:[{text:'书桌留下',quote:'书桌留下',kind:++plans===1?'lock_transform':'preserve_object',objectIds:[desk]}]}}),
    reviewProvider:async({reviewData})=>{reviews++;return reviewFixture(reviewData,{fail:reviewData.proposedRequirements.hardConstraints.some(r=>r.kind==='lock_transform')?['constraintMeaning']:[]});}});
  assert.equal(plans,2);assert.equal(reviews,2);
  assert.deepEqual(result.requirements.hardConstraints.map(r=>r.kind),['preserve_object']);
});
test('named-room question repair stays read-only and asks a design-changing life difference',async()=>{
  let plans=0;const result=await runDesignDialogue({store:base,input:'备餐那间屋子，人一进去就没处转身。',
    provider:async()=>model({action:'clarify',question:++plans===1?'你希望调整哪个房间？':'平时一个人在里面忙，还是常常两个人一起？'}),
    reviewProvider:async({reviewData})=>reviewFixture(reviewData,{fail:plans===1?['questionValue']:[]})});
  assert.equal(plans,2);assert.equal(result.trace.mode,'clarify');assert.equal(result.store,base);
});
test('same rejected physical result cannot be re-reviewed until approved by chance',async()=>{
  let calls=0,reviews=0;const input='床边想柔和一点';
  const result=await runDesignDialogue({store:base,input,provider:async()=>{
    calls++;return model({action:'preview',assistantReply:`尝试 ${calls}`,requirementsPatch:need(input,[bed]),
      toolCalls:[{tool:'set_object_material',args:{objectId:bed,materialId:'mat-fabric-linen'}}]});},
    reviewProvider:async({reviewData})=>{reviews++;return reviewFixture(reviewData,{fail:['goalFit']});}});
  assert.equal(reviews,1);assert.equal(result.trace.mode,'failed');assert.equal(result.store,base);
});
test('provider abort after response preserves usage, rolls back and does not call reviewer',async()=>{
  const controller=new AbortController();let seen;
  await assert.rejects(runDesignDialogue({store:base,input:'先试试看',signal:controller.signal,provider:async()=>{
    controller.abort(Error('REQUEST_CANCELLED'));return model({action:'answer',assistantReply:'不会提交'});
  },reviewProvider:async()=>assert.fail('review after cancellation')}),error=>{
    seen=error.trace;return error.message==='REQUEST_CANCELLED';
  });
  assert.equal(seen.modelRequests.length,1);assert.equal(seen.modelRequests[0].providerTrace.provider,'mock');assert.equal(base.cursor,0);
});
test('reviewer outage fails closed, never turns a legal candidate into an accepted preview',async()=>{
  const input='床换个织物';
  await assert.rejects(runDesignDialogue({store:base,input,provider:async()=>model({action:'preview',requirementsPatch:need(input,[bed]),
    toolCalls:[{tool:'set_object_material',args:{objectId:bed,materialId:'mat-fabric-linen'}}]}),reviewProvider:async()=>{throw Error('DEEPSEEK_TIMEOUT');}}),e=>{
      assert.equal(e.trace.rolledBack,true);assert.equal(e.trace.toolCalls.length,0);return e.message==='DEEPSEEK_TIMEOUT';});
});
test('retain then save/reopen keeps real atomic layout and hard constraints; retract affects only unretained draft',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'opai-repair-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const s=createExperienceStore({directory:dir}),p=s.create();
  const h=deserializeVersionHistory(p.versionHistory),initial=sceneStoreForVersion(h),opts=new Map();
  const choice=exploreLayout(initial,{roomId:'room-flex',objectIds:[desk,bed]},{layoutOptions:opts}).options.find(o=>o.items.some(i=>i.objectId===desk));
  const retained=applyLayoutOption(initial,choice.id,{layoutOptions:opts}).store;
  const extra=dispatchSceneCommand(retained,{type:'object.setMaterial',objectId:bed,materialId:'mat-fabric-linen'});
  assert.equal(serializeScene(retractUnretainedPreview(extra,{startCursor:retained.cursor}).currentScene),serializeScene(retained.currentScene));
  await s.transact(p.projectId,p.accessToken,{requestId:'constraints',expectedRevision:0,operation:'fixture',payload:{}},draft=>{draft.requirements={...emptyRequirements(),...requirement('preserve_object')};return{};});
  const h2=saveSceneVersion(h,retained,{source:'agent-provider',summary:'non-live fixture'});
  await s.save(p.projectId,p.accessToken,{requestId:'save',expectedRevision:1,versionHistory:serializeVersionHistory(h2)});
  const reopened=createExperienceStore({directory:dir}).read(p.projectId,p.accessToken);
  assert.equal(reopened.requirements.hardConstraints[0].kind,'preserve_object');
  assert.equal(serializeScene(sceneStoreForVersion(deserializeVersionHistory(reopened.versionHistory)).currentScene),serializeScene(retained.currentScene));
});
test('adapter keeps system/data separate, records actual model, and refuses changing the production model',async()=>{
  let body;const result=await callDesignDeepSeek({systemPrompt:'trusted policy',prompt:'untrusted user data',purpose:'review_proposal'},
    {apiKey:'isolated-fixture',fetchImpl:async(_url,req)=>{body=JSON.parse(req.body);return {ok:true,json:async()=>({model:'deepseek-flash',usage:{completion_tokens:10},
      choices:[{finish_reason:'stop',message:{content:'{"accepted":true}',reasoning_content:'never store this'}}]})};}});
  assert.deepEqual(body.messages.map(m=>m.role),['system','user']);assert.equal(body.model,'deepseek-v4-flash');
  assert.equal(result.providerTrace.model,'deepseek-flash');assert.equal(JSON.stringify(result.providerTrace).includes('never store this'),false);
  await assert.rejects(callDesignDeepSeek({prompt:'hi'},{apiKey:'fixture',model:'other-model'}),/MODEL_REQUIRED/);
});

test('atomic swap succeeds where a sequential move collides with a not-yet-moved neighbour',()=>{
  const [a,b]=base.currentScene.objects.filter(o=>o.category==='dining-chair');
  assert.throws(()=>dispatchSceneCommand(base,{type:'object.setTransform',objectId:a.id,transform:b.transform}),/COLLISION/);
  const result=dispatchSceneCommand(base,{type:'objects.setTransforms',items:[{objectId:a.id,transform:b.transform},{objectId:b.id,transform:a.transform}]});
  assert.equal(result.cursor,1);assert.equal(serializeScene(undoSceneCommand(result).currentScene),serializeScene(base.currentScene));
});
test('failed automatic material interpretation cannot persist a silently released older hard constraint',async()=>{
  const input='把全屋地面换成灰色',old={...emptyRequirements(),hardConstraints:[{id:'floor-lock',kind:'lock_material',text:'地面不改',quote:'地面不改',objectIds:base.currentScene.surfaces.filter(s=>s.kind==='floor').map(s=>s.id)}]};
  let reviewedOriginal=false;
  const result=await runDesignDialogue({store:base,input,requirements:old,maxSteps:1,
    provider:async()=>model({action:'clarify',question:'确定要用这个色调吗？'}),
    reviewProvider:async({reviewData})=>{reviewedOriginal=reviewData.turnStartRequirements.hardConstraints[0].id==='floor-lock';return reviewFixture(reviewData,{fail:['constraintMeaning']});}});
  assert.equal(reviewedOriginal,true);assert.deepEqual(result.requirements.hardConstraints,old.hardConstraints);
});

test('new tall furniture intrusion into the explicit window planning band is rejected; low furniture is not assumed to block glazing',()=>{
  const tall=clone(scene);tall.objects.find(o=>o.id===bed).dimensions.height=1200;
  const store=createSceneStore(tall),near=dispatchSceneCommand(store,{type:'object.setTransform',objectId:bed,transform:{x:5950}});
  assert.throws(()=>assertNoNewOpeningObstruction(store.currentScene,near.currentScene),/OPENING_OBSTRUCTION/);
  const low=dispatchSceneCommand(base,{type:'object.setTransform',objectId:bed,transform:{x:5950}});
  assert.doesNotThrow(()=>assertNoNewOpeningObstruction(base.currentScene,low.currentScene));
});
test('development and holdout are frozen, reference real entities, and do not feed the runtime planner',async()=>{
  const {loadQualityCases,checkMechanics,summarizeRequests,sanitize}=await import('../scripts/harness-eval-support.mjs');
  const cases=loadQualityCases();assert.equal(new Set(cases.map(c=>c.id)).size,cases.length);
  const ids=new Set(scene.objects.map(o=>o.id));
  for(const c of cases)for(const {expected:e} of c.turns){
    for(const field of ['preserved','lockPose','lockObject','poseIfPreview','changedIfPreview'])for(const id of e[field]??[])assert.ok(ids.has(id),`${c.id}: ${id}`);
    if(e.knownRoom)assert.ok(scene.rooms.some(r=>r.id===e.knownRoom));
  }
  assert.ok(cases.some(c=>c.split==='holdout'));assert.ok(cases.some(c=>c.coverage.includes('refresh')));
  assert.equal(checkMechanics(base.currentScene,{store:moved,trace:{mode:'execute'},requirements:requirement('preserve_object')},{preserved:[desk],poseIfPreview:[desk,bed]}).passed,true);
  assert.equal(checkMechanics(base.currentScene,{store:moved,trace:{mode:'execute'},requirements:requirement('lock_transform')},{lockPose:[desk]}).passed,false);
  assert.deepEqual(sanitize({accessToken:'no',ok:1,reasoning_content:'private'}),{ok:1});
  assert.equal(summarizeRequests([{outcome:'error',providerTrace:{usage:null}}]).usage.requestsWithUnknownUsage,1);
});

test('production adapter rejects missing or different actual model while preserving billed usage',async()=>{
  for(const model of [undefined,'deepseek-v4-pro'])await assert.rejects(callDesignDeepSeek({prompt:'fixture'},
    {apiKey:'offline-test-only',fetchImpl:async()=>({ok:true,json:async()=>({model,usage:{completion_tokens:7},choices:[{finish_reason:'stop',message:{content:'{"action":"answer"}'}}]})})}),e=>{
      assert.equal(e.providerTrace.usage.completion_tokens,7);assert.equal(e.providerTrace.model,model??null);return e.message==='DEEPSEEK_DESIGN_MODEL_UNVERIFIED';});
});
