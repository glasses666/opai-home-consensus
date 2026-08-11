import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import {
  compareVersionHistory,
  confirmSceneVersion,
  createVersionHistory,
  deserializeVersionHistory,
  reviewSceneVersion,
  restoreSceneVersion,
  saveSceneVersion,
  sceneStoreForVersion,
  serializeVersionHistory,
} from '../src/domain/design-version.js';
import { createSceneStore, dispatchSceneCommand, serializeScene } from '../src/domain/scene.js';

const at = (value) => () => value;

test('saved versions have a parent chain and rebuild byte-identically', () => {
  const initialStore = createSceneStore(createDemoScene());
  let history = createVersionHistory(initialStore, { now: at('2026-08-10T00:00:00.000Z') });
  const moved = dispatchSceneCommand(initialStore, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
  history = saveSceneVersion(history, moved, { id: 'version-two', now: at('2026-08-10T00:01:00.000Z') });

  assert.deepEqual(history.versions.map((version) => version.label), ['V1', 'V2']);
  assert.equal(history.versions[1].parentVersionId, history.versions[0].id);
  assert.equal(history.versions[1].status, 'impact_review');
  assert.equal(serializeScene(sceneStoreForVersion(history).currentScene), serializeScene(moved.currentScene));
  assert.equal(saveSceneVersion(history, moved), history);
});

test('version diff reports real object and rule changes without invented commercial data', () => {
  const initialStore = createSceneStore(createDemoScene());
  let history = createVersionHistory(initialStore);
  const moved = dispatchSceneCommand(initialStore, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
  history = saveSceneVersion(history, moved, { id: 'version-two' });
  const diff = compareVersionHistory(history, 'version-demo-initial', 'version-two');

  assert.equal(diff.objectDiffs.some((item) => item.kind === 'transform' && item.objectId === 'object-sofa'), true);
  assert.equal(diff.sceneChanged, true);
  assert.equal(diff.impact.unresolved.some((item) => item.code === 'COMMERCIAL_DATA_UNRESOLVED' && item.source === 'estimate'), true);
  const same = compareVersionHistory(history, 'version-two', 'version-two');
  assert.equal(same.sceneChanged, false);
  assert.deepEqual(same.objectDiffs, []);
  assert.deepEqual(same.impact.unresolved, []);
});

test('confirmed version stays intact and the next saved edit is changed_after_confirm', () => {
  const initialStore = createSceneStore(createDemoScene());
  let history = createVersionHistory(initialStore);
  const moved = dispatchSceneCommand(initialStore, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
  history = saveSceneVersion(history, moved, { id: 'version-two' });
  history = confirmSceneVersion(history, 'version-two', { actor: 'resident-one', now: at('2026-08-10T00:02:00.000Z') });
  const changed = dispatchSceneCommand(moved, { type: 'object.setMaterial', objectId: 'object-sofa', materialId: 'mat-oak-veneer' });
  history = saveSceneVersion(history, changed, { id: 'version-three' });

  assert.equal(history.confirmedVersionId, 'version-two');
  assert.equal(history.versions.find((version) => version.id === 'version-two').status, 'customer_confirmed');
  assert.equal(history.versions.find((version) => version.id === 'version-three').status, 'changed_after_confirm');
  assert.equal(serializeScene(sceneStoreForVersion(history, 'version-two').currentScene), serializeScene(moved.currentScene));
});

test('designer review status preserves the reviewed scene snapshot', () => {
  const initialStore = createSceneStore(createDemoScene());
  let history = createVersionHistory(initialStore);
  const moved = dispatchSceneCommand(initialStore, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
  history = saveSceneVersion(history, moved, { id: 'version-two' });
  history = confirmSceneVersion(history, 'version-two');
  history = reviewSceneVersion(history, 'version-two', { action: 'approve', note: '可以交接' });

  assert.equal(history.versions.find((version) => version.id === 'version-two').status, 'designer_verified');
  assert.equal(serializeScene(sceneStoreForVersion(history, 'version-two').currentScene), serializeScene(moved.currentScene));
  assert.throws(() => reviewSceneVersion(history, 'version-two', { action: 'maybe' }), /REVIEW_ACTION_INVALID/);
});

test('restoring an old version appends a reversible version instead of overwriting history', () => {
  const initialStore = createSceneStore(createDemoScene());
  let history = createVersionHistory(initialStore);
  const moved = dispatchSceneCommand(initialStore, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
  history = saveSceneVersion(history, moved, { id: 'version-two' });
  history = confirmSceneVersion(history, 'version-two');
  const changed = dispatchSceneCommand(moved, { type: 'object.setMaterial', objectId: 'object-sofa', materialId: 'mat-oak-veneer' });
  history = saveSceneVersion(history, changed, { id: 'version-three' });
  const restored = restoreSceneVersion(history, 'version-two', { id: 'version-four' });

  assert.equal(restored.history.versions.length, 4);
  assert.equal(restored.history.currentVersionId, 'version-four');
  assert.equal(restored.history.versions.at(-1).parentVersionId, 'version-three');
  assert.equal(restored.history.versions.at(-1).status, 'changed_after_confirm');
  assert.equal(serializeScene(restored.store.currentScene), serializeScene(moved.currentScene));
  assert.equal(serializeScene(sceneStoreForVersion(restored.history, 'version-three').currentScene), serializeScene(changed.currentScene));
});

test('version history round-trips and rejects tampered snapshots', () => {
  const initialStore = createSceneStore(createDemoScene());
  let history = createVersionHistory(initialStore);
  const moved = dispatchSceneCommand(initialStore, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
  history = saveSceneVersion(history, moved, { id: 'version-two' });
  const serialized = serializeVersionHistory(history);

  assert.equal(serializeVersionHistory(deserializeVersionHistory(serialized)), serialized);
  const tampered = JSON.parse(serialized);
  tampered.versions[1].scene.objects.find((object) => object.id === 'object-sofa').transform.x = 9999;
  assert.throws(() => deserializeVersionHistory(JSON.stringify(tampered)), /VERSION_REPLAY_MISMATCH|Invalid scene/);
});
