import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveInteractionLayer, resolveRenderProfile } from '../src/domain/render-profile.js';
import createViteConfig from '../vite.config.mjs';

test('Gate 17 uses the full editor only for a visible capable desktop', () => {
  assert.deepEqual(resolveRenderProfile({ width: 1440, coarsePointer: false, deviceMemory: 8 }), {
    mode: 'full', defaultView: '3d', allowHeavy3D: true, dprCap: 1.75,
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

test('the consumer workspace only becomes editable after an explicit edit choice', () => {
  assert.equal(resolveInteractionLayer(), 'browse');
  assert.equal(resolveInteractionLayer({ sidecarMode: 'space' }), 'quick');
  assert.equal(resolveInteractionLayer({ sidecarMode: 'household' }), 'browse');
});

test('the lazy Pascal editor cannot invalidate the active dependency graph', () => {
  const config = createViteConfig({ mode: 'development' });
  assert.equal(config.optimizeDeps.noDiscovery, true);
  assert.ok(config.optimizeDeps.include.includes('react-dom/client'));
  assert.ok(config.optimizeDeps.include.includes('use-sync-external-store/shim/with-selector.js'));
});
