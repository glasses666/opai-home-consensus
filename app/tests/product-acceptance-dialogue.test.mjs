import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createExperienceRoutes } from '../server/experience-routes.mjs';
import { createExperienceScene, createExperienceStore } from '../server/experience-store.mjs';
import { createFamilyDiscussionService } from '../server/family-discussion.mjs';
import { createAppServer } from '../server/index.mjs';
import {
  applyRequirementPatch,
  assertRequirementConstraints,
  emptyRequirements,
  runDesignDialogue,
} from '../src/agent/dialogue.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createReferenceHome } from '../src/domain/reference-home.js';
import { createSceneStore, dispatchSceneCommand } from '../src/domain/scene.js';
import {
  deserializeVersionHistory,
  saveSceneVersion,
  sceneStoreForVersion,
  serializeVersionHistory,
} from '../src/domain/design-version.js';

const providerTrace = { provider: 'deepseek', model: 'deepseek-v4-flash' };
const blankPatch = () => ({
  hypotheses: [], confirmed: [], hardConstraints: [], preferences: [], unresolved: [], retract: [],
});

test('observed relative placement rejects guessed coordinates and permits deterministic repair', async () => {
  const initial = createSceneStore(createReferenceHome());
  const input = '茶几向餐桌靠近一点';
  const prompts = [];
  const result = await runDesignDialogue({ store: initial, input, requestId: 'relative-repair', provider: async ({prompt}) => {
    prompts.push(prompt);
    const call = prompts.length === 1
      ? {tool:'inspect_spatial_relation',args:{objectId:'object-coffee-table',referenceObjectId:'object-dining-table'}}
      : prompts.length === 2
        ? {tool:'move_object',args:{objectId:'object-coffee-table',dz:200}}
        : {tool:'move_relative_to_object',args:{objectId:'object-coffee-table',referenceObjectId:'object-dining-table',relation:'toward',distanceMm:200}};
    return { action: prompts.length === 1 ? 'observe' : 'preview', assistantReply:'只移动茶几，预览后再确认。',
      requirementsPatch:{...blankPatch(),confirmed:[{text:input,quote:input,kind:'preference',objectIds:['object-coffee-table']}]},
      toolCalls:[call], reasons:[], providerTrace };
  }});
  assert.equal(result.trace.mode,'execute');
  assert.match(prompts[2], /RELATIVE_MOVE_TOOL_REQUIRED/);
  assert.equal(result.trace.toolCalls[0].tool,'move_relative_to_object');
  const dining = initial.currentScene.objects.find(o=>o.id==='object-dining-table');
  const coffee = scene => scene.objects.find(o=>o.id==='object-coffee-table');
  const distance = o => Math.hypot(o.transform.x-dining.transform.x,o.transform.z-dining.transform.z);
  assert.ok(distance(coffee(result.store.currentScene)) < distance(coffee(initial.currentScene)));
  assert.equal(result.store.cursor-initial.cursor,1);
  for (const object of initial.currentScene.objects.filter(o=>o.id!=='object-coffee-table')) {
    assert.deepEqual(result.store.currentScene.objects.find(o=>o.id===object.id),object);
  }
});

test('model scene observation includes canonical axes and bounds rather than inferred screen directions', async () => {
  const scene = createDemoScene();
  let observed;
  await runDesignDialogue({ store: createSceneStore(scene), input: '腾一点活动地方', requestId: 'axes-observation',
    provider: async ({ prompt }) => {
      const context = JSON.parse(prompt.slice(prompt.lastIndexOf('\n数据：\n') + '\n数据：\n'.length));
      observed = context.observations.find(entry => entry.tool === 'read_scene').result;
      return { action: 'clarify', question: '主要是坐下伸展，还是需要站起来活动？', requirementsPatch: blankPatch(), toolCalls: [], reasons: [], providerTrace };
    },
  });
  assert.deepEqual(observed.floorPlan, { origin: scene.floorPlan.origin, axes: scene.floorPlan.axes, bounds: scene.floorPlan.bounds });
  assert.deepEqual(observed.floorPlan.axes, { x: 'east', y: 'up', z: 'south' });
  assert.equal(observed.objects.find(o => o.id === scene.objects[0].id).transform.z, scene.objects[0].transform.z);
});

