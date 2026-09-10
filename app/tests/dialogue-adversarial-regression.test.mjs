import assert from 'node:assert/strict';
import test from 'node:test';

import { createExperienceScene } from '../server/experience-store.mjs';
import { emptyRequirements, runDesignDialogue } from '../src/agent/dialogue.js';
import { createSceneStore, serializeScene } from '../src/domain/scene.js';

const providerTrace = { provider: 'deepseek', model: 'deepseek-flash', requestedModel: 'deepseek-v4-flash' };
const blankPatch = () => ({
  hypotheses: [], confirmed: [], hardConstraints: [], preferences: [], unresolved: [], retract: [],
});
const response = (overrides = {}) => ({
  action: 'answer',
  assistantReply: '已根据当前场景完成检查。',
  hypothesisReview: [],
  requirementReview: [],
  constraintReview: [],
  requirementsPatch: blankPatch(),
  toolCalls: [],
  reasons: [],
  providerTrace,
  ...overrides,
});
const freshStore = () => createSceneStore(createExperienceScene());

test('a read-only turn observes and then ends with a factual answer without persisting procedural text', async () => {
  const store = freshStore();
  const before = serializeScene(store.currentScene);
  const input = '如果把沙发往右挪会挡门，那就不要动它；先检查，不要预览。';
  let calls = 0;
  const result = await runDesignDialogue({
    store,
    input,
    requestId: 'adversarial-read-only-answer',
    provider: async () => {
      calls += 1;
      if (calls === 1) {
        return response({
          action: 'observe',
          assistantReply: '先检查沙发与门洞及规则。',
          requirementsPatch: {
            ...blankPatch(),
            hardConstraints: [
              {
                text: '先检查，不要预览', quote: '先检查，不要预览',
                kind: 'lock_transform', objectIds: ['object-sofa'],
              },
              {
                text: '如果右移挡门则锁定沙发位置', quote: '如果把沙发往右挪会挡门，那就不要动它',
                kind: 'lock_transform', objectIds: ['object-sofa'],
              },
            ],
          },
          toolCalls: [
            { tool: 'inspect_object', args: { objectId: 'object-sofa' } },
            { tool: 'check_rules', args: { objectId: 'object-sofa' } },
          ],
        });
      }
      return response({
        assistantReply: '检查完成：当前规则没有授权本轮移动；我没有生成预览，房间保持原样。',
      });
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.trace.terminationReason, 'answer');
  assert.equal(result.trace.mode, 'propose');
  assert.equal(serializeScene(result.store.currentScene), before);
  assert.equal(result.requirements.hardConstraints.length, 0,
    'a one-turn request to inspect without preview is not a persistent design constraint');
  assert.equal(result.trace.steps.some(step => step.tool === 'inspect_object' && step.ok), true);
  assert.deepEqual(result.trace.toolCalls, []);
});

test('a distance-free counterfactual cannot be reported as a certain collision result', async () => {
  const store = freshStore();
  const input = '如果把沙发往右挪会挡门，那就不要动它；先检查，不要预览。';
  const prompts = [];
  const result = await runDesignDialogue({
    store,
    input,
    requestId: 'adversarial-counterfactual-magnitude',
    provider: async ({ prompt }) => {
      prompts.push(prompt);
      return prompts.length === 1
        ? response({ assistantReply: '往右挪确实一定会挡门，所以我没有修改。' })
        : response({
          action: 'clarify',
          assistantReply: '你没有给出移动幅度，目前无法判断是否挡门；计划往右挪多少毫米？',
          question: '计划往右挪多少毫米？',
        });
    },
  });

  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /COUNTERFACTUAL_MAGNITUDE_REQUIRED/);
  assert.equal(result.trace.mode, 'clarify');
  assert.equal(result.trace.terminationReason, 'clarify');
  assert.deepEqual(result.trace.toolCalls, []);
});

test('a distance-free counterfactual cannot invent a derived clearance or movement limit', async () => {
  const store = freshStore();
  const input = '只判断一下：如果把客厅沙发再往电视墙方向推一些，会不会挡住主要通道？先不要修改；信息不足就直说，不要猜。';
  const prompts = [];
  const result = await runDesignDialogue({
    store,
    input,
    requestId: 'adversarial-counterfactual-derived-metric',
    provider: async ({ prompt }) => {
      prompts.push(prompt);
      return prompts.length === 1
        ? response({ assistantReply: '沙发往电视墙方向最多还能推430毫米，但是否挡路暂时无法判断。' })
        : response({
          action: 'clarify',
          assistantReply: '目前没有假设位移的验证结果，无法判断是否挡住通道。',
          question: '你计划把沙发移动多远？',
          requirementsPatch: {
            ...blankPatch(),
            hardConstraints: [{
              text: '本轮只检查、不修改沙发', quote: '先不要修改',
              kind: 'lock_transform', objectIds: ['object-sofa'],
            }],
          },
        });
    },
  });

  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /COUNTERFACTUAL_UNVALIDATED_METRIC/);
  assert.equal(result.trace.mode, 'clarify');
  assert.match(result.trace.assistantReply, /你计划把沙发移动多远？/u);
  assert.doesNotMatch(result.trace.assistantReply, /430|mm|毫米/iu);
  assert.deepEqual(result.requirements.hardConstraints, []);
  assert.deepEqual(result.trace.toolCalls, []);
});

