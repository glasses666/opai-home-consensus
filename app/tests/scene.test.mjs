import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import { projectScene2D } from '../src/domain/projection.js';
import {
  assertValidScene,
  createSceneStore,
  deserializeScene,
  dispatchSceneCommand,
  serializeScene,
  validateScene,
} from '../src/domain/scene.js';

const cloneScene = (scene = createDemoScene()) => JSON.parse(JSON.stringify(scene));

test('demo fixture is a valid seven-room whole-home plan with reciprocal adjacency', () => {
  const scene = createDemoScene();
  assert.deepEqual(validateScene(scene), { ok: true, errors: [] });
  assert.equal(scene.rooms.length, 7);
  for (const room of scene.rooms) {
    for (const adjacentId of room.adjacentRoomIds) {
      assert.equal(scene.rooms.find((candidate) => candidate.id === adjacentId).adjacentRoomIds.includes(room.id), true);
    }
  }
});

test('scene round trip is byte-identical and deserialized scenes are frozen', () => {
  const scene = createDemoScene();
  const serialized = serializeScene(scene);
  const deserialized = deserializeScene(serialized);

  assert.equal(serializeScene(deserialized), serialized);
  assert.throws(() => {
    deserialized.rooms[0].name = 'Mutated';
  }, TypeError);
});

test('validation catches duplicate ids across entity types', () => {
  const scene = cloneScene();
  scene.objects[0].id = scene.rooms[0].id;

  assert.equal(validateScene(scene).errors.some((error) => error.code === 'DUPLICATE_ID'), true);
});

test('validation catches dangling room, surface, host, material, and rule refs', () => {
  const scene = cloneScene();
  scene.rooms[0].adjacentRoomIds = ['missing-room'];
  scene.surfaces[0].roomId = 'missing-surface-room';
  scene.openings[0].hostSurfaceId = 'missing-host';
  scene.objects[0].materialId = 'missing-material';
  scene.objects[0].ruleIds = ['missing-rule'];

  const codes = validateScene(scene).errors.map((error) => error.code);
  assert.equal(codes.includes('ROOM_REF_DANGLING'), true);
  assert.equal(codes.includes('SURFACE_ROOM_REF_DANGLING'), true);
  assert.equal(codes.includes('OPENING_HOST_REF_DANGLING'), true);
  assert.equal(codes.includes('MATERIAL_REF_DANGLING'), true);
  assert.equal(codes.includes('RULE_REF_DANGLING'), true);
});

test('validation rejects openings that do not fit their host wall or floor height', () => {
  const scene = cloneScene();
  scene.openings[0].offset = 2800;
  scene.openings[1].height = 3000;

  const codes = validateScene(scene).errors.map((error) => error.code);
  assert.equal(codes.includes('OPENING_OUTSIDE_HOST'), true);
  assert.equal(codes.includes('OPENING_HEIGHT_INVALID'), true);
});

test('validation requires explicit CAD swing geometry for exterior and interior doors', () => {
  const scene = cloneScene();
  scene.openings.find((opening) => opening.kind === 'exterior-door').swing.side = 0;
  delete scene.openings.find((opening) => opening.kind === 'interior-door').swing;

  assert.equal(validateScene(scene).errors.filter((error) => error.code === 'OPENING_SWING_INVALID').length, 2);
});

test('validation rejects unsupported schema and incomplete building geometry', () => {
  const scene = cloneScene();
  scene.schemaVersion = 2;
  delete scene.surfaces.find((surface) => surface.kind === 'wall').thickness;
  scene.surfaces.find((surface) => surface.kind === 'floor').polygon[0].x = -100;

  const codes = validateScene(scene).errors.map((error) => error.code);
  assert.equal(codes.includes('SCHEMA_VERSION_UNSUPPORTED'), true);
  assert.equal(codes.includes('WALL_DIMENSIONS_INVALID'), true);
  assert.equal(codes.includes('FLOOR_ROOM_MISMATCH'), true);
});

test('assertValidScene includes validation codes in thrown errors', () => {
  const scene = cloneScene();
  scene.objects[0].dimensions.width = -1;

  assert.throws(() => assertValidScene(scene), /OBJECT_DIMENSIONS_INVALID/);
});

test('store is frozen and direct mutation is prevented', () => {
  const store = createSceneStore(createDemoScene());

  assert.throws(() => {
    store.commands.push({ type: 'object.setTransform' });
  }, TypeError);
  assert.throws(() => {
    store.currentScene.objects[0].transform.x = 1;
  }, TypeError);
});

test('invalid command throws and leaves prior store unchanged', () => {
  const store = createSceneStore(createDemoScene());

  assert.throws(
    () =>
      dispatchSceneCommand(store, {
        type: 'object.setTransform',
        objectId: 'object-sofa',
        transform: { x: -5000 },
      }),
    /OBJECT_FOOTPRINT_OUTSIDE_ROOM/,
  );
  assert.equal(store.currentScene.objects.find((object) => object.id === 'object-sofa').transform.x, 2200);
  assert.equal(store.commands.length, 0);
});

