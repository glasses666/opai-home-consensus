import { approveReview } from '../test-support/quality-review-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { emptyRequirements, runDesignDialogue } from '../src/agent/dialogue.js';
import { createReferenceHome } from '../src/domain/reference-home.js';
import { createSceneStore } from '../src/domain/scene.js';

const providerTrace = { provider: 'deterministic-qa', model: 'relative-boundary-fixture' };
const blankPatch = () => ({
  hypotheses: [], confirmed: [], hardConstraints: [], preferences: [], unresolved: [], retract: [],
});

const preview = (input, toolCalls, extra = {}) => ({
  action: 'preview',
  assistantReply: '只调整茶几，先预览再决定。',
  hypothesisReview: [],
  requirementReview: [],
  constraintReview: [],
  requirementsPatch: {
    ...blankPatch(),
    confirmed: [{
      text: input,
      quote: input,
      kind: 'preference',
      objectIds: ['object-coffee-table'],
    }],
  },
  toolCalls,
  reasons: [],
  providerTrace,
  ...extra,
});

const sceneDistance = (scene, objectId, referenceObjectId) => {
  const object = scene.objects.find((item) => item.id === objectId);
  const reference = scene.objects.find((item) => item.id === referenceObjectId);
  return Math.hypot(
    object.transform.x - reference.transform.x,
    object.transform.z - reference.transform.z,
  );
};

test('a raw coordinate write cannot precede a matching relation observation in one batch', async () => {
  const initial = createSceneStore(createReferenceHome());
  const before = JSON.stringify(initial.currentScene);
  const input = '茶几向餐桌靠近一点';
  const result = await runDesignDialogue({reviewProvider:approveReview,
    store: initial,
    input,
    requestId: 'qa-relative-write-before-read',
    maxSteps: 1,
    provider: async () => preview(input, [
      { tool: 'move_object', args: { objectId: 'object-coffee-table', dz: 200 } },
      {
        tool: 'inspect_spatial_relation',
        args: { objectId: 'object-coffee-table', referenceObjectId: 'object-dining-table' },
      },
    ]),
  });

  assert.equal(result.trace.mode, 'failed');
  assert.match(result.trace.terminationReason, /RELATIVE_MOVE_TOOL_REQUIRED/);
  assert.equal(JSON.stringify(result.store.currentScene), before);
  assert.equal(result.trace.toolCalls.length, 0);
  assert.equal(result.trace.steps.find((step) => step.tool === 'move_object')?.ok, false);
});

test('an observed relation for one reference cannot authorize a move relative to another reference', async () => {
  const initial = createSceneStore(createReferenceHome());
  const before = JSON.stringify(initial.currentScene);
  const input = '茶几离主卧床远一点';
  const result = await runDesignDialogue({reviewProvider:approveReview,
    store: initial,
    input,
    requestId: 'qa-relative-wrong-reference',
    maxSteps: 1,
    provider: async () => preview(input, [
      {
        tool: 'inspect_spatial_relation',
        args: { objectId: 'object-coffee-table', referenceObjectId: 'object-dining-table' },
      },
      {
        tool: 'move_relative_to_object',
        args: {
          objectId: 'object-coffee-table',
          referenceObjectId: 'object-primary-bed',
          relation: 'away',
          distanceMm: 100,
        },
      },
    ]),
  });

  assert.equal(result.trace.mode, 'failed');
  assert.match(result.trace.terminationReason, /RELATIVE_OBSERVATION_REQUIRED/);
  assert.equal(JSON.stringify(result.store.currentScene), before);
  assert.equal(result.trace.toolCalls.length, 0);
  assert.equal(result.trace.steps.find((step) => step.tool === 'inspect_spatial_relation')?.ok, true);
  assert.equal(result.trace.steps.find((step) => step.tool === 'move_relative_to_object')?.ok, false);
});

test('the exact observed object/reference pair permits a deterministic relative preview', async () => {
  const initial = createSceneStore(createReferenceHome());
  const input = '茶几向餐桌靠近一点';
  const beforeDistance = sceneDistance(
    initial.currentScene,
    'object-coffee-table',
    'object-dining-table',
  );
  const result = await runDesignDialogue({reviewProvider:approveReview,
    store: initial,
    input,
    requestId: 'qa-relative-exact-pair',
    maxSteps: 1,
    provider: async () => preview(input, [
      {
        tool: 'inspect_spatial_relation',
        args: { objectId: 'object-coffee-table', referenceObjectId: 'object-dining-table' },
      },
      {
        tool: 'move_relative_to_object',
        args: {
          objectId: 'object-coffee-table',
          referenceObjectId: 'object-dining-table',
          relation: 'toward',
          distanceMm: 200,
        },
      },
    ]),
  });

  assert.equal(result.trace.mode, 'execute');
  assert.equal(result.trace.terminationReason, 'legal_preview');
  assert.deepEqual(result.trace.toolCalls, [{
    tool: 'move_relative_to_object',
    args: {
      objectId: 'object-coffee-table',
      referenceObjectId: 'object-dining-table',
      relation: 'toward',
      distanceMm: 200,
    },
  }]);
  assert.ok(sceneDistance(
    result.store.currentScene,
    'object-coffee-table',
    'object-dining-table',
  ) < beforeDistance);
  assert.equal(result.store.cursor - initial.cursor, 1);
});

test('repairing a legacy all-furniture position lock cannot narrow it to one object', async () => {
  const initial = createSceneStore(createReferenceHome());
  const before = JSON.stringify(initial.currentScene);
  const legacy = {
    ...emptyRequirements(),
    hardConstraints: [{
      id: 'legacy-lock-every-position',
      text: '所有家具位置不动',
      quote: '所有家具位置不动',
      objectIds: [],
      kind: 'no_new_objects',
      sourceTurnId: 'legacy-turn',
      status: 'user_stated',
    }],
  };
  const input = '茶几向餐桌靠近一点';
  const result = await runDesignDialogue({reviewProvider:approveReview,
    store: initial,
    requirements: legacy,
    input,
    requestId: 'qa-legacy-all-scope',
    maxSteps: 1,
    provider: async () => preview(input, [{
      tool: 'move_relative_to_object',
      args: {
        objectId: 'object-coffee-table',
        referenceObjectId: 'object-dining-table',
        relation: 'toward',
        distanceMm: 200,
      },
    }], {
      constraintReview: [{
        id: 'legacy-lock-every-position',
        kind: 'lock_transform',
        objectIds: ['object-sofa'],
      }],
    }),
  });

  assert.equal(result.trace.mode, 'failed');
  assert.match(result.trace.terminationReason, /LEGACY_CONSTRAINT_SCOPE_NARROWED/);
  assert.equal(JSON.stringify(result.store.currentScene), before);
  assert.equal(result.trace.toolCalls.length, 0);
});
