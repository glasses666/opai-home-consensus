import assert from 'node:assert/strict';
import test from 'node:test';

import {
  centerCameraPoseOnFloorPlan,
  centerCameraPoseOnRoom,
  cameraPresetToPose,
  isTrackpadPanWheel,
  isTrackpadPinchWheel,
  interpolateCameraPose,
  panCameraPose,
  zoomCameraPose,
} from '../src/pascal/trackpad-navigation.js';

test('room navigation centers and zooms the selected child room', () => {
  const pose = { position: [1, 8, -5], target: [1, 0, 1], viewWidth: 12 };
  const centered = centerCameraPoseOnRoom(pose, {
    id: 'room-flex',
    polygon: [{ x: 6400, z: 0 }, { x: 11000, z: 0 }, { x: 11000, z: 3200 }, { x: 6400, z: 3200 }],
  });

  assert.deepEqual(centered.target, [8.7, 0, 1.6]);
  assert.ok(Math.hypot(centered.position[0] - centered.target[0], centered.position[2] - centered.target[2]) >= Math.hypot(4.6, 3.2));
  assert.equal(Number(Math.abs(centered.position[0] - centered.target[0]).toFixed(3)), Number(Math.abs(centered.position[2] - centered.target[2]).toFixed(3)));
  assert.equal(Number(centered.position[1].toFixed(3)), Number(Math.hypot(centered.position[0] - centered.target[0], centered.position[2] - centered.target[2]).toFixed(3)));
  assert.equal(centered.viewWidth, undefined);
});

test('primary bedroom navigation keeps the same 45 degree room read', () => {
  const centered = centerCameraPoseOnRoom({ position: [1, 8, -5], target: [1, 0, 1], viewWidth: 12 }, {
    id: 'room-primary-bedroom',
    polygon: [{ x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 4000, z: 3200 }, { x: 0, z: 3200 }],
  });

  assert.deepEqual(centered.target, [2, 0, 1.6]);
  assert.equal(Number(centered.position[1].toFixed(3)), Number(Math.hypot(centered.position[0] - centered.target[0], centered.position[2] - centered.target[2]).toFixed(3)));
  assert.equal(centered.viewWidth, undefined);
});

test('canonical camera presets convert from millimeters to Pascal scene units', () => {
  assert.deepEqual(cameraPresetToPose({
    position: { x: 800, y: 1500, z: 1600 },
    target: { x: 3300, y: 1200, z: 1600 },
    fov: 44,
  }), {
    position: [0.8, 1.5, 1.6],
    target: [3.3, 1.2, 1.6],
    projection: 'perspective',
    fov: 44,
  });
});

test('camera pose interpolation follows the shortest orbit and stays clear of the look-at target', () => {
  const from = { position: [0, 4, 8], target: [0, 0, 0], projection: 'perspective', fov: 40 };
  const to = { position: [8, 8, 0], target: [4, 0, 4], projection: 'perspective', fov: 60 };
  const midpoint = interpolateCameraPose(from, to, 0.5);

  assert.deepEqual(interpolateCameraPose(from, to, 0), from);
  assert.deepEqual(midpoint.target, [2, 0, 2]);
  assert.equal(midpoint.fov, 50);
  assert.ok(Math.hypot(...midpoint.position.map((value, index) => value - midpoint.target[index])) > 8);
  assert.deepEqual(interpolateCameraPose(from, to, 1), to);

  const seamMidpoint = interpolateCameraPose(
    { position: [0.1, 4, -8], target: [0, 0, 0], projection: 'perspective' },
    { position: [-0.1, 4, -8], target: [0, 0, 0], projection: 'perspective' },
    0.5,
  );
  assert.ok(seamMidpoint.position[2] < -8);
});

test('viewer initialization centers the existing camera orbit on the floor plan', () => {
  const pose = { position: [1, 8, -5], target: [1, 0, 1], viewWidth: 12 };
  const centered = centerCameraPoseOnFloorPlan(pose, {
    x: 1000,
    z: 2000,
    width: 10000,
    depth: 8000,
  });

  assert.deepEqual(centered.target, [6, 0, 6]);
  assert.deepEqual(centered.position, [6, 8, 0]);
  assert.deepEqual(centered.position.map((value, index) => value - centered.target[index]), [0, 8, -6]);
  assert.equal(centered.viewWidth, 12);
});

test('trackpad scroll pans while pinch and stepped mouse wheels remain native zoom', () => {
  assert.equal(isTrackpadPanWheel({ deltaMode: 0, deltaX: 8, deltaY: 14 }), true);
  assert.equal(isTrackpadPanWheel({ deltaMode: 0, deltaX: 0, deltaY: 3.5 }), true);
  assert.equal(isTrackpadPanWheel({ deltaMode: 0, deltaX: 0, deltaY: 100 }), false);
  assert.equal(isTrackpadPanWheel({ deltaMode: 0, deltaX: 0, deltaY: 3, ctrlKey: true }), false);
  assert.equal(isTrackpadPinchWheel({ deltaMode: 0, deltaY: -8, ctrlKey: true }), true);

  const pose = {
    position: [0, 8, 8],
    target: [0, 0, 0],
    projection: 'perspective',
    viewWidth: 10,
  };
  const panned = panCameraPose(pose, { deltaX: 100, deltaY: 100, viewportWidth: 1000 });
  assert.deepEqual(panned.position, [0.8, 8, 7.2]);
  assert.deepEqual(panned.target, [0.8, 0, -0.8]);
  assert.equal(Math.hypot(
    ...panned.position.map((value, index) => value - panned.target[index]),
  ), Math.hypot(0, 8, 8));
  assert.equal(Number(zoomCameraPose(pose, -10).viewWidth.toFixed(4)), 9.0484);
});
