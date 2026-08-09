import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import { parseViewState, sanitizeViewState, serializeViewState } from '../src/domain/view-state.js';

const gate3RoomIds = ['room-living-dining', 'room-primary-bedroom', 'room-flex'];

test('the three Gate 3 rooms own overhead, entry, and surface feature presets', () => {
  const scene = createDemoScene();

  for (const roomId of gate3RoomIds) {
    const room = scene.rooms.find((candidate) => candidate.id === roomId);
    const presets = room.cameraPresetIds.map((id) => scene.cameraPresets.find((preset) => preset.id === id));
    assert.deepEqual(presets.map((preset) => preset.kind), ['room_overhead', 'room_entry', 'surface_feature']);
    assert.equal(presets.every((preset) => preset.roomId === roomId), true);
    const xs = room.polygon.map((point) => point.x);
    const zs = room.polygon.map((point) => point.z);
    const roomSpan = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    assert.ok(presets[0].position.y >= roomSpan * 1.7, `${roomId} overhead must frame the whole room`);
    const featureSurface = scene.surfaces.find((surface) => surface.id === presets[2].surfaceId);
    assert.equal(featureSurface.roomId, roomId);
  }
});

test('Gate 3 view state round-trips through a native URL query', () => {
  const scene = createDemoScene();
  const state = {
    roomId: 'room-flex',
    viewId: 'camera-flex-feature',
    selectedId: 'object-flex-desk',
  };
  const query = serializeViewState(state, scene);

  assert.equal(query, '?room=room-flex&view=camera-flex-feature&select=object-flex-desk');
  assert.deepEqual(parseViewState(query, scene), state);
  assert.equal(serializeViewState(parseViewState(query, scene), scene), query);
  assert.deepEqual(parseViewState('', scene), {
    roomId: null,
    viewId: 'camera-home-overview',
    selectedId: null,
  });
  assert.equal(serializeViewState(parseViewState('', scene), scene), '');
});

test('object camera views survive Gate 3 URL sanitization', () => {
  const scene = createDemoScene();
  const state = {
    roomId: 'room-living-dining',
    viewId: 'camera-living-sofa',
    selectedId: 'object-sofa',
  };

  assert.deepEqual(sanitizeViewState(state, scene), state);
  assert.equal(
    serializeViewState(state, scene),
    '?room=room-living-dining&view=camera-living-sofa&select=object-sofa',
  );
});

test('invalid and cross-room URL values fall back to compatible scene state', () => {
  const scene = createDemoScene();

  assert.deepEqual(parseViewState('?room=missing&view=missing&select=missing', scene), {
    roomId: null,
    viewId: 'camera-home-overview',
    selectedId: null,
  });
  assert.deepEqual(sanitizeViewState({
    roomId: 'room-primary-bedroom',
    viewId: 'camera-flex-entry',
    selectedId: 'object-flex-desk',
  }, scene), {
    roomId: 'room-primary-bedroom',
    viewId: 'camera-primary-overhead',
    selectedId: null,
  });
  assert.deepEqual(parseViewState(
    '?room=room-primary-bedroom&view=camera-primary-wardrobe&select=surface-wall-primary-east',
    scene,
  ), {
    roomId: 'room-primary-bedroom',
    viewId: 'camera-primary-overhead',
    selectedId: 'surface-wall-primary-east',
  });
});