test('a held-out correction retracts the earlier hypothesis and records only quoted user intent', async () => {
  const scene = createDemoScene();
  const firstInput = '下班了一看到客厅就不想进去。';
  const first = await runDesignDialogue({
    store: createSceneStore(scene),
    input: firstInput,
    requestId: 'turn-held-out-1',
    provider: async () => ({
      action: 'clarify',
      assistantReply: '是冷灰色和灯光让你联想到工作，还是工作桌一进门就看见更影响你？',
      question: '是冷灰色和灯光让你联想到工作，还是工作桌一进门就看见更影响你？',
      requirementsPatch: {
        ...blankPatch(),
        hypotheses: [{ text: '客厅可能让用户联想到工作状态', objectIds: [], kind: 'preference' }],
      },
      toolCalls: [], reasons: [], providerTrace,
    }),
  });
  assert.equal(first.trace.mode, 'clarify');
  assert.equal(first.requirements.hypotheses.length, 1);

  const oldHypothesis = first.requirements.hypotheses[0];
  const correction = '没有心理原因，我只是不喜欢现在的冷灰色。';
  const second = await runDesignDialogue({
    store: first.store,
    requirements: first.requirements,
    conversation: [
      { role: 'user', text: firstInput },
      { role: 'assistant', text: first.trace.assistantReply },
    ],
    input: correction,
    requestId: 'turn-held-out-2',
    provider: async () => ({
      action: 'clarify',
      assistantReply: '明白，不做心理推断。你希望更接近暖白，还是带一点米灰？',
      question: '你希望更接近暖白，还是带一点米灰？',
      requirementsPatch: {
        ...blankPatch(),
        preferences: [{ text: '不喜欢当前冷灰色', quote: '我只是不喜欢现在的冷灰色', objectIds: [], kind: 'preference' }],
        retract: [{ id: oldHypothesis.id, quote: '没有心理原因', reason: '用户明确否定' }],
      },
      hypothesisReview: [{ id: oldHypothesis.id, decision: 'reject', quote: '没有心理原因' }],
      toolCalls: [], reasons: [], providerTrace,
    }),
  });
  assert.equal(second.requirements.hypotheses.length, 0);
  assert.equal(second.requirements.rejected.some(item => item.id === oldHypothesis.id), true);
  assert.equal(second.requirements.preferences.some(item => item.quote === '我只是不喜欢现在的冷灰色'), true);
  assert.equal(second.requirements.utterances.length, 2);
});

test('unquoted model assertions cannot become confirmed needs or hard constraints', () => {
  const scene = createDemoScene();
  const next = applyRequirementPatch(emptyRequirements(), {
    ...blankPatch(),
    confirmed: [{ text: '用户已确认需要全部拆除', quote: '这句不在用户输入中', kind: 'preference' }],
    hardConstraints: [{ text: '永久锁定全部家具', quote: '', kind: 'lock_transform', objectIds: ['object-sofa'] }],
  }, { input: '我还没想好。', turnId: 'turn-unquoted', scene });
  assert.deepEqual(next.confirmed, []);
  assert.deepEqual(next.hardConstraints, []);
});

