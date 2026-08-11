import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import {
  cameraDistanceLimit,
  cameraFocusObjectId,
  cameraTransitionDuration,
  createCameraOrbit,
  sampleCameraOrbit,
  smoothCameraProgress,
  surfaceFadeProgress,
  surfaceOcclusionOpacity,
} from '../src/domain/camera-transition.js';
import { pointInPolygon, rotatedFootprint } from '../src/domain/geometry.js';
import { projectScene2D } from '../src/domain/projection.js';
import { objectNavigationPreset } from '../src/domain/view-state.js';
import {
  assertValidScene,
  createSceneStore,
  deserializeScene,
  dispatchSceneCommand,
  redoSceneCommand,
  serializeScene,
  undoSceneCommand,
  validateScene,
} from '../src/domain/scene.js';

const cloneScene = (scene = createDemoScene()) => JSON.parse(JSON.stringify(scene));

test('large camera turns follow a shortest orbit without collapsing into the target', () => {
  const orbit = createCameraOrbit(
    { x: 2.2, y: 1.45, z: 4.75 },
    { x: 2.2, y: 0.82, z: 7.85 },
    { x: 9.3, y: 1.55, z: 5.25 },
    { x: 9.3, y: 0.82, z: 3.65 },
  );
  const endpointRadius = Math.min(orbit.from.radius, orbit.to.radius);

  for (let step = 0; step <= 100; step += 1) {
    const pose = sampleCameraOrbit(orbit, step / 100);
    assert.ok(Math.hypot(
      pose.position.x - pose.target.x,
      pose.position.y - pose.target.y,
      pose.position.z - pose.target.z,
    ) >= endpointRadius - 1e-9);
  }
  assert.ok(Math.abs(orbit.thetaDelta) <= Math.PI);

  const diningToSofaAngle = 154.3 * Math.PI / 180;
  const duration = cameraTransitionDuration(diningToSofaAngle);
  assert.ok(duration > 1400);
  assert.ok(diningToSofaAngle * smoothCameraProgress(16.67 / duration) < 0.1 * Math.PI / 180);
  assert.equal(smoothCameraProgress(0), 0);
  assert.equal(smoothCameraProgress(1), 1);
  assert.equal(cameraTransitionDuration(diningToSofaAngle, 1), 1);
  assert.equal(surfaceOcclusionOpacity(0), 1);
  assert.equal(surfaceOcclusionOpacity(0.5), 0.5);
  assert.equal(surfaceOcclusionOpacity(1), 0);
  const fadeOut = surfaceFadeProgress(0, 1, 16);
  assert.ok(fadeOut > 0 && fadeOut < 1);
  assert.ok(surfaceFadeProgress(fadeOut, 1, 16) > fadeOut);
  const fadeIn = surfaceFadeProgress(1, 0, 16);
  assert.ok(fadeIn > 0 && fadeIn < 1);
  assert.equal(cameraDistanceLimit('whole_home'), 28);
  assert.equal(cameraDistanceLimit('room_overhead', 4), 8);
  assert.equal(cameraDistanceLimit('room_overhead', 7.6), 15.2);
});

test('editable room overhead focuses the selected furniture without shifting other room views', () => {
  assert.equal(cameraFocusObjectId({ kind: 'room_overhead' }, 'object-sofa'), 'object-sofa');
  assert.equal(cameraFocusObjectId({ kind: 'room_entry' }, 'object-sofa'), null);
  assert.equal(cameraFocusObjectId({ kind: 'object_overhead', objectId: 'object-dining-table' }, 'object-sofa'), 'object-dining-table');
});

test('demo fixture is a valid seven-room whole-home plan with reciprocal adjacency', () => {
  const scene = createDemoScene();
  assert.deepEqual(validateScene(scene), { ok: true, errors: [] });
  assert.equal(scene.rooms.length, 7);
  assert.equal(scene.floorPlan.bounds.height, 2800);
  assert.equal(scene.surfaces.filter((surface) => surface.kind === 'wall').every((wall) => wall.height === scene.floorPlan.bounds.height), true);
  for (const room of scene.rooms) {
    for (const adjacentId of room.adjacentRoomIds) {
      assert.equal(scene.rooms.find((candidate) => candidate.id === adjacentId).adjacentRoomIds.includes(room.id), true);
    }
  }
});

