import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_EXPERIENCE_STYLE,
  EXPERIENCE_STYLES,
  normalizeExperienceStyle,
  resolveExperienceStyle,
  withExperienceStyle,
} from '../src/domain/experience-style.js';

test('Gate 24 exposes four presentation-only styles with a stable fallback', () => {
  assert.equal(EXPERIENCE_STYLES.length, 4);
  assert.equal(new Set(EXPERIENCE_STYLES.map((style) => style.id)).size, 4);
  assert.equal(normalizeExperienceStyle('missing'), null);
  assert.equal(resolveExperienceStyle('?style=spatial-cinema', 'agent-canvas'), 'spatial-cinema');
  assert.equal(resolveExperienceStyle('', 'architect-index'), 'architect-index');
});

test('Gate 24 style survives canonical room, view, and selection URL updates', () => {
  assert.equal(
    withExperienceStyle('?room=room-flex&view=camera-flex-overhead&select=object-flex-desk', 'agent-canvas'),
    '?room=room-flex&view=camera-flex-overhead&select=object-flex-desk&style=agent-canvas',
  );
  assert.equal(withExperienceStyle('', 'architect-index'), '?style=architect-index');
});
