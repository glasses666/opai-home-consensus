import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { runAgentTurn } from '../src/agent/harness.js';
import { demoCatalogPlugin } from '../src/catalog/demo-catalog.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore, dispatchSceneCommand, validateScene } from '../src/domain/scene.js';
import { projectOppeinSceneToPascal } from '../src/pascal/oppein-to-pascal.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const componentIds = [
  'object-flex-floating-shelf',
  'object-living-slat-partition',
  'object-primary-feature-wall',
];

test('Gate 16 fixed components share the canonical hierarchy, host, collision, and review contracts', () => {
  const scene = createDemoScene();
  const fixed = scene.objects.filter((object) => object.hierarchy.layer === 'fixed_installation');

  assert.deepEqual(validateScene(scene), { ok: true, errors: [] });
  assert.deepEqual(new Set(fixed.map((object) => object.installation.kind)), new Set(['cabinetry', 'shelving', 'partition', 'feature_wall']));
  for (const object of fixed) {
    const host = scene.surfaces.find((surface) => surface.id === object.installation.hostSurfaceId);
    assert.equal(object.hierarchy.parentId, object.roomId);
    assert.equal(object.placement.hostSurfaceId, object.installation.hostSurfaceId);
    assert.equal(host.roomId, object.roomId);
    assert.equal(host.kind, object.installation.mount);
    assert.equal(object.collision.kind, 'box');
    assert.equal(object.review.requiresProfessionalReview, true);
    assert.equal(object.source, 'demo');
  }
});

test('Gate 16 generated assets exist and Pascal keeps each component on its canonical id', () => {
  const scene = createDemoScene();
  const { sceneGraph, mapping } = projectOppeinSceneToPascal(scene);

  for (const objectId of componentIds) {
    const object = scene.objects.find((candidate) => candidate.id === objectId);
    const pascalId = mapping.canonicalToPascal.object[objectId];
    const node = sceneGraph.nodes[pascalId];
    assert.equal(existsSync(new URL(`../public${object.model3D.src}`, import.meta.url)), true, object.model3D.src);
    assert.equal(existsSync(new URL(`../public${object.media2D.src}`, import.meta.url)), true, object.media2D.src);
    assert.deepEqual(mapping.pascalToCanonical[pascalId], { kind: 'object', id: objectId });
    assert.equal(node.metadata.oppein.id, objectId);
    assert.equal(node.metadata.oppein.kind, 'object');
  }
});

test('Gate 16 installations cannot move but replaceable model slots preserve business identity', () => {
  const store = createSceneStore(createDemoScene());
  assert.throws(() => dispatchSceneCommand(store, {
    type: 'object.setTransform',
    objectId: 'object-flex-floating-shelf',
    transform: { x: 10200 },
  }), /OBJECT_NOT_MOVABLE/);

  const before = store.currentScene.objects.find((object) => object.id === 'object-flex-floating-shelf');
  const replaced = dispatchSceneCommand(store, {
    type: 'object.setModelAsset',
    objectId: before.id,
    model3D: {
      src: '/assets/models/floating-shelf.glb',
      source: 'ai-generated',
      provenance: { provider: 'future-ai-model-adapter', generationId: 'gate16-contract', humanReviewed: false },
    },
  });
  const after = replaced.currentScene.objects.find((object) => object.id === before.id);

  assert.equal(after.id, before.id);
  assert.equal(after.roomId, before.roomId);
  assert.deepEqual(after.placement, before.placement);
  assert.deepEqual(after.collision, before.collision);
  assert.equal(after.model3D.slotId, before.model3D.slotId);
  assert.equal(after.model3D.revision, before.model3D.revision + 1);
  assert.equal(after.review.status, 'required');
});

test('Gate 16 validation rejects missing or mismatched installation metadata', () => {
  for (const mutate of [
    (object) => { delete object.installation; },
    (object) => { object.installation.hostSurfaceId = 'surface-floor-flex'; },
  ]) {
    const scene = clone(createDemoScene());
    mutate(scene.objects.find((object) => object.id === 'object-flex-floating-shelf'));
    assert.equal(validateScene(scene).errors.some((error) => error.code === 'OBJECT_INSTALLATION_INVALID'), true);
  }
});

test('Gate 16 catalog entries point at reserved slots without claiming enterprise readiness', async () => {
  const scene = createDemoScene();
  for (const itemId of ['demo-shelf-floating-900', 'demo-partition-oak-slat-1200', 'demo-feature-wall-oak-3000']) {
    const item = demoCatalogPlugin.get(itemId);
    const object = scene.objects.find((candidate) => candidate.id === item.integration.objectId);
    assert.equal(item.sceneReady, false);
    assert.equal(item.source, 'demo');
    assert.equal(item.integration.modelSlotId, object.model3D.slotId);
  }

  const result = await runAgentTurn({
    store: createSceneStore(scene),
    input: '把悬浮层板改成暖白',
    selectedObjectId: 'object-flex-floating-shelf',
  });
  const shelf = result.store.currentScene.objects.find((object) => object.id === 'object-flex-floating-shelf');
  assert.equal(shelf.materialId, 'mat-object-warm-white');
  assert.deepEqual(result.trace.toolCalls.map((call) => call.tool), ['set_object_material']);
});
