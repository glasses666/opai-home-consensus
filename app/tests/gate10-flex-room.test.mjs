import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentTurn } from '../src/agent/harness.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { evaluateDesignRules } from '../src/domain/design-rules.js';
import { compareDesignImpact } from '../src/domain/design-impact.js';
import { createSceneStore, dispatchSceneCommand } from '../src/domain/scene.js';

const flexObjectIds = ['object-flex-bed', 'object-flex-desk', 'object-flex-floating-shelf'];
const objectById = (scene, id) => scene.objects.find((object) => object.id === id);

test('Gate 10B flex room is a complete same-scene child study slice', () => {
  const scene = createDemoScene();
  const room = scene.rooms.find((candidate) => candidate.id === 'room-flex');
  const objects = scene.objects.filter((object) => object.roomId === room.id);
  const presets = room.cameraPresetIds.map((id) => scene.cameraPresets.find((preset) => preset.id === id));
  const zones = scene.clearanceZones.filter((zone) => zone.roomId === room.id);

  assert.deepEqual(objects.map((object) => object.id), flexObjectIds);
  assert.deepEqual(presets.map((preset) => preset.kind), ['room_overhead', 'room_entry', 'surface_feature']);
  assert.equal(objectById(scene, 'object-flex-bed').capabilities.parameterEditable, true);
  assert.equal(objectById(scene, 'object-flex-desk').capabilities.movable, true);
  assert.deepEqual(zones.map((zone) => zone.id).sort(), ['clearance-flex-activity', 'clearance-flex-bedside']);
  assert.deepEqual(evaluateDesignRules(scene).violations.filter((check) => check.objectIds.some((id) => flexObjectIds.includes(id))), []);
});

test('Gate 10B flex edits create child-room review signals', () => {
  const before = createDemoScene();
  const movedBed = dispatchSceneCommand(createSceneStore(before), {
    type: 'object.setTransform',
    objectId: 'object-flex-bed',
    transform: { x: 7900 },
  });
  const movedDesk = dispatchSceneCommand(createSceneStore(before), {
    type: 'object.setTransform',
    objectId: 'object-flex-desk',
    transform: { x: 10300 },
  });

  for (const scene of [movedBed.currentScene, movedDesk.currentScene]) {
    const warning = evaluateDesignRules(scene).violations.find((check) => check.clearanceZoneId === 'clearance-flex-activity');
    assert.equal(warning.status, 'warning');
    assert.match(warning.message, /成长活动留白/);
  }

  const impact = compareDesignImpact(before, movedBed.currentScene).impacts.find((item) => item.clearanceZoneId === 'clearance-flex-activity');
  assert.equal(impact.afterStatus, 'warning');
  assert.equal(impact.minimumMm, 1600);
});

test('Gate 10B Agent resolves generic bed names by active room context', async () => {
  const flex = await runAgentTurn({ store: createSceneStore(createDemoScene()), input: '床向右移动20厘米', selectedObjectId: 'room-flex' });
  const primary = await runAgentTurn({ store: createSceneStore(createDemoScene()), input: '床向左移动10厘米', selectedObjectId: 'room-primary-bedroom' });

  assert.equal(objectById(flex.store.currentScene, 'object-flex-bed').transform.x, 7900);
  assert.equal(objectById(flex.store.currentScene, 'object-primary-bed').transform.x, 1500);
  assert.deepEqual(flex.trace.toolCalls.map((call) => call.args.objectId), ['object-flex-bed']);

  assert.equal(objectById(primary.store.currentScene, 'object-primary-bed').transform.x, 1400);
  assert.equal(objectById(primary.store.currentScene, 'object-flex-bed').transform.x, 7700);
  assert.deepEqual(primary.trace.toolCalls.map((call) => call.args.objectId), ['object-primary-bed']);
});

test('Gate 10B room rule checks stay inside the flex room', async () => {
  const result = await runAgentTurn({ store: createSceneStore(createDemoScene()), input: '检查儿童房当前规则', selectedObjectId: 'room-flex' });
  const check = result.trace.steps.find((step) => step.tool === 'check_rules').result;

  assert.equal(check.status, 'passed');
  assert.equal(check.checks.length > 0, true);
  assert.equal(check.checks.some((item) => item.objectIds.includes('object-primary-bed')), false);
  assert.equal(check.checks.some((item) => item.objectIds.includes('object-shoe-cabinet')), false);
  assert.equal(check.checks.some((item) => item.clearanceZoneId === 'clearance-flex-activity'), true);
});
