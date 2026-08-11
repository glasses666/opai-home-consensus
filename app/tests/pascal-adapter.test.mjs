import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import { projectOppeinSceneToPascal } from '../src/pascal/oppein-to-pascal.js';

test('Pascal projection keeps the whole canonical home addressable', () => {
  const scene = createDemoScene();
  const { sceneGraph, mapping, counts } = projectOppeinSceneToPascal(scene);
  assert.deepEqual(counts, {
    rooms: scene.rooms.length,
    surfaces: scene.surfaces.length,
    openings: scene.openings.length,
    objects: scene.objects.length,
    materials: scene.materials.length,
  });
  assert.equal(sceneGraph.rootNodeIds.length, 1);
  assert.deepEqual(sceneGraph.installedPlugins, ['pascal:core']);
  assert.equal(Object.values(sceneGraph.nodes).filter((node) => node.type === 'zone').length, 7);
  assert.equal(Object.values(sceneGraph.nodes).filter((node) => node.type === 'item').length, scene.objects.length);
  assert.equal(Object.values(sceneGraph.nodes).filter((node) => node.type === 'wall').length, scene.surfaces.filter((s) => s.kind === 'wall').length);
  assert.equal(Object.values(sceneGraph.nodes).filter((node) => node.type === 'slab').length, scene.surfaces.filter((s) => s.kind === 'floor').length);
  assert.equal(Object.values(sceneGraph.nodes).filter((node) => node.type === 'ceiling').length, scene.surfaces.filter((s) => s.kind === 'ceiling').length);
  assert.equal(Object.values(sceneGraph.nodes).filter((node) => node.type === 'door' || node.type === 'window').length, scene.openings.length);
  for (const door of Object.values(sceneGraph.nodes).filter((node) => node.type === 'door')) {
    assert.equal(door.openingShape, 'rectangle');
    assert.ok(['left', 'right'].includes(door.hingesSide));
    assert.ok(['inward', 'outward'].includes(door.swingDirection));
    assert.ok(Number.isFinite(door.swingAngle));
  }

  for (const room of scene.rooms) assert.equal(mapping.pascalToCanonical[mapping.canonicalToPascal.room[room.id]].id, room.id);
  for (const object of scene.objects) assert.equal(mapping.pascalToCanonical[mapping.canonicalToPascal.object[object.id]].id, object.id);
  for (const surface of scene.surfaces) assert.equal(mapping.pascalToCanonical[mapping.canonicalToPascal.surface[surface.id]].id, surface.id);
  for (const opening of scene.openings) assert.equal(mapping.pascalToCanonical[mapping.canonicalToPascal.opening[opening.id]].id, opening.id);
});

test('Pascal projection emits Pascal-shaped node and material ids', () => {
  const { sceneGraph } = projectOppeinSceneToPascal(createDemoScene());
  const allowedPrefixes = /^(site|building|level|wall|door|window|slab|ceiling|zone|item)_/;
  for (const node of Object.values(sceneGraph.nodes)) {
    assert.equal(node.object, 'node');
    assert.match(node.id, allowedPrefixes);
    assert.equal(typeof node.type, 'string');
    assert.ok('metadata' in node);
  }
  for (const material of Object.values(sceneGraph.materials)) {
    assert.match(material.id, /^mat_/);
    assert.equal(material.material.id, material.id);
    assert.ok(material.material.properties.color.startsWith('#'));
  }
});
