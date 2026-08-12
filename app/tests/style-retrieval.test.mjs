import test from 'node:test';
import assert from 'node:assert/strict';

import { designStyleRetrievalEval } from '../src/catalog/design-style-eval.js';
import { retrieveStyleCases } from '../src/catalog/style-retrieval.js';

test('held-out style retrieval reaches every expected style in top three and blocks unsafe claims', () => {
  for (const item of designStyleRetrievalEval) {
    const result = retrieveStyleCases(item.query, { limit: 3 });
    if (!item.expectedStyleIds.length) {
      assert.equal(result.status, 'blocked', item.id);
      assert.equal(result.results.length, 0, item.id);
      continue;
    }
    assert.equal(result.status, 'ready', item.id);
    const styles = new Set(result.results.map(({ styleId }) => styleId));
    for (const styleId of item.expectedStyleIds) assert.ok(styles.has(styleId), `${item.id}: ${styleId}`);
    const matchedFacets = item.facets.filter((facet) => result.detected.facets.includes(facet));
    assert.ok(matchedFacets.length >= Math.min(2, item.facets.length), `${item.id}: facets ${matchedFacets}`);
    assert.ok(result.results.every(({ evidence }) => evidence.applicability.length && evidence.risks.length && evidence.unknowns.length), `${item.id}: evidence boundary`);
  }
});

test('retrieval is deterministic, cited, bounded, and keeps cross-style directions', () => {
  const query = '用户同时要静奢和工业风，哪些材料可兼容？';
  const first = retrieveStyleCases(query, { limit: 4 });
  const second = retrieveStyleCases(query, { limit: 4 });
  assert.deepEqual(second, first);
  assert.deepEqual(first.results.slice(0, 2).map(({ styleId }) => styleId), ['quiet-luxury', 'industrial']);
  assert.ok(first.results.every(({ citation }) => citation.url.startsWith('https://') && citation.usage === 'reference_only'));
  assert.ok(first.results.every(({ evidence }) => !('sourceFacts' in evidence)));
});

test('underspecified request asks for context instead of picking a style', () => {
  const result = retrieveStyleCases('帮我设计一下');
  assert.equal(result.status, 'insufficient_context');
  assert.deepEqual(result.results, []);
});

test('specific Japandi wording does not get swallowed by the broader Nordic substring', () => {
  const specific = retrieveStyleCases('南方潮湿公寓想要日式北欧，但不想到处都是米色', { limit: 3 });
  assert.equal(specific.results[0].styleId, 'japandi');
  const comparison = retrieveStyleCases('北欧和日式北欧之间怎么取舍', { limit: 3 });
  assert.deepEqual(comparison.results.slice(0, 2).map(({ styleId }) => styleId), ['scandinavian', 'japandi']);
});