test('Gate 4 living slice exposes traceable selectable 3D objects', () => {
  const scene = createDemoScene();
  const livingObjects = scene.objects.filter((object) => object.roomId === 'room-living-dining');

  assert.deepEqual(livingObjects.map((object) => object.id).sort(), [
    'object-dining-table',
    'object-living-slat-partition',
    'object-sofa',
    'object-tv-console',
  ]);
  for (const object of livingObjects) {
    assert.equal(object.source, 'demo');
    assert.match(object.externalId, /^DEMO-/);
    assert.equal(object.capabilities.selectable, true);
    assert.equal(object.model3D.source, 'generated');
    assert.ok(object.dimensions.width > 0 && object.dimensions.depth > 0 && object.dimensions.height > 0);
  }
});

test('Gate 16 fixed installations keep installation contracts and replaceable asset slots', () => {
  const scene = createDemoScene();
  const fixedObjects = [
    scene.objects.find((object) => object.id === 'object-flex-floating-shelf'),
    scene.objects.find((object) => object.id === 'object-living-slat-partition'),
    scene.objects.find((object) => object.id === 'object-primary-feature-wall'),
  ];

  assert.equal(fixedObjects.every(Boolean), true);
  for (const object of fixedObjects) {
    assert.equal(object.hierarchy.layer, 'fixed_installation');
    assert.equal(object.capabilities.replaceable, true);
    assert.equal(object.review.requiresProfessionalReview, true);
    assert.equal(object.review.status, 'required');
    assert.equal(object.model3D.slotId.startsWith('slot-object-'), true);
    assert.equal(object.placement.hostSurfaceId, object.installation.hostSurfaceId);
    assert.equal(object.installation.source, 'demo');
  }
  assert.deepEqual(
    fixedObjects.map((object) => [object.id, object.installation.kind, object.installation.mount, object.installation.hostSurfaceId]),
    [
      ['object-flex-floating-shelf', 'shelving', 'wall', 'surface-wall-flex-north'],
      ['object-living-slat-partition', 'partition', 'floor', 'surface-floor-living-dining'],
      ['object-primary-feature-wall', 'feature_wall', 'wall', 'surface-wall-primary-south'],
    ],
  );
});