test('reconfirming an unchanged requirement keeps original provenance and permits a new attempt', async () => {
  const scene=createReferenceHome(), input='只换沙发织物';
  const patch={...blankPatch(),confirmed:[{text:'只换沙发织物',quote:input,kind:'preference',objectIds:['object-sofa']}]};
  const prior=applyRequirementPatch(emptyRequirements(),patch,{input,turnId:'original',scene});
  const result=await runDesignDialogue({store:createSceneStore(scene),input,requirements:prior,requestId:'retry-same',provider:async()=>({
    action:'preview',assistantReply:'只改变沙发颜色。',requirementReview:[{id:prior.confirmed[0].id,decision:'retain'}],requirementsPatch:patch,
    toolCalls:[{tool:'set_object_material',args:{objectId:'object-sofa',materialId:'mat-flex-accent-fabric'}}],reasons:[],providerTrace,
  })});
  assert.equal(result.trace.mode,'execute');
  assert.equal(result.requirements.confirmed.length,1);
  assert.equal(result.requirements.confirmed[0].sourceTurnId,'original');
  assert.equal(result.requirements.confirmed[0].lastConfirmedTurnId,'retry-same');
  assert.equal(result.requirements.confirmed[0].lastConfirmationQuote,input);
});

test('natural master-bedroom atmosphere request produces a constrained multi-object preview', async () => {
  const initial=createSceneStore(createExperienceScene());
  const input='主人房总觉得有点冷。床和衣柜都留下，先从床头和颜色开始，别加大件。';
  const result=await runDesignDialogue({store:initial,input,activeRoomId:'room-primary-bedroom',requestId:'master-atmosphere',provider:async()=>({
    action:'preview',assistantReply:'我先只调整床头主景和床的织物，床与衣柜都留在原位。',
    requirementsPatch:{...blankPatch(),
      confirmed:[{text:'让主卧暖一点',quote:'主人房总觉得有点冷',kind:'preference',objectIds:['object-primary-feature-wall','object-primary-bed']}],
      hardConstraints:[
        {text:'保留床和衣柜',quote:'床和衣柜都留下',kind:'preserve_object',objectIds:['object-primary-bed','object-primary-wardrobe']},
        {text:'不新增大件',quote:'别加大件',kind:'no_new_objects',objectIds:[]},
      ],
      preferences:[{text:'先调整床头和颜色',quote:'先从床头和颜色开始',kind:'preference',objectIds:['object-primary-feature-wall','object-primary-bed']}],
    },
    toolCalls:[
      {tool:'set_object_material',args:{objectId:'object-primary-feature-wall',materialId:'mat-oak-veneer'}},
      {tool:'set_object_material',args:{objectId:'object-primary-bed',materialId:'mat-fabric-linen'}},
    ],
    reasons:[{requirementText:'先从床头和颜色开始',fact:'床头主景和床织物均可编辑',objectIds:['object-primary-feature-wall','object-primary-bed'],tradeoff:'不改布局',sourceIds:[]}],
    providerTrace,
  })});
  assert.equal(result.trace.mode,'execute');
  assert.equal(result.trace.terminationReason,'legal_preview');
  assert.equal(result.store.currentScene.objects.length,initial.currentScene.objects.length);
  for(const id of ['object-primary-bed','object-primary-wardrobe']){
    assert.deepEqual(result.store.currentScene.objects.find(object=>object.id===id).transform,initial.currentScene.objects.find(object=>object.id===id).transform);
  }
  assert.equal(result.store.currentScene.objects.find(object=>object.id==='object-primary-feature-wall').materialId,'mat-oak-veneer');
  assert.equal(result.store.currentScene.objects.find(object=>object.id==='object-primary-bed').materialId,'mat-fabric-linen');
  assert.deepEqual(result.requirements.hardConstraints.map(item=>item.kind).sort(),['no_new_objects','preserve_object']);
});

