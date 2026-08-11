import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isTrackpadPanWheel,
  isTrackpadPinchWheel,
  panCameraPose,
  zoomCameraPose,
} from '../src/pascal/trackpad-navigation.js';

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
