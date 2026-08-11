import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentTurn } from '../src/agent/harness.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { compareSceneVersions, createVersionHistory, saveSceneVersion } from '../src/domain/design-version.js';
import { buildDesignerReview, buildHandoffPacket } from '../src/domain/handoff.js';
import { projectScene2D } from '../src/domain/projection.js';
import {
  createSceneStore,
  dispatchSceneCommand,
  redoSceneCommand,
  replaySceneCommands,
  serializeScene,
  undoSceneCommand,
  validateScene,
} from '../src/domain/scene.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const surface = (scene, id) => scene.surfaces.find((candidate) => candidate.id === id);

test('Gate 14 gives every room one editable floor and ceiling plus validated wall finishes', () => {
  const scene = createDemoScene();
  assert.deepEqual(validateScene(scene), { ok: true, errors: [] });

  for (const room of scene.rooms) {
    for (const kind of ['floor', 'ceiling']) {
      const matches = scene.surfaces.filter((candidate) => candidate.roomId === room.id && candidate.kind === kind);
      assert.equal(matches.length, 1, `${room.id} ${kind}`);
      assert.equal(matches[0].capabilities.materialEditable, true);
      assert.deepEqual(matches[0].polygon, room.polygon);
    }
  }
  assert.equal(scene.surfaces.filter((candidate) => candidate.kind === 'wall').every((item) => item.capabilities.materialEditable), true);
  assert.equal(scene.materials.every((material) => material.name && material.source && material.appliesTo.length), true);
});

test('surface validation rejects unknown kinds, invalid ceilings, and incompatible materials', () => {
  const cases = [
    ['SURFACE_KIND_INVALID', (scene) => { surface(scene, 'surface-ceiling-living-dining').kind = 'roof'; }],
    ['CEILING_ELEVATION_INVALID', (scene) => { surface(scene, 'surface-ceiling-living-dining').elevation = -1; }],
    ['CEILING_ROOM_MISMATCH', (scene) => { surface(scene, 'surface-ceiling-living-dining').polygon[0].x += 100; }],
    ['SURFACE_MATERIAL_INCOMPATIBLE', (scene) => { surface(scene, 'surface-ceiling-living-dining').materialId = 'mat-floor-light-oak'; }],
  ];

  for (const [code, mutate] of cases) {
    const scene = clone(createDemoScene());
    mutate(scene);
    assert.equal(validateScene(scene).errors.some((error) => error.code === code), true, code);
  }
});

test('wall, floor, and ceiling finishes use one command and replay byte-identically', () => {
  const initial = createSceneStore(createDemoScene());
  let store = dispatchSceneCommand(initial, {
    type: 'surface.setMaterial', surfaceId: 'surface-wall-living-south', materialId: 'mat-wall-greige',
  });
  store = dispatchSceneCommand(store, {
    type: 'surface.setMaterial', surfaceId: 'surface-floor-living-dining', materialId: 'mat-floor-tile-warm',
  });
  store = dispatchSceneCommand(store, {
    type: 'surface.setMaterial', surfaceId: 'surface-ceiling-living-dining', materialId: 'mat-ceiling-greige',
  });

  assert.equal(surface(store.currentScene, 'surface-wall-living-south').materialId, 'mat-wall-greige');
  assert.equal(surface(store.currentScene, 'surface-floor-living-dining').materialId, 'mat-floor-tile-warm');
  assert.equal(surface(store.currentScene, 'surface-ceiling-living-dining').materialId, 'mat-ceiling-greige');
  assert.equal(surface(initial.currentScene, 'surface-wall-living-south').materialId, 'mat-wall-warm-white');

  const undone = undoSceneCommand(store);
  const redone = redoSceneCommand(undone);
  const replayed = replaySceneCommands(initial.initialScene, redone.commands.slice(0, redone.cursor));
  assert.equal(surface(undone.currentScene, 'surface-ceiling-living-dining').materialId, 'mat-ceiling-warm-white');
  assert.equal(serializeScene(redone.currentScene), serializeScene(store.currentScene));
  assert.equal(serializeScene(replayed), serializeScene(store.currentScene));

  assert.throws(() => dispatchSceneCommand(store, {
    type: 'surface.setMaterial', surfaceId: 'surface-ceiling-living-dining', materialId: 'mat-floor-light-oak',
  }), /SURFACE_MATERIAL_INCOMPATIBLE/);
});

