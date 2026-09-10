import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore, dispatchSceneCommand } from '../src/domain/scene.js';
import { retractUnretainedPreview } from '../src/workbench-session.js';

test('correcting a proposal retracts only that proposal, preserving retained and manual draft commands', () => {
  const initial = createSceneStore(createDemoScene());
  const material = (store, objectId, materialId) => dispatchSceneCommand(store, { type: 'object.setMaterial', objectId, materialId });
  const manual = material(initial, 'object-sofa', 'mat-flex-accent-fabric');
  const retained = material(manual, 'object-dining-chair-n', 'mat-flex-accent-fabric');
  const proposed = material(material(retained, 'object-sofa', 'mat-fabric-warm-gray'), 'object-dining-chair-n', 'mat-fabric-warm-gray');
  const actual = retractUnretainedPreview(proposed, { startCursor: retained.cursor });
  assert.equal(actual.cursor, retained.cursor);
  assert.deepEqual(actual.currentScene, retained.currentScene);
  assert.notDeepEqual(actual.currentScene, initial.currentScene);
  assert.equal(proposed.cursor, retained.cursor + 2, 'retraction never mutates original store');
});

test('no active proposal is a no-op', () => {
  const store = createSceneStore(createDemoScene());
  assert.equal(retractUnretainedPreview(store, null), store);
});