test('contradictory movement instructions cannot write or become persisted requirements', async () => {
  const store = freshStore();
  const before = serializeScene(store.currentScene);
  const input = '把茶几往餐桌靠近200毫米，但所有家具位置都不动。';
  let calls = 0;
  const prompts = [];
  const result = await runDesignDialogue({
    store,
    input,
    requestId: 'adversarial-conflict',
    provider: async ({ prompt }) => {
      prompts.push(prompt);
      calls += 1;
      if (calls === 1) {
        return response({
          action: 'preview',
          assistantReply: '把茶几靠近餐桌。',
          requirementsPatch: {
            ...blankPatch(),
            confirmed: [{ text: '茶几靠近餐桌', quote: '把茶几往餐桌靠近200毫米', kind: 'preference', objectIds: ['object-coffee-table'] }],
            hardConstraints: [{ text: '所有家具位置都不动', quote: '所有家具位置都不动', kind: 'lock_transform', objectIds: [] }],
          },
          toolCalls: [{ tool: 'move_relative_to_object', args: {
            objectId: 'object-coffee-table', referenceObjectId: 'object-dining-table', relation: 'toward', distanceMm: 200,
          } }],
        });
      }
      return response({
        action: 'clarify',
        assistantReply: '这两项要求互相冲突：要保留“茶几靠近餐桌”，还是保留“所有家具位置不动”？',
        question: '要保留“茶几靠近餐桌”，还是保留“所有家具位置不动”？',
      });
    },
  });

  assert.equal(calls, 2);
  assert.match(prompts[1], /USER_INSTRUCTION_CONFLICT/);
  assert.equal(result.trace.mode, 'clarify');
  assert.equal(serializeScene(result.store.currentScene), before);
  assert.deepEqual(result.requirements.confirmed, []);
  assert.deepEqual(result.requirements.hardConstraints, []);
  assert.deepEqual(result.trace.toolCalls, []);
});

