import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRenderProfile } from '../src/domain/render-profile.js';

test('Gate 17 uses the full editor only for a visible capable desktop', () => {
  assert.deepEqual(resolveRenderProfile({ width: 1440, coarsePointer: false, deviceMemory: 8 }), {
    mode: 'full', defaultView: 'split', allowHeavy3D: true, dprCap: 1.75,
  });
});

test('Gate 17 defaults small, coarse-pointer, and low-memory devices to 2D', () => {
  for (const input of [
    { width: 390, coarsePointer: false, deviceMemory: 8 },
    { width: 1024, coarsePointer: true, deviceMemory: 8 },
    { width: 1024, coarsePointer: false, deviceMemory: 4 },
  ]) {
    assert.deepEqual(resolveRenderProfile(input), {
      mode: 'light', defaultView: '2d', allowHeavy3D: true, dprCap: 1,
    });
  }
});

test('Gate 17 unmounts heavy rendering while the document is hidden', () => {
  assert.deepEqual(resolveRenderProfile({ width: 1440, hidden: true }), {
    mode: 'paused', defaultView: '2d', allowHeavy3D: false, dprCap: 1,
  });
});
