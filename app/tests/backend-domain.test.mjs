import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import { evaluateDesignRules } from '../src/domain/design-rules.js';
import {
  createSceneStore,
  dispatchSceneCommand,
  redoSceneCommand,
  replaySceneCommands,
  serializeScene,
  undoSceneCommand,
} from '../src/domain/scene.js';

const move = (objectId, transform) => ({ type: 'object.setTransform', objectId, transform });

test('command history undoes, redoes, and replays byte-identically', () => {
  const initial = createSceneStore(createDemoScene());
  const moved = dispatchSceneCommand(initial, move('object-sofa', { x: 2400 }));
  const rotated = dispatchSceneCommand(moved, move('object-sofa', { x: 2000 }));
  const undone = undoSceneCommand(rotated);
  const redone = redoSceneCommand(undone);
  const replayed = replaySceneCommands(initial.initialScene, redone.commands.slice(0, redone.cursor));

  assert.equal(serializeScene(undone.currentScene), serializeScene(moved.currentScene));
  assert.equal(serializeScene(redone.currentScene), serializeScene(rotated.currentScene));
  assert.equal(serializeScene(replayed), serializeScene(rotated.currentScene));
});

test('dispatch after undo creates a new branch and clears redo history', () => {
  const initial = createSceneStore(createDemoScene());
  const first = dispatchSceneCommand(initial, move('object-sofa', { x: 2400 }));
  const second = dispatchSceneCommand(first, move('object-sofa', { x: 2000 }));
  const undone = undoSceneCommand(second);
  const branch = dispatchSceneCommand(undone, move('object-sofa', { x: 2100 }));

  assert.equal(branch.commands.length, 2);
  assert.equal(branch.cursor, 2);
  assert.equal(branch.currentScene.objects.find((object) => object.id === 'object-sofa').transform.x, 2100);
  assert.throws(() => redoSceneCommand(branch), /REDO_UNAVAILABLE/);
});

test('object collision is blocked atomically', () => {
  const store = createSceneStore(createDemoScene());

  assert.throws(
    () => dispatchSceneCommand(store, move('object-sofa', { x: 6200, z: 5700 })),
    /OBJECT_COLLISION/,
  );
  assert.equal(store.currentScene.objects.find((object) => object.id === 'object-sofa').transform.x, 2200);
  assert.equal(store.cursor, 0);
});

test('hard circulation clearance is blocked while a warning remains committable', () => {
  const store = createSceneStore(createDemoScene());
  assert.throws(
    () => dispatchSceneCommand(store, move('object-sofa', { x: 4600 })),
    /CLEARANCE_OCCUPIED/,
  );

  const warningStore = dispatchSceneCommand(store, move('object-primary-bed', { x: 1100 }));
  const result = evaluateDesignRules(warningStore.currentScene);
  assert.equal(result.ok, true);
  assert.equal(result.violations.some((violation) => violation.level === 'warning' && violation.objectIds.includes('object-primary-bed')), true);
});