test('a furniture material change cannot override an all-furniture material lock in the same turn', async () => {
  const store = freshStore();
  const before = serializeScene(store.currentScene);
  const input = '沙发换成陶土色，但所有家具材质都保持不变。';
  const prompts = [];
  const result = await runDesignDialogue({
    store,
    input,
    requestId: 'adversarial-material-conflict',
    provider: async ({ prompt }) => {
      prompts.push(prompt);
      if (prompts.length === 1) {
        return response({
          action: 'preview',
          assistantReply: '先换成陶土色。',
          requirementsPatch: {
            ...blankPatch(),
            confirmed: [{ text: '沙发换成陶土色', quote: '沙发换成陶土色', kind: 'preference', objectIds: ['object-sofa'] }],
          },
          toolCalls: [{ tool: 'set_object_material', args: { objectId: 'object-sofa', materialId: 'mat-fabric-clay' } }],
        });
      }
      return response({
        action: 'clarify',
        assistantReply: '这两项要求互相冲突，无法同时执行：要修改沙发材质，还是保持所有家具材质不变？',
        question: '要修改沙发材质，还是保持所有家具材质不变？',
      });
    },
  });

  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /MATERIAL_CHANGE_CONFLICTS_WITH_GLOBAL_MATERIAL_LOCK/);
  assert.equal(result.trace.mode, 'clarify');
  assert.equal(serializeScene(result.store.currentScene), before);
  assert.deepEqual(result.requirements.confirmed, []);
  assert.deepEqual(result.requirements.hardConstraints, []);
});

test('a comma-separated position lock does not become a material lock and expands from the canonical scene', async () => {
  const store = freshStore();
  const input = '客厅颜色太杂。只挑一处材质做预览，别动任何家具位置。';
  const result = await runDesignDialogue({
    store,
    input,
    requestId: 'adversarial-clause-boundary',
    provider: async () => response({
      action: 'preview',
      assistantReply: '只把沙发收敛为暖亚麻织物，家具位置保持不变。',
      requirementsPatch: {
        ...blankPatch(),
        confirmed: [{ text: '客厅颜色太杂', quote: '客厅颜色太杂', kind: 'preference', objectIds: [] }],
        hardConstraints: [{
          text: '别动任何家具位置', quote: '别动任何家具位置',
          kind: 'lock_transform', objectIds: ['object-sofa'],
        }],
      },
      toolCalls: [{ tool: 'set_object_material', args: {
        objectId: 'object-sofa', materialId: 'mat-fabric-linen',
      } }],
    }),
  });

  assert.equal(result.trace.terminationReason, 'legal_preview', JSON.stringify(result.trace.validationFeedback));
  assert.equal(result.requirements.hardConstraints.some(rule => rule.kind === 'lock_material'), false);
  const positionLock = result.requirements.hardConstraints.find(rule => rule.kind === 'lock_transform');
  assert.equal(store.currentScene.objects.every(object => positionLock.objectIds.includes(object.id)), true);
});

test('ignoring the current selection routes this turn without persisting a future lock on that object', async () => {
  const store = freshStore();
  const input = '别管当前选中的沙发，把次卧的床换成暖亚麻；位置保持不变。';
  const result = await runDesignDialogue({
    store,
    input,
    selectedObjectId: 'object-sofa',
    activeRoomId: 'room-living-dining',
    requestId: 'adversarial-transient-selection',
    provider: async () => response({
      action: 'preview',
      assistantReply: '只把次卧床换成暖亚麻，位置不动。',
      requirementsPatch: {
        ...blankPatch(),
        confirmed: [{
          text: '次卧的床换成暖亚麻', quote: '次卧的床换成暖亚麻',
          kind: 'preference', objectIds: ['object-guest-bed'],
        }],
        hardConstraints: [
          {
            text: '次卧床位置保持不变', quote: '位置保持不变',
            kind: 'lock_transform', objectIds: ['object-guest-bed'],
          },
          {
            text: '不处理当前选中的沙发', quote: '别管当前选中的沙发',
            kind: 'lock_material', objectIds: ['object-sofa'],
          },
        ],
      },
      toolCalls: [{ tool: 'set_object_material', args: {
        objectId: 'object-guest-bed', materialId: 'mat-fabric-linen',
      } }],
    }),
  });

  assert.equal(result.trace.terminationReason, 'legal_preview');
  assert.equal(result.store.currentScene.objects.find(object => object.id === 'object-guest-bed').materialId, 'mat-fabric-linen');
  assert.equal(result.requirements.hardConstraints.some(rule => rule.objectIds?.includes('object-sofa')), false);
  assert.equal(result.requirements.hardConstraints.some(rule =>
    rule.kind === 'lock_transform' && rule.objectIds?.includes('object-guest-bed')), true);
});

