import assert from 'node:assert/strict';
import test from 'node:test';

import { executeTool, TOOL_REGISTRY } from '../src/agent/harness.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore, serializeScene } from '../src/domain/scene.js';

const freshStore = () => createSceneStore(createDemoScene());
const objectById = (store, id) => store.currentScene.objects.find((object) => object.id === id);

test('spatial tools are exposed with bounded explicit contracts', () => {
  const inspect = TOOL_REGISTRY.find((tool) => tool.name === 'inspect_spatial_relation');
  const move = TOOL_REGISTRY.find((tool) => tool.name === 'move_relative_to_object');
  assert.deepEqual(inspect?.requiredArgs, ['objectId', 'referenceObjectId']);
  assert.equal(inspect?.writes, false);
  assert.deepEqual(move?.requiredArgs, ['objectId', 'referenceObjectId', 'relation', 'distanceMm']);
  assert.equal(move?.writes, true);
});

test('inspect_spatial_relation reports centers using canonical scene axes', async () => {
  const store = freshStore();
  const { result, store: unchanged } = await executeTool(store, {
    tool: 'inspect_spatial_relation',
    args: { objectId: 'object-sofa', referenceObjectId: 'object-dining-table' },
  });

  assert.equal(unchanged, store);
  assert.deepEqual(result.canonicalAxes, { xPositive: 'east', zPositive: 'south' });
  assert.deepEqual(result.deltaMm, { x: -4000, z: -400 });
  assert.deepEqual(result.axisDirections, { x: 'west', z: 'north' });
  assert.equal(result.relativeDirection, 'north-west');
  assert.equal(result.centerDistanceMm, 4020);
  assert.equal(result.measurement, 'center_to_center');
  assert.equal(result.caveat, 'CENTER_DISTANCE_IS_NOT_CLEARANCE_WIDTH');
});

test('move_relative_to_object moves toward and away by deterministic integer millimeters', async () => {
  const store = freshStore();
  const toward = await executeTool(store, {
    tool: 'move_relative_to_object',
    args: { objectId: 'object-sofa', referenceObjectId: 'object-dining-table', relation: 'toward', distanceMm: 200 },
  });
  const away = await executeTool(store, {
    tool: 'move_relative_to_object',
    args: { objectId: 'object-sofa', referenceObjectId: 'object-dining-table', relation: 'away', distanceMm: 200 },
  });

  assert.deepEqual(toward.result.appliedDeltaMm, { x: 199, z: 20 });
  assert.deepEqual(away.result.appliedDeltaMm, { x: -199, z: -20 });
  assert.deepEqual(objectById(toward.store, 'object-sofa').transform, { ...objectById(store, 'object-sofa').transform, x: 2399, z: 5220 });
  assert.deepEqual(objectById(away.store, 'object-sofa').transform, { ...objectById(store, 'object-sofa').transform, x: 2001, z: 5180 });
  assert.equal(toward.store.commands.at(-1).type, 'object.setTransform');
  assert.equal(away.store.commands.at(-1).type, 'object.setTransform');
});

test('relative movement rejects invalid distance, relation, object identities, and overlapping centers', async () => {
  const store = freshStore();
  const call = (args) => executeTool(store, { tool: 'move_relative_to_object', args });
  const base = { objectId: 'object-sofa', referenceObjectId: 'object-dining-table', relation: 'toward', distanceMm: 200 };

  for (const distanceMm of [0, -1, 1.5, 5001, Number.NaN]) {
    await assert.rejects(call({ ...base, distanceMm }), /ARG_INVALID: distanceMm/);
  }
  await assert.rejects(call({ ...base, relation: 'beside' }), /ARG_INVALID: relation/);
  await assert.rejects(call({ ...base, distanceMm: 4020 }), /SPATIAL_DISTANCE_REACHES_OR_CROSSES_REFERENCE/);
  await assert.rejects(call({ ...base, force: true }), /TOOL_CALL_INVALID/);
  await assert.rejects(call({ ...base, referenceObjectId: 'object-missing' }), /REFERENCE_OBJECT_NOT_FOUND/);
  await assert.rejects(call({ ...base, objectId: 'object-missing' }), /OBJECT_NOT_FOUND/);
  await assert.rejects(call({ ...base, referenceObjectId: 'object-sofa' }), /SPATIAL_SAME_OBJECT/);

  const overlappingStore = structuredClone(store);
  const reference = overlappingStore.currentScene.objects.find((object) => object.id === 'object-dining-table');
  const object = overlappingStore.currentScene.objects.find((candidate) => candidate.id === 'object-sofa');
  object.transform.x = reference.transform.x;
  object.transform.z = reference.transform.z;
  await assert.rejects(
    executeTool(overlappingStore, { tool: 'move_relative_to_object', args: base }),
    /SPATIAL_CENTERS_OVERLAP/,
  );
});

test('collision rejection from relative movement leaves the original store unchanged', async () => {
  const store = freshStore();
  const before = serializeScene(store.currentScene);
  await assert.rejects(
    executeTool(store, {
      tool: 'move_relative_to_object',
      args: { objectId: 'object-sofa', referenceObjectId: 'object-dining-table', relation: 'toward', distanceMm: 2500 },
    }),
    /DESIGN_RULE_BLOCKED:.*(?:CLEARANCE_OCCUPIED|OBJECT_COLLISION)/,
  );
  assert.equal(serializeScene(store.currentScene), before);
  assert.equal(store.commands.length, 0);
});