test('Gate 5 duplicate, resize, delete, undo, and redo stay command-driven', () => {
  const initial = createSceneStore(createDemoScene());
  const duplicated = dispatchSceneCommand(initial, {
    type: 'object.duplicate',
    objectId: 'object-sofa',
    newObjectId: 'object-sofa-copy-test',
    externalId: 'DEMO-FURN-001-COPY-TEST',
    transform: { x: 2200, y: 0, z: 6800, rotationY: 0 },
  });
  assert.equal(duplicated.currentScene.objects.some((object) => object.id === 'object-sofa-copy-test'), true);

  const resized = dispatchSceneCommand(duplicated, {
    type: 'object.setDimensions',
    objectId: 'object-sofa-copy-test',
    dimensions: { width: 2000, depth: 800, height: 780 },
  });
  assert.deepEqual(
    resized.currentScene.objects.find((object) => object.id === 'object-sofa-copy-test').dimensions,
    { width: 2000, depth: 800, height: 780 },
  );

  const deleted = dispatchSceneCommand(resized, { type: 'object.delete', objectId: 'object-sofa-copy-test' });
  assert.equal(deleted.currentScene.objects.some((object) => object.id === 'object-sofa-copy-test'), false);
  const restored = undoSceneCommand(deleted);
  assert.equal(restored.currentScene.objects.some((object) => object.id === 'object-sofa-copy-test'), true);
  assert.equal(redoSceneCommand(restored).currentScene.objects.some((object) => object.id === 'object-sofa-copy-test'), false);
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

test('camera presets provide whole-home, room-overhead, entry, and feature views', () => {
  const scene = createDemoScene();
  const wholeHome = scene.cameraPresets.find((preset) => preset.kind === 'whole_home');
  assert.equal(wholeHome.id, 'camera-home-overview');
  for (const room of scene.rooms) {
    const overhead = scene.cameraPresets.find((preset) => preset.id === room.cameraPresetIds[0]);
    assert.equal(overhead.roomId, room.id);
    assert.equal(overhead.kind, 'room_overhead');
    assert.equal(Number.isFinite(overhead.position.y), true);
  }
  assert.deepEqual(
    scene.rooms.find((room) => room.id === 'room-living-dining').cameraPresetIds,
    ['camera-living-overhead', 'camera-living-entry', 'camera-living-feature'],
  );
  const livingOverhead = scene.cameraPresets.find((preset) => preset.id === 'camera-living-overhead');
  const livingEntry = scene.cameraPresets.find((preset) => preset.id === 'camera-living-entry');
  const overheadHeading = {
    x: livingOverhead.position.x - livingOverhead.target.x,
    z: livingOverhead.position.z - livingOverhead.target.z,
  };
  const entryHeading = {
    x: livingEntry.position.x - livingEntry.target.x,
    z: livingEntry.position.z - livingEntry.target.z,
  };
  assert.ok((overheadHeading.x * entryHeading.x + overheadHeading.z * entryHeading.z) /
    (Math.hypot(overheadHeading.x, overheadHeading.z) * Math.hypot(entryHeading.x, entryHeading.z)) > 0.999);
  for (const object of scene.objects) {
    const preset = scene.cameraPresets.find((candidate) => candidate.id === object.preferredCameraPresetId);
    assert.equal(preset.roomId, object.roomId);
  }
  assert.equal(scene.objects.find((object) => object.id === 'object-primary-bed').preferredCameraPresetId, 'camera-primary-overhead');
  assert.equal(scene.objects.find((object) => object.id === 'object-tv-console').preferredCameraPresetId, 'camera-living-feature');
  assert.equal(scene.objects.find((object) => object.id === 'object-primary-wardrobe').preferredCameraPresetId, 'camera-primary-wardrobe');
  for (const [objectId, presetId] of [['object-sofa', 'camera-living-sofa'], ['object-dining-table', 'camera-living-dining']]) {
    const object = scene.objects.find((candidate) => candidate.id === objectId);
    const preset = scene.cameraPresets.find((candidate) => candidate.id === presetId);
    assert.equal(object.preferredCameraPresetId, preset.id);
    assert.equal(preset.objectId, object.id);
    assert.equal(preset.target.x, object.transform.x);
    assert.equal(preset.target.z, object.transform.z);
  }
});

test('movable objects open in an editable overhead while fixed objects keep their feature view', () => {
  const scene = createDemoScene();
  assert.equal(objectNavigationPreset(scene, scene.objects.find((object) => object.id === 'object-sofa')).id, 'camera-living-overhead');
  assert.equal(objectNavigationPreset(scene, scene.objects.find((object) => object.id === 'object-flex-desk')).id, 'camera-flex-overhead');
  assert.equal(objectNavigationPreset(scene, scene.objects.find((object) => object.id === 'object-dining-table')).id, 'camera-living-dining');
  assert.equal(objectNavigationPreset(scene, scene.objects.find((object) => object.id === 'object-tv-console')).id, 'camera-living-feature');
});

test('room entry cameras never start inside furniture footprints', () => {
  const scene = createDemoScene();

  for (const preset of scene.cameraPresets.filter((candidate) => candidate.kind === 'room_entry')) {
    const furnitureAtCamera = scene.objects
      .filter((object) => object.roomId === preset.roomId)
      .filter((object) => pointInPolygon(preset.position, rotatedFootprint(object.transform, object.dimensions)))
      .map((object) => object.id);
    assert.deepEqual(furnitureAtCamera, [], `${preset.id} starts inside ${furnitureAtCamera.join(', ')}`);
  }
});

test('surface feature camera targets stay on the room side of their walls', () => {
  const scene = createDemoScene();

  for (const preset of scene.cameraPresets.filter((candidate) => candidate.kind === 'surface_feature')) {
    const wall = scene.surfaces.find((surface) => surface.id === preset.surfaceId);
    const axisDistance = wall.edge.start.x === wall.edge.end.x
      ? Math.abs(preset.target.x - wall.edge.start.x)
      : Math.abs(preset.target.z - wall.edge.start.z);
    assert.ok(axisDistance > wall.thickness / 2, `${preset.id} target sits inside ${wall.id}`);
  }
});

test('every 3D model is a checked-in generated GLB within the Gate 2 asset budget', async () => {
  const scene = createDemoScene();
  for (const object of scene.objects) {
    const bytes = await readFile(new URL(`../public${object.model3D.src}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
    assert.equal(bytes.length < 450_000, true, `${object.model3D.src} exceeds 450 KB`);
    assert.equal(object.model3D.source, 'generated');
    assert.equal(object.model3D.generator, 'scripts/build_demo_assets.py');
  }
});

test('the dining table canonical bounds include its legs', async () => {
  const bytes = await readFile(new URL('../public/assets/models/dining-table.glb', import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const model = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString().replace(/\0+$/, ''));
  const canonicalNames = model.nodes
    .filter((node) => node.extras?.material_role === 'canonical')
    .map((node) => node.name);

  assert.equal(canonicalNames.filter((name) => name.startsWith('CANONICAL table leg')).length, 4);
  assert.equal(model.nodes.some((node) => /chair/i.test(node.name)), false);
});

test('the sofa GLB stays a sofa instead of a sofa-and-coffee-table vignette', async () => {
  const bytes = await readFile(new URL('../public/assets/models/sofa.glb', import.meta.url));
  const jsonLength = bytes.readUInt32LE(12);
  const model = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString().replace(/\0+$/, ''));
  const names = model.nodes.map((node) => node.name);

  assert.equal(names.some((name) => /coffee|rug/i.test(name)), false);
  assert.equal(names.some((name) => name === 'CANONICAL frame'), true);
});

test('bed mattresses keep their ivory asset material instead of inheriting upholstery', async () => {
  for (const name of ['double-bed', 'single-bed']) {
    const bytes = await readFile(new URL(`../public/assets/models/${name}.glb`, import.meta.url));
    const jsonLength = bytes.readUInt32LE(12);
    const model = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString().replace(/\0+$/, ''));
    const mattress = model.nodes.find((node) => node.name === 'ACCENT mattress');
    assert.equal(mattress?.extras?.material_role, 'accent');
  }
});

test('validation rejects invalid 3D asset metadata and camera transforms', () => {
  const badAsset = cloneScene();
  badAsset.objects[0].model3D.source = 'downloaded';
  const badCamera = cloneScene();
  delete badCamera.cameraPresets[0].position.y;

  assert.equal(validateScene(badAsset).errors.some((error) => error.code === 'OBJECT_MODEL3D_INVALID'), true);
  assert.equal(validateScene(badCamera).errors.some((error) => error.code === 'CAMERA_PRESET_TRANSFORM_INVALID'), true);
});

test('validation rejects dangling or cross-room object camera references', () => {
  const dangling = cloneScene();
  dangling.objects[0].preferredCameraPresetId = 'camera-missing';
  const crossRoom = cloneScene();
  crossRoom.objects[0].preferredCameraPresetId = 'camera-flex-overhead';
  const danglingObject = cloneScene();
  danglingObject.cameraPresets.find((preset) => preset.objectId).objectId = 'object-missing';

  assert.equal(validateScene(dangling).errors.some((error) => error.code === 'CAMERA_PRESET_REF_DANGLING'), true);
  assert.equal(validateScene(crossRoom).errors.some((error) => error.code === 'CAMERA_PRESET_ROOM_MISMATCH'), true);
  assert.equal(validateScene(danglingObject).errors.some((error) => error.code === 'OBJECT_REF_DANGLING'), true);
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