test('failed and repeated relative moves preserve observations, roll back candidate needs, and permit a smaller repair', async () => {
  const store = freshStore();
  const input = '把儿童房的床离书桌远一点，其他家具的位置都不变。';
  const incompleteLocalScope = ['object-flex-desk', 'object-child-wardrobe'];
  const needs = {
    ...blankPatch(),
    confirmed: [{
      text: '把儿童房的床离书桌远一点', quote: '把儿童房的床离书桌远一点',
      kind: 'preference', objectIds: ['object-flex-bed'],
    }],
    hardConstraints: [{
      text: '其他家具的位置都不变', quote: '其他家具的位置都不变',
      kind: 'lock_transform', objectIds: incompleteLocalScope,
    }],
  };
  let calls = 0;
  const prompts = [];
  const result = await runDesignDialogue({
    store,
    input,
    selectedObjectId: 'object-sofa',
    activeRoomId: 'room-living-dining',
    requestId: 'adversarial-relative-repair',
    maxSteps: 6,
    provider: async ({ prompt }) => {
      prompts.push(prompt);
      calls += 1;
      const base = response({
        action: calls === 2 || calls === 4 ? 'observe' : 'preview',
        assistantReply: calls === 5 ? '只把儿童床远离书桌100毫米，其他家具保持原位。' : '检查并尝试移动儿童床。',
        requirementsPatch: needs,
      });
      if (calls === 2 || calls === 4) {
        return { ...base, toolCalls: [{ tool: 'inspect_spatial_relation', args: {
          objectId: 'object-flex-bed', referenceObjectId: 'object-flex-desk',
        } }] };
      }
      return { ...base, toolCalls: [{ tool: 'move_relative_to_object', args: {
        objectId: 'object-flex-bed', referenceObjectId: 'object-flex-desk',
        relation: 'away', distanceMm: calls === 5 ? 100 : 200,
      } }] };
    },
  });

  assert.equal(calls, 5, JSON.stringify({
    mode: result.trace.mode,
    terminationReason: result.trace.terminationReason,
    validation: result.trace.validationFeedback,
    steps: result.trace.steps,
  }));
  assert.equal(result.trace.terminationReason, 'legal_preview');
  assert.match(prompts[1], /RELATIVE_OBSERVATION_REQUIRED/);
  assert.match(prompts[3], /OBJECT_FOOTPRINT_OUTSIDE_ROOM/);
  assert.match(prompts[4], /REPEATED_TOOL_WITHOUT_NEW_OBSERVATION/);
  assert.deepEqual(result.trace.toolCalls, [{ tool: 'move_relative_to_object', args: {
    objectId: 'object-flex-bed', referenceObjectId: 'object-flex-desk', relation: 'away', distanceMm: 100,
  } }]);
  assert.equal(result.requirements.hardConstraints.some(rule => rule.kind === 'lock_material'), false,
    'position-only preservation must not silently freeze materials');
  assert.equal(result.requirements.hardConstraints.filter(rule => rule.kind === 'lock_transform').length, 1);
  const transformLock = result.requirements.hardConstraints.find(rule => rule.kind === 'lock_transform');
  assert.deepEqual(
    [...transformLock.objectIds].sort(),
    store.currentScene.objects.filter(object => object.id !== 'object-flex-bed').map(object => object.id).sort(),
    'the harness expands an explicit other-furniture scope from the canonical scene instead of asking the model to enumerate every id',
  );
});

