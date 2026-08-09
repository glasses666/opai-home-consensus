import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import { buildSceneVersions, compareSceneVersions, restoreSceneVersion, versionLifecycle } from '../src/domain/design-version.js';
import { createSceneStore, dispatchSceneCommand, serializeScene } from '../src/domain/scene.js';

test('scene versions rebuild every draft from the canonical command list', () => {
  const initial = createSceneStore(createDemoScene());
  const moved = dispatchSceneCommand(initial, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
  const material = dispatchSceneCommand(moved, { type: 'object.setMaterial', objectId: 'object-sofa', materialId: 'mat-oak-veneer' });
  const versions = buildSceneVersions(material);

  assert.deepEqual(versions.map((version) => version.label), ['V1', 'V2', 'V3']);
  assert.equal(versions[2].parentVersionId, versions[1].id);
  assert.equal(serializeScene(restoreSceneVersion(material, versions[1]).currentScene), serializeScene(moved.currentScene));
});

test('version comparison reports real object transform and material changes', () => {
  const initial = createSceneStore(createDemoScene());
  const moved = dispatchSceneCommand(initial, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
  const material = dispatchSceneCommand(moved, { type: 'object.setMaterial', objectId: 'object-sofa', materialId: 'mat-oak-veneer' });
  const diff = compareSceneVersions(buildSceneVersions(initial)[0], buildSceneVersions(material).at(-1));

  assert.deepEqual(diff.objectDiffs.map((item) => item.kind), ['transform', 'material']);
  assert.equal(diff.objectDiffs.every((item) => item.objectId === 'object-sofa'), true);
  assert.equal(diff.sceneChanged, true);
});

test('confirmed versions stay intact when the current draft changes afterward', () => {
  const initial = createSceneStore(createDemoScene());
  const confirmedStore = dispatchSceneCommand(initial, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
  const confirmedVersion = buildSceneVersions(confirmedStore).at(-1);
  const changedStore = dispatchSceneCommand(confirmedStore, { type: 'object.setMaterial', objectId: 'object-sofa', materialId: 'mat-oak-veneer' });
  const versions = buildSceneVersions(changedStore);

  assert.equal(versionLifecycle(confirmedVersion, versions.at(-1).id, confirmedVersion.id), 'customer_confirmed');
  assert.equal(versionLifecycle(versions.at(-1), versions.at(-1).id, confirmedVersion.id), 'changed_after_confirm');
});
