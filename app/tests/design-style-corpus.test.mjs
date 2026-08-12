import test from 'node:test';
import assert from 'node:assert/strict';
import { designStyleCorpus, validateDesignStyleCorpus } from '../src/catalog/design-style-corpus.js';

test('style corpus is broad, sourced, and keeps cultural practice out of code rules', () => {
  const result = validateDesignStyleCorpus();
  assert.deepEqual(result, { ok: true, errors: [] });
  assert.ok(designStyleCorpus.styles.length >= 20);
  assert.ok(new Set(designStyleCorpus.styles.map(({ family }) => family)).size >= 6);
  assert.ok(designStyleCorpus.styles.some(({ reception }) => reception === 'polarizing'));
  assert.ok(designStyleCorpus.styles.some(({ names }) => names.zh === '新中式'));
  assert.equal(designStyleCorpus.overlays[0].defaultEnabled, false);
  assert.equal(designStyleCorpus.overlays[0].notBuildingCode, true);
});

test('validator rejects unsupported scores and missing sources', () => {
  const broken = structuredClone(designStyleCorpus);
  broken.styles[0].profile.ornament = 9;
  broken.styles[1].sourceIds = ['missing'];
  const result = validateDesignStyleCorpus(broken);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['styles[0].profile', 'styles[1].sourceIds']);
});