test('a newly proposed hard constraint with a preference kind is rejected and repaired on the next model attempt', async () => {
  const initial = createSceneStore(createDemoScene());
  const input = '工作桌必须保留，墙面可以改成暖灰色。';
  let calls = 0;
  const prompts = [];
  const result = await runDesignDialogue({
    store: initial,
    input,
    requestId: 'turn-repair-new-hard-kind',
    provider: async ({ prompt }) => {
      calls += 1;
      prompts.push(prompt);
      return {
        action: 'preview',
        assistantReply: '保留工作桌，只调整墙面。',
        requirementsPatch: {
          ...blankPatch(),
          hardConstraints: [{
            text: '工作桌必须保留', quote: '工作桌必须保留', objectIds: ['object-flex-desk'],
            kind: calls === 1 ? 'preference' : 'preserve_object',
          }],
        },
        toolCalls: [{ tool: 'set_surface_material', args: { surfaceId: 'surface-wall-living-south', materialId: 'mat-wall-greige' } }],
        reasons: [],
        providerTrace,
      };
    },
  });
  assert.equal(calls, 2, 'the malformed hard constraint must consume a visible repair attempt, not pass silently');
  assert.equal(result.trace.terminationReason, 'legal_preview');
  assert.equal(result.requirements.hardConstraints.length, 1);
  assert.equal(result.requirements.hardConstraints[0].kind, 'preserve_object');
  assert.equal(result.trace.modelRequests.length, 2);
  assert.match(prompts[1], /HARD_CONSTRAINT_KIND_REQUIRED/,
    'the repair attempt must observe the concrete validation failure');
});

test('a persisted malformed hard constraint blocks execution until the model explicitly repairs its semantic kind', async () => {
  const initial = createSceneStore(createDemoScene());
  const before = JSON.stringify(initial.currentScene);
  const malformed = {
    ...emptyRequirements(),
    hardConstraints: [{
      id: 'legacy-hard-with-soft-kind', text: '工作桌必须保留', quote: '工作桌必须保留',
      objectIds: ['object-flex-desk'], kind: 'preference', sourceTurnId: 'prior', status: 'user_stated',
    }],
  };
  const result = await runDesignDialogue({
    store: initial,
    requirements: malformed,
    input: '把客厅南墙换成暖灰色。',
    requestId: 'turn-block-legacy-hard-kind',
    maxSteps: 1,
    provider: async () => ({
      action: 'preview', assistantReply: '调整墙面。', requirementsPatch: blankPatch(),
      toolCalls: [{ tool: 'set_surface_material', args: { surfaceId: 'surface-wall-living-south', materialId: 'mat-wall-greige' } }],
      reasons: [], providerTrace,
    }),
  });
  assert.equal(result.trace.mode, 'failed');
  assert.match(result.trace.terminationReason, /HARD_CONSTRAINT_KIND_REQUIRED/);
  assert.equal(JSON.stringify(result.store.currentScene), before);
  assert.equal(result.trace.toolCalls.length, 0);
});

test('persisted preserve, transform-lock, and no-new-object constraints each reject a violating next-turn scene', () => {
  const before = createDemoScene();
  const requirements = {
    ...emptyRequirements(),
    hardConstraints: [
      { id: 'keep-desk', kind: 'preserve_object', objectIds: ['object-flex-desk'] },
      { id: 'lock-sofa', kind: 'lock_transform', objectIds: ['object-sofa'] },
      { id: 'no-new', kind: 'no_new_objects', objectIds: [] },
    ],
  };

  const deleted = structuredClone(before);
  deleted.objects = deleted.objects.filter(object => object.id !== 'object-flex-desk');
  assert.throws(() => assertRequirementConstraints(before, deleted, requirements), /REQUIREMENT_CONSTRAINT:keep-desk:preserve/);

  const moved = structuredClone(before);
  moved.objects.find(object => object.id === 'object-sofa').transform.x += 100;
  assert.throws(() => assertRequirementConstraints(before, moved, requirements), /REQUIREMENT_CONSTRAINT:lock-sofa:transform/);

  const added = structuredClone(before);
  added.objects.push({ ...structuredClone(added.objects[0]), id: 'object-unapproved-new-large-item' });
  assert.throws(() => assertRequirementConstraints(before, added, requirements), /REQUIREMENT_CONSTRAINT:no-new:no_new_objects/);
});

