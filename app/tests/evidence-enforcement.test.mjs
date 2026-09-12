import { approveReview } from '../test-support/quality-review-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHouseKnowledgeStore } from '../server/house-knowledge.mjs';
import { createExperienceStore } from '../server/experience-store.mjs';
import { createExperienceRoutes } from '../server/experience-routes.mjs';
import { createAppServer } from '../server/index.mjs';
import { createReferenceHome } from '../src/domain/reference-home.js';
import { createSceneStore, dispatchSceneCommand, serializeScene } from '../src/domain/scene.js';
import { deserializeVersionHistory, sceneStoreForVersion, saveSceneVersion, serializeVersionHistory } from '../src/domain/design-version.js';
import { assertEvidenceConstraints, assertEvidenceCitations } from '../src/agent/evidence.js';
import { runDesignDialogue } from '../src/agent/dialogue.js';

const targetId='surface-wall-reference-11';
const source={title:'住户确认电视墙材质',uri:'resident://wall-policy',kind:'json',authorized:true,authorization:'user_provided',trust:'user_confirmed'};
const materialPolicy={type:'material',targetId,allowedMaterialIds:['mat-wall-oak-panel'],forbiddenMaterialIds:['mat-wall-greige']};
const makeKnowledge=()=>createHouseKnowledgeStore({filePath:join(mkdtempSync(join(tmpdir(),'opai-evidence-')),'knowledge.json')});
const importPolicy=(knowledge,projectId,houseId,policy=materialPolicy)=>knowledge.importDocument({projectId,houseId,source,content:JSON.stringify({notes:'电视墙使用确认材质',designConstraints:[policy]})});

test('typed evidence is enforced before a repaired atomic preview and valid source citation survives',async()=>{
  const initial=createSceneStore(createReferenceHome()),knowledge=makeKnowledge(),projectId='p-grounding';
  const imported=importPolicy(knowledge,projectId,initial.currentScene.id);let attempts=0;
  const reply=await runDesignDialogue({reviewProvider:approveReview,store:initial,input:'按照最新电视墙资料试一次',projectId,knowledge,provider:async context=>{
    attempts++;
    if(attempts===2)assert.match(context.prompt,/EVIDENCE_MATERIAL_CONSTRAINT/);
    return {action:'preview',assistantReply:'电视墙按确认资料调整，其他对象不动。',
      requirementsPatch:{confirmed:[{text:'按最新电视墙资料调整',quote:'按照最新电视墙资料试一次',kind:'preference'}]},
      toolCalls:[{tool:'set_surface_material',args:{surfaceId:targetId,materialId:attempts===1?'mat-wall-greige':'mat-wall-oak-panel'}}],
      reasons:[{requirementText:'按资料',fact:'确认电视墙材质',objectIds:[targetId],tradeoff:'仅改这一面墙',sourceIds:[imported.document.documentId]}],
      providerTrace:{provider:'test-double',model:'not-live'}};
  }});
  assert.equal(attempts,2);assert.equal(reply.trace.terminationReason,'legal_preview');
  assert.equal(reply.store.currentScene.surfaces.find(s=>s.id===targetId).materialId,'mat-wall-oak-panel');
  assert.equal(reply.trace.steps.some(s=>s.disposition==='rolled_back'),true);
  assert.equal(initial.cursor,0);
});

test('unobserved or missing citations cannot certify a source-grounded preview',()=>{
  const searches=[{results:[{chunkId:'chunk-current',source:{documentId:'doc-current'}}]}];
  assert.throws(()=>assertEvidenceCitations([],searches),/CITATION_REQUIRED/);
  assert.throws(()=>assertEvidenceCitations([{sourceIds:['doc-outdated']}],searches),/SOURCE_UNKNOWN/);
  assert.doesNotThrow(()=>assertEvidenceCitations([{sourceIds:['doc-current']}],searches));
});

test('evidence policies reject cross-house bindings and block manual transform/deletion changes',()=>{
  const before=createReferenceHome(),knowledge=makeKnowledge();
  importPolicy(knowledge,'p',before.id,{type:'lock_transform',targetId:'object-sofa'});
  const constraints=knowledge.search({projectId:'p',houseId:before.id,query:'无关词语'}).evidenceConstraints;
  const after=structuredClone(before);after.objects.find(o=>o.id==='object-sofa').transform.x+=100;
  assert.throws(()=>assertEvidenceConstraints(before,after,constraints,{projectId:'other',houseId:before.id}),/SCOPE_INVALID/);
  assert.throws(()=>assertEvidenceConstraints(before,after,constraints,{projectId:'p',houseId:before.id}),/TRANSFORM_CONSTRAINT/);
  const resized=structuredClone(before);resized.objects.find(o=>o.id==='object-sofa').dimensions.width+=100;
  assert.throws(()=>assertEvidenceConstraints(before,resized,constraints,{projectId:'p',houseId:before.id}),/TRANSFORM_CONSTRAINT/);
  assert.doesNotThrow(()=>assertEvidenceConstraints(before,before,constraints,{projectId:'p',houseId:before.id}));
});

test('actual save API rejects client-side bypass of confirmed source constraints without changing saved state',async t=>{
  const store=createExperienceStore({directory:mkdtempSync(join(tmpdir(),'opai-evidence-save-'))}),knowledge=makeKnowledge();
  const p=store.create();importPolicy(knowledge,p.projectId,p.houseId);
  const history=deserializeVersionHistory(p.versionHistory),before=sceneStoreForVersion(history);
  const changed=dispatchSceneCommand(before,{type:'surface.setMaterial',surfaceId:targetId,materialId:'mat-wall-greige'});
  const submitted=saveSceneVersion(history,changed,{source:'agent'});
  const server=createAppServer({experienceHandler:createExperienceRoutes({reviewProvider:approveReview,store,knowledge})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/experience/projects/${p.projectId}/save`,{
    method:'POST',headers:{authorization:'Bearer '+p.accessToken},
    body:JSON.stringify({requestId:'save-forbidden',expectedRevision:0,versionHistory:serializeVersionHistory(submitted)}),
  });
  assert.equal(response.status,400);assert.match((await response.json()).error,/EVIDENCE_MATERIAL_CONSTRAINT/);
  assert.equal(store.read(p.projectId,p.accessToken).versionHistory,p.versionHistory);
  assert.equal(serializeScene(before.currentScene),serializeScene(sceneStoreForVersion(history).currentScene));
});
