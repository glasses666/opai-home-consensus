import assert from 'node:assert/strict';
import test from 'node:test';

import { syncTransformAttachment } from '../src/domain/transform-controls.js';

test('transform controls keep the same target attached across unrelated renders', () => {
  const root = {};
  const control = {
    object: null,
    mode: 'translate',
    attachCalls: 0,
    detachCalls: 0,
    getMode() { return this.mode; },
    setMode(mode) { this.mode = mode; },
    attach(next) { this.object = next; this.attachCalls += 1; },
    detach() { this.object = null; this.detachCalls += 1; },
  };

  syncTransformAttachment(control, root, 'translate');
  syncTransformAttachment(control, root, 'translate');
  assert.deepEqual({ attach: control.attachCalls, detach: control.detachCalls }, { attach: 1, detach: 0 });

  syncTransformAttachment(control, root, 'rotate');
  assert.deepEqual({ mode: control.mode, attach: control.attachCalls }, { mode: 'rotate', attach: 1 });

  syncTransformAttachment(control, null);
  assert.equal(control.detachCalls, 1);
});
