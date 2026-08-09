import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentTurn } from '../src/agent/harness.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { evaluateDesignRules } from '../src/domain/design-rules.js';
import { compareDesignImpact } from '../src/domain/design-impact.js';
import { createSceneStore, dispatchSceneCommand } from '../src/domain/scene.js';

const primaryObjectIds = ['object-primary-bed', 'object-primary-wardrobe'];

test('Gate 10A main bedroom is a complete same-scene room slice', () => {
  const scene = createDemoScene();
  const room = scene.rooms.find((candidate) => candidate.id === 'room-primary-bedroom');
  const objects = scene.objects.filter((object) => object.roomId === room.id);
  const presets = room.cameraPresetIds.map((id) => scene.cameraPresets.find((preset) => preset.id === id));

  assert.deepEqual(objects.map((object) => object.id), primaryObjectIds);
  assert.deepEqual(presets.map((preset) => preset.kind), ['room_overhead', 'room_entry', 'surface_feature']);
  assert.equal(objects.every((object) => object.capabilities.selectable), true);
  assert.equal(objects.find((object) => object.id === 'object-primary-bed').capabilities.movable, true);
  assert.equal(objects.find((object) => object.id === 'object-primary-wardrobe').capabilities.materialEditable, true);
  assert.equal(objects.find((object) => object.id === 'object-primary-wardrobe').capabilities.parameterEditable, true);

  const bedroomViolations = evaluateDesignRules(scene).violations
    .filter((check) => check.objectIds.some((id) => primaryObjectIds.includes(id)));
  assert.deepEqual(bedroomViolations, []);
});

test('Gate 10A bed movement creates a real bedside review signal', () => {
  const store = createSceneStore(createDemoScene());
  const moved = dispatchSceneCommand(store, {
    type: 'object.setTransform',
    objectId: 'object-primary-bed',
    transform: { x: 1400 },
  });
  const warning = evaluateDesignRules(moved.currentScene).violations.find((check) => (
    check.code === 'CLEARANCE_OCCUPIED' &&
    check.clearanceZoneId === 'clearance-primary-bedside' &&
    check.objectIds.includes('object-primary-bed')
  ));

  assert.equal(warning.status, 'warning');
  assert.equal(warning.minimumMm, 600);
  assert.match(warning.message, /床侧净距/);
});

test('Gate 10A Agent operates the selected bedroom objects through existing tools', async () => {
  const store = createSceneStore(createDemoScene());
  const moved = await runAgentTurn({ store, input: '双人床向左移动10厘米', selectedObjectId: 'object-primary-bed' });
  const recolored = await runAgentTurn({ store, input: '衣柜改成暖白色', selectedObjectId: 'object-primary-wardrobe' });

  assert.equal(moved.store.currentScene.objects.find((object) => object.id === 'object-primary-bed').transform.x, 1400);
  assert.deepEqual(moved.trace.toolCalls.map((call) => call.tool), ['move_object']);
  assert.equal(recolored.store.currentScene.objects.find((object) => object.id === 'object-primary-wardrobe').materialId, 'mat-wall-warm-white');
  assert.deepEqual(recolored.trace.toolCalls.map((call) => call.tool), ['set_object_material']);
});

test('Gate 10A room rule checks stay inside the main bedroom', async () => {
  const result = await runAgentTurn({ store: createSceneStore(createDemoScene()), input: '检查主卧当前规则' });
  const check = result.trace.steps.find((step) => step.tool === 'check_rules').result;

  assert.equal(check.status, 'passed');
  assert.equal(check.checks.length > 0, true);
  assert.equal(check.checks.some((item) => item.objectIds.includes('object-shoe-cabinet')), false);
  assert.equal(check.checks.some((item) => item.objectIds.some((id) => primaryObjectIds.includes(id))), true);
});

test('Gate 10A wardrobe sizing produces an honest storage estimate', () => {
  const before = createDemoScene();
  const store = dispatchSceneCommand(createSceneStore(before), {
    type: 'object.setDimensions',
    objectId: 'object-primary-wardrobe',
    dimensions: { width: 2200, depth: 600, height: 2400 },
  });
  const storage = compareDesignImpact(before, store.currentScene).impacts.find((impact) => impact.kind === 'storage_capacity');

  assert.equal(storage.source, 'estimate');
  assert.equal(storage.deltaM3, -0.29);
});
