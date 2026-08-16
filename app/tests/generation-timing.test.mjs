import assert from 'node:assert/strict';
import test from 'node:test';

import { generationProgressAt, MINIMUM_GENERATION_MS, remainingGenerationDelay } from '../src/domain/generation-timing.js';

test('generation stays visible for ten seconds and progresses smoothly to 99 percent', () => {
  assert.equal(remainingGenerationDelay(1_000, 1_000), MINIMUM_GENERATION_MS);
  assert.equal(remainingGenerationDelay(1_000, 10_999), 1);
  assert.equal(remainingGenerationDelay(1_000, 11_000), 0);
  assert.equal(generationProgressAt(0), 8);
  assert.ok(generationProgressAt(5_000) > 8 && generationProgressAt(5_000) < 99);
  assert.equal(generationProgressAt(MINIMUM_GENERATION_MS), 99);
});
