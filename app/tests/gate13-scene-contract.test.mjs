import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import { compareSceneVersions, createVersionHistory, saveSceneVersion } from '../src/domain/design-version.js';
import { evaluateDesignRules } from '../src/domain/design-rules.js';
import { buildDesignerReview } from '../src/domain/handoff.js';
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

test('Gate 13 objects have stable room hierarchy, surface hosts, collision proxies, and model slots', () => {
  const scene = createDemoScene();
  const slots = new Set();

  for (const object of scene.objects) {
    assert.equal(object.hierarchy.parentId, object.roomId);
    assert.ok(['furniture', 'fixed_installation'].includes(object.hierarchy.layer));
    const host = scene.surfaces.find((surface) => surface.id === object.placement.hostSurfaceId);
    assert.equal(host.roomId, object.roomId);
    assert.equal(object.collision.kind, 'box');
    assert.equal(object.collision.participates, true);
    assert.deepEqual(object.collision.dimensions, object.dimensions);
    assert.equal(slots.has(object.model3D.slotId), false);
    slots.add(object.model3D.slotId);
    assert.equal(object.model3D.revision, 1);
    assert.deepEqual(object.model3D.renderBounds, object.dimensions);
    assert.equal(typeof object.review.requiresProfessionalReview, 'boolean');
  }

  assert.deepEqual(validateScene(scene), { ok: true, errors: [] });
});

test('Gate 13 validation rejects missing hierarchy, dangling hosts, duplicate slots, and untraceable AI assets', () => {
  const cases = [
    ['OBJECT_HIERARCHY_INVALID', (scene) => { delete scene.objects[0].hierarchy; }],
    ['OBJECT_PLACEMENT_INVALID', (scene) => { scene.objects[0].placement.hostSurfaceId = 'surface-missing'; }],
    ['OBJECT_COLLISION_INVALID', (scene) => { delete scene.objects[0].collision; }],
    ['MODEL_SLOT_DUPLICATE', (scene) => { scene.objects[1].model3D.slotId = scene.objects[0].model3D.slotId; }],
    ['OBJECT_MODEL3D_INVALID', (scene) => {
      scene.objects[0].model3D.source = 'ai-generated';
      delete scene.objects[0].model3D.provenance.generationId;
    }],
  ];

  for (const [code, mutate] of cases) {
    const scene = clone(createDemoScene());
    mutate(scene);
    assert.equal(validateScene(scene).errors.some((error) => error.code === code), true, code);
  }
});

test('design rules use the canonical collision proxy rather than visible model bounds', () => {
  const scene = clone(createDemoScene());
  const sofa = scene.objects.find((object) => object.id === 'object-sofa');
  sofa.transform.x = 5000;
  sofa.transform.z = 5700;
  assert.equal(evaluateDesignRules(scene).checks.some((check) => check.code === 'OBJECT_COLLISION' && check.objectIds.includes('object-sofa')), true);

  sofa.collision.source = 'manual';
  sofa.collision.dimensions = { width: 100, depth: 100, height: 820 };
  assert.equal(evaluateDesignRules(scene).checks.some((check) => check.code === 'OBJECT_COLLISION' && check.objectIds.includes('object-sofa')), false);
});

test('2D projection carries hierarchy, host, and collision identity from the same objects', () => {
  const scene = createDemoScene();
  const projection = projectScene2D(scene);
  for (const footprint of projection.layers.cad.objectFootprints) {
    const object = scene.objects.find((candidate) => candidate.id === footprint.sourceObjectId);
    assert.equal(footprint.layer, object.hierarchy.layer);
    assert.equal(footprint.hostSurfaceId, object.placement.hostSurfaceId);
    assert.equal(footprint.collisionPolygon.length, 4);
  }
});

test('model replacement preserves canonical identity and replays byte-identically', () => {
  const initial = createSceneStore(createDemoScene());
  const before = initial.currentScene.objects.find((object) => object.id === 'object-flex-bed');
  const replaced = dispatchSceneCommand(initial, {
    type: 'object.setModelAsset',
    objectId: before.id,
    model3D: {
      src: '/assets/models/sofa.glb',
      source: 'ai-generated',
      provenance: { provider: 'demo-ai-model-service', generationId: 'generation-demo-001', humanReviewed: false },
    },
  });
  const after = replaced.currentScene.objects.find((object) => object.id === before.id);

  assert.equal(after.id, before.id);
  assert.equal(after.roomId, before.roomId);
  assert.deepEqual(after.transform, before.transform);
  assert.deepEqual(after.placement, before.placement);
  assert.deepEqual(after.collision, before.collision);
  assert.equal(after.model3D.slotId, before.model3D.slotId);
  assert.equal(after.model3D.revision, before.model3D.revision + 1);
  assert.equal(after.model3D.source, 'ai-generated');
  assert.equal(after.review.requiresProfessionalReview, true);
  assert.equal(after.review.status, 'required');
  assert.equal(after.review.reasons.includes('ai_model_requires_asset_review'), true);

  const undone = undoSceneCommand(replaced);
  const redone = redoSceneCommand(undone);
  const replayed = replaySceneCommands(initial.initialScene, redone.commands.slice(0, redone.cursor));
  assert.equal(serializeScene(undone.currentScene), serializeScene(initial.currentScene));
  assert.equal(serializeScene(redone.currentScene), serializeScene(replaced.currentScene));
  assert.equal(serializeScene(replayed), serializeScene(replaced.currentScene));

  const history = createVersionHistory(initial, { now: '2026-08-11T00:00:00.000Z' });
  const nextHistory = saveSceneVersion(history, replaced, { now: '2026-08-11T00:01:00.000Z' });
  const diff = compareSceneVersions(history.versions[0], nextHistory.versions.at(-1));
  assert.equal(diff.objectDiffs.some((change) => change.kind === 'model' && change.objectId === before.id), true);
  const review = buildDesignerReview(nextHistory, null);
  assert.equal(review.professionalReviews.some((item) => item.objectId === before.id && item.status === 'required'), true);
  assert.equal(review.recommendation, 'return_with_notes');
});

test('model replacement is capability-gated and local-path only', () => {
  const store = createSceneStore(createDemoScene());
  assert.throws(() => dispatchSceneCommand(store, {
    type: 'object.setModelAsset',
    objectId: 'object-primary-wardrobe',
    model3D: { src: '/assets/models/sofa.glb' },
  }), /OBJECT_NOT_REPLACEABLE/);
  assert.throws(() => dispatchSceneCommand(store, {
    type: 'object.setModelAsset',
    objectId: 'object-flex-bed',
    model3D: { src: 'https:\/\/example.com\/model.glb' },
  }), /OBJECT_MODEL3D_INVALID/);
  assert.throws(() => dispatchSceneCommand(store, {
    type: 'object.setModelAsset',
    objectId: 'object-flex-bed',
    model3D: { src: '/assets/models/../model.glb' },
  }), /OBJECT_MODEL3D_INVALID/);
});