test('one preview cannot overwrite the same material repeatedly or claim an unapplied alternative', async () => {
  const store = freshStore();
  const input = '沙发太灰，位置别动，直接用一个现有材质试试。';
  const needs = {
    ...blankPatch(),
    confirmed: [{
      text: '沙发太灰', quote: '沙发太灰', kind: 'preference', objectIds: ['object-sofa'],
    }],
    hardConstraints: [{
      text: '位置别动', quote: '位置别动', kind: 'lock_transform', objectIds: ['object-sofa'],
    }],
  };
  let calls = 0;
  const prompts = [];
  const result = await runDesignDialogue({
    store,
    input,
    requestId: 'adversarial-one-material',
    provider: async ({ prompt }) => {
      prompts.push(prompt);
      calls += 1;
      if (calls === 1) {
        return response({
          action: 'preview',
          assistantReply: '给你同时看暖亚麻织物和陶土织物。',
          requirementsPatch: needs,
          toolCalls: [
            { tool: 'set_object_material', args: { objectId: 'object-sofa', materialId: 'mat-fabric-linen' } },
            { tool: 'set_object_material', args: { objectId: 'object-sofa', materialId: 'mat-fabric-clay' } },
          ],
        });
      }
      return response({
        action: 'preview',
        assistantReply: calls === 2
          ? '这次预览采用暖亚麻织物，也展示陶土织物作为另一版。'
          : '这次只预览暖亚麻织物，沙发位置保持不变。',
        requirementsPatch: needs,
        toolCalls: [{ tool: 'set_object_material', args: { objectId: 'object-sofa', materialId: 'mat-fabric-linen' } }],
      });
    },
  });

  assert.equal(calls, 3);
  assert.match(prompts[1], /DUPLICATE_PROPERTY_WRITE/);
  assert.match(prompts[2], /UNAPPLIED_MATERIAL_CLAIM/);
  assert.equal(result.trace.terminationReason, 'legal_preview');
  assert.equal(result.store.currentScene.objects.find(object => object.id === 'object-sofa').materialId, 'mat-fabric-linen');
  assert.deepEqual(result.trace.toolCalls, [
    { tool: 'set_object_material', args: { objectId: 'object-sofa', materialId: 'mat-fabric-linen' } },
  ]);
  assert.equal(result.requirements.confirmed.length, 1);
  assert.equal(result.requirements.hardConstraints.length, 1);
});

test('missing named fixtures are explicit model facts and invented locations are repaired', async () => {
  const store = freshStore();
  const before = serializeScene(store.currentScene);
  const input = '厨房加个岛台，再把冰箱换到另一边，预算两万内。';
  let calls = 0;
  const prompts = [];
  const result = await runDesignDialogue({
    store,
    input,
    requestId: 'adversarial-missing-fixtures',
    provider: async ({ prompt }) => {
      prompts.push(prompt);
      calls += 1;
      return calls === 1
        ? response({
          action: 'clarify',
          assistantReply: '冰箱现在靠门洞，是否移到靠窗一侧？',
          question: '冰箱现在靠门洞，是否移到靠窗一侧？',
        })
        : response({
          action: 'clarify',
          assistantReply: '当前场景没有岛台和冰箱对象。你说的冰箱是已有但未建模，还是本次想新增？',
          question: '你说的冰箱是已有但未建模，还是本次想新增？',
        });
    },
  });

  const firstContext = JSON.parse(prompts[0].slice(prompts[0].lastIndexOf('\n数据：\n') + '\n数据：\n'.length));
  assert.deepEqual(firstContext.explicitEntityFacts, [
    { label: '冰箱', status: 'not_in_canonical_scene', entityIds: [] },
    { label: '岛台', status: 'not_in_canonical_scene', entityIds: [] },
  ]);
  assert.equal(calls, 2);
  assert.match(prompts[1], /MISSING_ENTITY_LOCATION_INVENTED/);
  assert.equal(result.trace.mode, 'clarify');
  assert.equal(serializeScene(result.store.currentScene), before);
  assert.deepEqual(result.trace.toolCalls, []);
});