test('2D projection carries same wall, floor, and ceiling materials without geometry drift', () => {
  const scene = createDemoScene();
  const before = projectScene2D(scene);
  const changed = dispatchSceneCommand(createSceneStore(scene), {
    type: 'surface.setMaterial', surfaceId: 'surface-ceiling-primary-bedroom', materialId: 'mat-ceiling-greige',
  }).currentScene;
  const after = projectScene2D(changed);
  const roomBefore = before.layers.cad.rooms.find((room) => room.id === 'room-primary-bedroom');
  const roomAfter = after.layers.cad.rooms.find((room) => room.id === 'room-primary-bedroom');
  const wallProjection = before.layers.cad.wallSegments.find((wall) => wall.id === 'surface-wall-primary-north');

  assert.equal(roomBefore.floorMaterialId, 'mat-floor-light-oak');
  assert.equal(roomBefore.ceilingMaterialId, 'mat-ceiling-warm-white');
  assert.equal(roomAfter.ceilingMaterialId, 'mat-ceiling-greige');
  assert.deepEqual(roomAfter.polygon, roomBefore.polygon);
  assert.equal(wallProjection.materialId, 'mat-wall-warm-white');
});

test('surface material changes appear in versions, designer review, and provenance-safe handoff', () => {
  const initial = createSceneStore(createDemoScene());
  const changed = dispatchSceneCommand(initial, {
    type: 'surface.setMaterial', surfaceId: 'surface-ceiling-primary-bedroom', materialId: 'mat-ceiling-greige',
  });
  const baseHistory = createVersionHistory(initial, { now: '2026-08-11T00:00:00.000Z' });
  const history = saveSceneVersion(baseHistory, changed, { now: '2026-08-11T00:01:00.000Z' });
  const diff = compareSceneVersions(history.versions[0], history.versions.at(-1));
  const review = buildDesignerReview(history, null);
  const packet = buildHandoffPacket(history, null);

  assert.deepEqual(diff.surfaceDiffs, [{
    kind: 'material', surfaceId: 'surface-ceiling-primary-bedroom', before: 'mat-ceiling-warm-white', after: 'mat-ceiling-greige',
  }]);
  assert.deepEqual(review.surfaceDiffs, diff.surfaceDiffs);
  assert.equal(packet.confirmedSurfaces.every((item) => item.source === 'demo' && item.materialSource === 'demo'), true);
  assert.equal(packet.surfaceChanges[0].surfaceId, 'surface-ceiling-primary-bedroom');
});

test('local Agent edits selected wall, floor, and ceiling but asks when target is missing', async () => {
  let store = createSceneStore(createDemoScene());
  const wall = await runAgentTurn({ store, input: '这面墙改成暖灰', selectedObjectId: 'surface-wall-living-south' });
  store = wall.store;
  assert.equal(surface(store.currentScene, 'surface-wall-living-south').materialId, 'mat-wall-greige');

  const floor = await runAgentTurn({ store, input: '这个地面改成暖灰瓷砖', selectedObjectId: 'surface-floor-living-dining' });
  store = floor.store;
  assert.equal(surface(store.currentScene, 'surface-floor-living-dining').materialId, 'mat-floor-tile-warm');

  const ceiling = await runAgentTurn({ store, input: '这个顶面改成暖灰', selectedObjectId: 'surface-ceiling-living-dining' });
  store = ceiling.store;
  assert.equal(surface(store.currentScene, 'surface-ceiling-living-dining').materialId, 'mat-ceiling-greige');

  const before = serializeScene(store.currentScene);
  const ambiguous = await runAgentTurn({ store, input: '把墙面改成暖白' });
  assert.equal(serializeScene(ambiguous.store.currentScene), before);
  assert.equal(ambiguous.trace.steps[0].tool, 'request_clarification');
});
