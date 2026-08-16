import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import { evaluateDesignRules } from '../src/domain/design-rules.js';
import { createSceneStore, serializeScene } from '../src/domain/scene.js';
import { createRecordingBaseline, findRecordingScenario, recordingScenarios, runRecordingScenario } from '../src/demo/recording-scenarios.js';

test('competition triggers produce deterministic, rule-safe multi-change previews', () => {
  const initial = createRecordingBaseline();
  const baselineBlocked = evaluateDesignRules(initial.currentScene).violations.filter((check) => check.status === 'blocked');
  assert.equal(baselineBlocked.length, 0);

  let sequence = initial;
  for (const scenario of recordingScenarios) {
    assert.ok(scenario.calloutReason);
    const result = runRecordingScenario(sequence, scenario.trigger);
    assert.equal(result.scenario.id, scenario.id);
    assert.ok(result.trace.toolCalls.length >= 4);
    assert.notEqual(serializeScene(result.store.currentScene), serializeScene(sequence.currentScene));
    assert.equal(evaluateDesignRules(result.store.currentScene).violations.some((check) => check.status === 'blocked'), false);
    sequence = result.store;
  }
});

test('recording baseline is a clean pre-change scene with no command history', () => {
  const baseline = createRecordingBaseline();
  const byId = (id) => baseline.currentScene.objects.find((object) => object.id === id);
  const surfaceById = (id) => baseline.currentScene.surfaces.find((surface) => surface.id === id);

  assert.equal(baseline.cursor, 0);
  assert.deepEqual(byId('object-coffee-table').transform, { x: 2200, y: 0, z: 6400, rotationY: 0 });
  assert.deepEqual(byId('object-dining-table').dimensions, { width: 1600, depth: 900, height: 740 });
  assert.equal(byId('object-dining-table').model3D.src, '/assets/models/dining-table-original.glb');
  assert.ok(byId('object-dining-chair-e'));
  assert.equal(byId('object-flex-chair'), undefined);
  assert.equal(byId('object-primary-wardrobe').materialId, 'mat-oak-veneer');
  assert.equal(byId('object-primary-feature-wall').model3D.src, '/assets/models/feature-wall-original.glb');
  assert.equal(byId('object-primary-feature-wall').wallArt, undefined);
  assert.equal(surfaceById('surface-ceiling-primary-bedroom').materialId, 'mat-ceiling-warm-white');
});

test('scene one visibly repositions the living group and replaces the doorway-blocking table with a round one', () => {
  const baseline = createRecordingBaseline();
  const result = runRecordingScenario(baseline, recordingScenarios[0].trigger);
  const objectById = (scene, id) => scene.objects.find((object) => object.id === id);
  const before = objectById(baseline.currentScene, 'object-sofa').transform;
  const after = objectById(result.store.currentScene, 'object-sofa').transform;
  const table = objectById(result.store.currentScene, 'object-dining-table');

  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) >= 700);
  assert.deepEqual(table.dimensions, { width: 1300, depth: 1300, height: 740 });
  assert.deepEqual(table.transform, { x: 6200, y: 0, z: 5600, rotationY: 0 });
  assert.equal(table.model3D.src, '/assets/models/dining-table.glb');
  assert.equal(table.media2D.src, '/assets/furniture/dining-table-top.png');
  assert.equal(objectById(result.store.currentScene, 'object-dining-chair-e'), undefined);
  assert.equal(evaluateDesignRules(result.store.currentScene).violations.some((check) => check.status === 'blocked'), false);
});

test('scene two restores the complete growth-room layout', () => {
  const result = runRecordingScenario(createRecordingBaseline(), recordingScenarios[1].trigger);
  const objectById = (id) => result.store.currentScene.objects.find((object) => object.id === id);

  assert.deepEqual(objectById('object-flex-bed').transform, { x: 7700, y: 0, z: 1400, rotationY: 0 });
  assert.equal(objectById('object-flex-bed').materialId, 'mat-flex-accent-fabric');
  assert.deepEqual(objectById('object-flex-desk').transform, { x: 10650, y: 0, z: 1600, rotationY: Math.PI / 2 });
  assert.deepEqual(objectById('object-flex-floating-shelf').dimensions, { width: 1000, depth: 260, height: 720 });
  assert.ok(objectById('object-flex-chair'));
});

test('scene three restores the light wardrobe, slat feature wall, and generated artwork', () => {
  const result = runRecordingScenario(createRecordingBaseline(), recordingScenarios[2].trigger);
  const objectById = (id) => result.store.currentScene.objects.find((object) => object.id === id);
  const wardrobe = objectById('object-primary-wardrobe');
  const featureWall = objectById('object-primary-feature-wall');

  assert.equal(wardrobe.materialId, 'mat-object-warm-white');
  assert.equal(wardrobe.model3D.src, '/assets/models/wardrobe.glb');
  assert.equal(objectById('object-primary-bed').model3D.src, '/assets/models/double-bed.glb');
  assert.deepEqual(featureWall.dimensions, { width: 3000, depth: 120, height: 2100 });
  assert.equal(featureWall.model3D.src, '/assets/models/feature-wall.glb');
  assert.equal(featureWall.media2D.src, '/assets/furniture/feature-wall-top.png');
  assert.equal(featureWall.wallArt.provider, 'imagegen');
});

test('competition triggers are exact and unknown input stays outside the scripted path', () => {
  assert.equal(findRecordingScenario(recordingScenarios[0].trigger)?.id, 'family-living-flow');
  assert.equal(findRecordingScenario('随便改一下'), null);
  assert.equal(runRecordingScenario(createSceneStore(createDemoScene()), '随便改一下'), null);
});