test('a next-turn write is blocked when any persisted confirmed need or preference is left unreviewed', async () => {
  const initial = createSceneStore(createDemoScene());
  const before = JSON.stringify(initial.currentScene);
  const requirements = {
    ...emptyRequirements(),
    confirmed: [{
      id: 'confirmed-rest', text: '客厅要适合休息', quote: '客厅要适合休息', objectIds: [],
      kind: 'preference', sourceTurnId: 'prior-1', status: 'user_stated',
    }],
    preferences: [{
      id: 'preference-terracotta', text: '喜欢陶土色', quote: '喜欢陶土色', objectIds: ['object-sofa'],
      kind: 'preference', sourceTurnId: 'prior-1', status: 'user_stated',
    }],
  };
  const result = await runDesignDialogue({
    store: initial,
    requirements,
    input: '把沙发改成亚麻色。',
    requestId: 'turn-missing-choice-review',
    maxSteps: 1,
    provider: async () => ({
      action: 'preview', assistantReply: '把沙发改成亚麻色。', requirementsPatch: blankPatch(),
      toolCalls: [{ tool: 'set_object_material', args: { objectId: 'object-sofa', materialId: 'mat-flex-accent-fabric' } }],
      reasons: [], providerTrace,
    }),
  });
  assert.equal(result.trace.mode, 'failed');
  assert.equal(result.trace.terminationReason, 'REQUIREMENT_REVIEW_REQUIRED');
  assert.equal(JSON.stringify(result.store.currentScene), before);
  assert.deepEqual(result.trace.toolCalls, []);
});

test('an evidenced supersede replaces only the old color choice and retains unrelated needs and hard constraints', async () => {
  const initial = createSceneStore(createDemoScene());
  const requirements = {
    ...emptyRequirements(),
    confirmed: [{
      id: 'confirmed-rest', text: '客厅要适合休息', quote: '客厅要适合休息', objectIds: [],
      kind: 'preference', sourceTurnId: 'prior-1', status: 'user_stated',
    }],
    preferences: [{
      id: 'preference-terracotta', text: '喜欢陶土色', quote: '喜欢陶土色', objectIds: ['object-sofa'],
      kind: 'preference', sourceTurnId: 'prior-1', status: 'user_stated',
    }],
    hardConstraints: [{
      id: 'keep-desk', text: '工作桌必须保留', quote: '工作桌必须保留', objectIds: ['object-flex-desk'],
      kind: 'preserve_object', sourceTurnId: 'prior-1', status: 'user_stated',
    }],
  };
  const input = '不要陶土色了，沙发改成亚麻色，其他需求保持。';
  const result = await runDesignDialogue({
    store: initial,
    requirements,
    input,
    requestId: 'turn-supersede-one-choice',
    provider: async () => ({
      action: 'preview', assistantReply: '只把沙发从陶土色换成亚麻色。',
      requirementReview: [
        { id: 'confirmed-rest', decision: 'retain', quote: '' },
        { id: 'preference-terracotta', decision: 'supersede', quote: '不要陶土色了' },
      ],
      requirementsPatch: {
        ...blankPatch(),
        preferences: [{
          text: '沙发改成亚麻色', quote: '沙发改成亚麻色', objectIds: ['object-sofa'], kind: 'preference',
        }],
      },
      toolCalls: [{ tool: 'set_object_material', args: { objectId: 'object-sofa', materialId: 'mat-flex-accent-fabric' } }],
      reasons: [{ requirementText: '沙发改成亚麻色', fact: '沙发支持软包材质', objectIds: ['object-sofa'], tradeoff: '只调整材质', sourceIds: [] }],
      providerTrace,
    }),
  });
  assert.equal(result.trace.terminationReason, 'legal_preview');
  assert.equal(result.requirements.confirmed.some(item => item.id === 'confirmed-rest'), true);
  assert.equal(result.requirements.preferences.some(item => item.id === 'preference-terracotta'), false);
  assert.equal(result.requirements.rejected.some(item => item.id === 'preference-terracotta'
    && item.quote === '不要陶土色了'), true);
  assert.equal(result.requirements.preferences.some(item => item.text === '沙发改成亚麻色'), true);
  assert.equal(result.requirements.hardConstraints.some(item => item.id === 'keep-desk'
    && item.kind === 'preserve_object'), true);
  assert.equal(result.store.currentScene.objects.some(object => object.id === 'object-flex-desk'), true);
  assert.equal(result.store.currentScene.objects.find(object => object.id === 'object-sofa').materialId, 'mat-flex-accent-fabric');
});

