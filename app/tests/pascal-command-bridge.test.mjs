import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore, dispatchSceneCommand, serializeScene } from '../src/domain/scene.js';
import { projectOppeinSceneToPascal, toSceneMaterialRef } from '../src/pascal/oppein-to-pascal.js';
import { isResidentEditCommand, pascalCommitToSceneCommands, pascalEditToSceneCommand } from '../src/pascal/pascal-to-command.js';

test('Pascal item transform maps to the existing SceneCommand path', () => {
  const scene = createDemoScene();
  const { mapping } = projectOppeinSceneToPascal(scene);
  const command = pascalEditToSceneCommand({
    type: 'node.transform',
    nodeId: mapping.canonicalToPascal.object['object-sofa'],
    position: [2, 0, 5],
    rotation: [0, 0.25, 0],
  }, mapping);

  assert.deepEqual(command, {
    type: 'object.setTransform',
    objectId: 'object-sofa',
    transform: { x: 2000, y: 0, z: 5000, rotationY: 0.25 },
  });
  const store = dispatchSceneCommand(createSceneStore(scene), command);
  assert.equal(store.currentScene.objects.find((object) => object.id === 'object-sofa').transform.x, 2000);
});

test('Pascal material changes map to object and surface commands', () => {
  const { mapping } = projectOppeinSceneToPascal(createDemoScene());
  assert.deepEqual(pascalEditToSceneCommand({
    type: 'node.material',
    nodeId: mapping.canonicalToPascal.object['object-sofa'],
    materialRef: toSceneMaterialRef('mat-oak-veneer'),
  }, mapping), { type: 'object.setMaterial', objectId: 'object-sofa', materialId: 'mat-oak-veneer' });

  assert.deepEqual(pascalEditToSceneCommand({
    type: 'node.material',
    nodeId: mapping.canonicalToPascal.surface['surface-wall-living-south'],
    materialRef: toSceneMaterialRef('mat-wall-greige'),
  }, mapping), { type: 'surface.setMaterial', surfaceId: 'surface-wall-living-south', materialId: 'mat-wall-greige' });
});

test('Pascal local commits become commands, and unsupported edits are ignored', () => {
  const scene = createDemoScene();
  const { sceneGraph, mapping } = projectOppeinSceneToPascal(scene);
  const itemId = mapping.canonicalToPascal.object['object-dining-table'];
  const before = sceneGraph.nodes[itemId];
  const current = { ...before, position: [6.4, 0, 5.7] };

  assert.deepEqual(pascalCommitToSceneCommands({
    origin: 'local',
    before: { nodes: { [itemId]: before } },
    current: { nodes: { [itemId]: current } },
  }, mapping), [{ type: 'object.setTransform', objectId: 'object-dining-table', transform: { x: 6400, y: 0, z: 5700, rotationY: 0 } }]);

  assert.equal(pascalEditToSceneCommand({ type: 'node.transform', nodeId: 'item_unknown', position: [0, 0, 0] }, mapping), null);
});

test('Pascal edits still rely on canonical rules for rejection', () => {
  const scene = createDemoScene();
  const before = serializeScene(scene);
  const { mapping } = projectOppeinSceneToPascal(scene);
  const command = pascalEditToSceneCommand({
    type: 'node.transform',
    nodeId: mapping.canonicalToPascal.object['object-sofa'],
    position: [-8, 0, -8],
    rotation: [0, 0, 0],
  }, mapping);

  assert.throws(() => dispatchSceneCommand(createSceneStore(scene), command), /OBJECT_FOOTPRINT_OUTSIDE_ROOM/);
  assert.equal(serializeScene(scene), before);
});

test('resident editing only allows furniture transform and dimensions', () => {
  assert.equal(isResidentEditCommand({ type: 'object.setTransform' }), true);
  assert.equal(isResidentEditCommand({ type: 'object.setDimensions' }), true);
  assert.equal(isResidentEditCommand({ type: 'object.setMaterial' }), false);
  assert.equal(isResidentEditCommand({ type: 'surface.setMaterial' }), false);
  assert.equal(isResidentEditCommand({ type: 'object.delete' }), false);
});