test('scene command changes scene and derived projection', () => {
  const store = createSceneStore(createDemoScene());
  const before = projectScene2D(store.currentScene);
  const next = dispatchSceneCommand(store, {
    type: 'object.setTransform',
    objectId: 'object-sofa',
    transform: { x: 2600 },
  });
  const after = projectScene2D(next.currentScene);

  assert.notDeepEqual(
    after.layers.cad.objectFootprints.find((footprint) => footprint.id === 'object-sofa').polygon,
    before.layers.cad.objectFootprints.find((footprint) => footprint.id === 'object-sofa').polygon,
  );
  assert.equal(next.commands.length, 1);
});

test('non-movable objects reject transform commands', () => {
  const store = createSceneStore(createDemoScene());

  assert.throws(
    () =>
      dispatchSceneCommand(store, {
        type: 'object.setTransform',
        objectId: 'object-shoe-cabinet',
        transform: { x: 1800 },
      }),
    /OBJECT_NOT_MOVABLE/,
  );
});

test('projection changes when fixture geometry changes', () => {
  const scene = cloneScene();
  const before = projectScene2D(scene);
  scene.objects.find((object) => object.id === 'object-sofa').transform.x = 2600;

  assert.deepEqual(validateScene(scene), { ok: true, errors: [] });
  assert.notDeepEqual(
    projectScene2D(scene).layers.cad.objectFootprints.find((item) => item.id === 'object-sofa').polygon,
    before.layers.cad.objectFootprints.find((item) => item.id === 'object-sofa').polygon,
  );
});

test('projection exposes deterministic CAD and media layers from one viewBox', () => {
  const scene = createDemoScene();
  const first = projectScene2D(scene);
  const second = projectScene2D(scene);

  assert.deepEqual(first.layerOrder, ['cad', 'media']);
  assert.equal(first.layers.cad.rooms.length, scene.rooms.length);
  assert.equal(first.layers.cad.wallSegments.length, scene.surfaces.filter((surface) => surface.kind === 'wall').length);
  assert.equal(first.layers.cad.openingSegments.length, scene.openings.length);
  assert.equal(first.layers.media.assets.length, scene.objects.length);
  assert.equal(first.layers.cad.rooms.find((room) => room.id === 'room-bathroom').materialId, 'mat-floor-tile-warm');
  assert.equal(first.layers.cad.rooms.find((room) => room.id === 'room-primary-bedroom').materialId, 'mat-floor-light-oak');
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('every media asset uses the canonical CAD footprint and object transform', () => {
  const scene = createDemoScene();
  const projection = projectScene2D(scene);

  for (const asset of projection.layers.media.assets) {
    const object = scene.objects.find((candidate) => candidate.id === asset.sourceObjectId);
    const footprint = projection.layers.cad.objectFootprints.find(
      (candidate) => candidate.sourceObjectId === asset.sourceObjectId,
    );

    assert.ok(object);
    assert.ok(footprint);
    assert.equal(asset.roomId, object.roomId);
    assert.deepEqual(asset.anchor, { x: object.transform.x, y: object.transform.z });
    assert.equal(asset.width, object.dimensions.width);
    assert.equal(asset.depth, object.dimensions.depth);
    assert.equal(asset.rotationY, object.transform.rotationY);
    assert.equal(asset.src, object.media2D.src);
    assert.equal(asset.source, 'generated');
    assert.equal(asset.selectable, object.capabilities.selectable);
    assert.deepEqual(asset.polygon, footprint.polygon);
  }
});

test('a scene command moves CAD and media projections together', () => {
  const beforeStore = createSceneStore(createDemoScene());
  const nextStore = dispatchSceneCommand(beforeStore, {
    type: 'object.setTransform',
    objectId: 'object-sofa',
    transform: { x: 2600 },
  });
  const before = projectScene2D(beforeStore.currentScene);
  const after = projectScene2D(nextStore.currentScene);
  const beforeCad = before.layers.cad.objectFootprints.find((item) => item.sourceObjectId === 'object-sofa');
  const afterCad = after.layers.cad.objectFootprints.find((item) => item.sourceObjectId === 'object-sofa');
  const afterMedia = after.layers.media.assets.find((item) => item.sourceObjectId === 'object-sofa');

  assert.notDeepEqual(afterCad.polygon, beforeCad.polygon);
  assert.deepEqual(afterMedia.polygon, afterCad.polygon);
});

test('validation rejects missing or non-generated top-view media', () => {
  const missing = cloneScene();
  delete missing.objects[0].media2D;
  const wrongSource = cloneScene();
  wrongSource.objects[1].media2D.source = 'unknown';

  assert.equal(validateScene(missing).errors.some((error) => error.code === 'OBJECT_MEDIA2D_INVALID'), true);
  assert.equal(validateScene(wrongSource).errors.some((error) => error.code === 'OBJECT_MEDIA2D_INVALID'), true);
});

test('clearance zones stay inside their rooms and reference real design rules', () => {
  const outside = cloneScene();
  outside.clearanceZones[0].polygon[0].x = 7000;
  const missingRule = cloneScene();
  missingRule.clearanceZones[0].ruleIds = ['missing-rule'];

  assert.equal(validateScene(outside).errors.some((error) => error.code === 'CLEARANCE_OUTSIDE_ROOM'), true);
  assert.equal(validateScene(missingRule).errors.some((error) => error.code === 'RULE_REF_DANGLING'), true);
});