test('an illegal first candidate is atomically rejected and is not reported as a completed final tool', async () => {
  const initial = createSceneStore(createDemoScene());
  const desk = initial.currentScene.objects.find(object => object.id === 'object-flex-desk');
  const requirements = {
    ...emptyRequirements(),
    hardConstraints: [
      { id: 'keep-desk', text: '工作桌必须保留', quote: '工作桌必须保留', objectIds: [desk.id], kind: 'preserve_object', sourceTurnId: 'prior', status: 'user_stated' },
      { id: 'no-large', text: '不新增大件', quote: '不新增大件', objectIds: [], kind: 'no_new_objects', sourceTurnId: 'prior', status: 'user_stated' },
    ],
  };
  let calls = 0;
  const currentNeedId = 'turn-atomic-retry-confirmed-0';
  const result = await runDesignDialogue({
    store: initial,
    requirements,
    input: '做一个不动大件的温暖小调整。',
    requestId: 'turn-atomic-retry',
    provider: async () => {
      calls += 1;
      if (calls === 1) return {
        action: 'preview', assistantReply: '先删掉桌子。',
        requirementReview: [{ id: currentNeedId, decision: 'retain', quote: '' }],
        requirementsPatch: {
          ...blankPatch(),
          confirmed: [{ text: '做温暖小调整', quote: '温暖小调整', objectIds: [], kind: 'preference' }],
        },
        toolCalls: [{ tool: 'delete_object', args: { objectId: 'object-flex-desk' } }],
        reasons: [{ requirementId: currentNeedId, requirementText: '做温暖小调整', fact: '工作桌可删除', objectIds: ['object-flex-desk'], tradeoff: '删除桌子', sourceIds: [] }],
        providerTrace,
      };
      return {
        action: 'preview', assistantReply: '保留家具，只试一处更温暖的墙面。',
        requirementReview: [{ id: currentNeedId, decision: 'retain', quote: '' }],
        requirementsPatch: {
          ...blankPatch(),
          confirmed: [{ text: '做温暖小调整', quote: '温暖小调整', objectIds: [], kind: 'preference' }],
        },
        toolCalls: [{ tool: 'set_surface_material', args: { surfaceId: 'surface-wall-living-south', materialId: 'mat-wall-greige' } }],
        reasons: [{ requirementId: currentNeedId, requirementText: '做温暖小调整', fact: '客厅南墙可编辑', objectIds: [], tradeoff: '仅改墙面', sourceIds: [] }], providerTrace,
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.store.currentScene.objects.some(object => object.id === desk.id), true);
  assert.equal(result.store.currentScene.surfaces.find(surface => surface.id === 'surface-wall-living-south').materialId, 'mat-wall-greige');
  assert.deepEqual(result.trace.toolCalls, [
    { tool: 'set_surface_material', args: { surfaceId: 'surface-wall-living-south', materialId: 'mat-wall-greige' } },
  ], 'a rolled-back candidate must not be displayed as a completed tool in the accepted preview');
  assert.equal(result.trace.steps.some(step => step.tool === 'delete_object' && step.ok === true), false,
    'rejected candidate writes must not be labelled complete in user-visible provenance');
});

test('a rejected earlier choice cannot be cited as the basis for a new preview', async () => {
  const initial = createSceneStore(createDemoScene());
  const before = JSON.stringify(initial.currentScene);
  const requirements = {
    ...emptyRequirements(),
    rejected: [{
      id: 'old-terracotta', text: '喜欢陶土色', quote: '不要陶土色了', objectIds: ['object-sofa'],
      kind: 'preference', sourceTurnId: 'prior-correction', status: 'user_stated', reason: '被用户的新选择取代',
    }],
  };
  const result = await runDesignDialogue({
    store: initial,
    requirements,
    input: '沙发改成亚麻色。',
    requestId: 'turn-rejected-reason',
    maxSteps: 1,
    provider: async () => ({
      action: 'preview', assistantReply: '按陶土色偏好调整沙发。',
      requirementsPatch: {
        ...blankPatch(),
        preferences: [{ text: '沙发改成亚麻色', quote: '沙发改成亚麻色', objectIds: ['object-sofa'], kind: 'preference' }],
      },
      toolCalls: [{ tool: 'set_object_material', args: { objectId: 'object-sofa', materialId: 'mat-flex-accent-fabric' } }],
      reasons: [{ requirementId: 'old-terracotta', requirementText: '喜欢陶土色', fact: '沙发可换材质', objectIds: ['object-sofa'], tradeoff: '仅改材质', sourceIds: [] }],
      providerTrace,
    }),
  });
  assert.equal(result.trace.mode, 'failed');
  assert.equal(result.trace.terminationReason, 'REJECTED_REQUIREMENT_CITED');
  assert.equal(JSON.stringify(result.store.currentScene), before);
  assert.deepEqual(result.trace.toolCalls, []);
});

test('provider failure returns a failed trace and preserves the exact scene', async () => {
  const initial = createSceneStore(createDemoScene());
  const before = JSON.stringify(initial.currentScene);
  await assert.rejects(
    runDesignDialogue({
      store: initial,
      input: '想高级一点但说上来。',
      requestId: 'turn-provider-down',
      provider: async () => {
        const error = new Error('DEEPSEEK_API_UNAVAILABLE');
        error.retryable = false;
        throw error;
      },
    }),
    error => {
      assert.equal(error.message, 'DEEPSEEK_API_UNAVAILABLE');
      assert.equal(error.trace.source, 'provider');
      assert.equal(error.trace.terminationReason, 'DEEPSEEK_API_UNAVAILABLE');
      return true;
    },
  );
  assert.equal(JSON.stringify(initial.currentScene), before);
});

test('fabric finishes remain available to upholstery but are rejected for hard tables', () => {
  const initial = createSceneStore(createDemoScene());
  assert.throws(() => dispatchSceneCommand(initial, {
    type: 'object.setMaterial', objectId: 'object-coffee-table', materialId: 'mat-fabric-warm-gray',
  }), /OBJECT_MATERIAL_INCOMPATIBLE/);
  const upholstered = dispatchSceneCommand(initial, {
    type: 'object.setMaterial', objectId: 'object-sofa', materialId: 'mat-flex-accent-fabric',
  });
  assert.equal(upholstered.currentScene.objects.find(object => object.id === 'object-sofa').materialId, 'mat-flex-accent-fabric');
});

test('outcome HTTP replay is idempotent and a failed Feishu sync stays recoverable without losing the linked version', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'opai-outcome-http-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = createExperienceStore({ directory: join(directory, 'projects') });
  const project = store.create();
  const readProject = () => store.read(project.projectId, project.accessToken);
  const versionContext = async ({ projectId, versionId }) => {
    if (projectId !== project.projectId) return { exists: false, saved: false, currentVersionId: null };
    const history = deserializeVersionHistory(readProject().versionHistory);
    return {
      exists: history.versions.some(version => version.id === versionId),
      saved: true,
      currentVersionId: history.currentVersionId,
    };
  };
  let failOutcomeSync = true;
  const family = createFamilyDiscussionService({
    filePath: join(directory, 'family.json'),
    getVersionContext: versionContext,
    syncEvent: async event => {
      if (event.type === 'family_adjustment_version_linked' && failOutcomeSync) throw Error('FEISHU_OUTCOME_TEST_DOWN');
      return { recordId: `rec-${event.eventId}`, recordUrl: 'https://example.feishu.cn/base/OutcomeTest', verifiedAt: '2026-09-09T12:00:00.000Z' };
    },
    summarizeProvider: async () => {
      const summary = { assistantReply: '保留工作桌。', toolCalls: [], agreed: ['保留工作桌'], conflicts: [], questions: [] };
      Object.defineProperty(summary, 'providerTrace', { value: { provider: 'aily_test_double', chatId: 'no-paid-call' } });
      return summary;
    },
  });

  const baseHistory = deserializeVersionHistory(readProject().versionHistory);
  const baseVersionId = baseHistory.currentVersionId;
  const discussion = await family.createDiscussion({
    projectId: project.projectId, versionId: baseVersionId, brief: {}, participants: [], eventId: 'create-outcome-http',
  });
  await family.submitOpinion({
    discussionId: discussion.id, versionId: baseVersionId, opinionId: 'opinion-outcome-http', eventId: 'opinion-outcome-http',
    source: { kind: 'isolated_test', sourceId: 'outcome-http', memberLabel: '测试填写者' }, text: '工作桌必须保留。',
  });
  const summary = await family.summarizeDiscussion({ discussionId: discussion.id, versionId: baseVersionId, eventId: 'summary-outcome-http' });
  await family.adoptDecision({
    discussionId: discussion.id, versionId: baseVersionId, selectedItemIds: [summary.items[0].id], eventId: 'adopt-outcome-http',
  });

  let working = sceneStoreForVersion(baseHistory);
  working = dispatchSceneCommand(working, {
    type: 'object.setMaterial', objectId: 'object-sofa', materialId: 'mat-object-warm-white',
  });
  const savedHistory = saveSceneVersion(baseHistory, working, { source: 'agent', summary: 'outcome-http-test' });
  await store.save(project.projectId, project.accessToken, {
    requestId: 'save-outcome-http', expectedRevision: 0, versionHistory: serializeVersionHistory(savedHistory),
  });
  const outcomeVersionId = savedHistory.currentVersionId;

  const server = createAppServer({ experienceHandler: createExperienceRoutes({ store, family, provider: async () => providerResult({ action: 'unsupported', assistantReply: 'unused' }) }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const endpoint = `http://127.0.0.1:${server.address().port}/api/experience/projects/${project.projectId}/discussions/${discussion.id}`;
  const headers = { authorization: `Bearer ${project.accessToken}`, 'content-type': 'application/json' };
  const payload = { eventId: 'outcome-http-event', baseVersionId, outcomeVersionId };

  const first = await fetch(`${endpoint}/outcome`, { method: 'POST', headers, body: JSON.stringify(payload) });
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.discussion.outcomeVersionId, outcomeVersionId);
  assert.equal(firstBody.discussion.feishuSync.status, 'pending');
  assert.equal(firstBody.discussion.feishuSync.pending, 1);

  const replay = await fetch(`${endpoint}/outcome`, { method: 'POST', headers, body: JSON.stringify(payload) });
  const replayBody = await replay.json();
  assert.equal(replay.status, 200);
  assert.equal(replayBody.discussion.outcomeVersionId, outcomeVersionId);
  assert.equal(replayBody.discussion.feishuSync.pending, 1, 'replay must not duplicate or lose the pending external event');

  const rejected = await fetch(`${endpoint}/outcome`, {
    method: 'POST', headers, body: JSON.stringify({ ...payload, eventId: 'outcome-http-wrong-base', baseVersionId: 'version-wrong' }),
  });
  assert.equal(rejected.status, 400);
  assert.equal((await rejected.json()).error, 'OUTCOME_BASE_VERSION_MISMATCH');
  assert.equal(family.getDiscussion(discussion.id).outcomeVersionId, outcomeVersionId);

  failOutcomeSync = false;
  const synced = await fetch(`${endpoint}/sync`, {
    method: 'POST', headers, body: JSON.stringify({ versionId: baseVersionId, eventId: 'sync-outcome-http' }),
  });
  const syncedBody = await synced.json();
  assert.equal(synced.status, 200);
  assert.equal(syncedBody.discussion.feishuSync.status, 'synced');
  assert.equal(syncedBody.discussion.feishuSync.pending, 0);
  assert.equal(syncedBody.discussion.outcomeVersionId, outcomeVersionId);
});
