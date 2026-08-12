import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE_STYLE_IDS, projectStyleRagChunks, validateDesignStyleCases } from '../src/catalog/design-style-case-schema.js';
import { designStyleRetrievalEval } from '../src/catalog/design-style-eval.js';
import { designStyleCases } from '../src/catalog/design-style-cases.js';

function makeCase(styleId, index) {
  return {
    id: `${styleId}-${index}`,
    styleId,
    title: `${styleId} case ${index}`,
    geography: index % 3 === 0 ? 'Europe' : index % 3 === 1 ? 'Asia' : 'Americas',
    dwellingType: index % 2 ? 'apartment' : 'house',
    rooms: index % 3 === 0 ? ['living'] : index % 3 === 1 ? ['bedroom'] : ['kitchen'],
    household: index % 2 ? 'couple' : 'family',
    constraints: ['compact footprint'],
    intensity: index % 3 === 0 ? 'hybrid' : 'typical',
    budget: { band: index % 2 ? 'mid' : 'upper', provenance: 'curated_estimate' },
    source: { url: `https://example.com/${styleId}/${index}`, kind: 'primary-studio', usage: 'reference_only' },
    designMoves: ['one design move'], envelope: ['one envelope move'], furniture: ['one furniture move'], lighting: ['one lighting move'], applicability: ['one application'], risks: ['one risk'],
    evidence: { sourceFacts: ['one fact'], curatedInferences: ['one inference'], unknowns: ['exact cost'] },
  };
}

const validCorpus = {
  schemaVersion: 1,
  cases: CORE_STYLE_IDS.flatMap((styleId) => Array.from({ length: 10 }, (_, index) => makeCase(styleId, index))),
};

test('case corpus contract requires ten diverse traceable cases for every core style', () => {
  assert.deepEqual(validateDesignStyleCases(validCorpus), { ok: true, errors: [] });
  const chunks = projectStyleRagChunks(validCorpus);
  assert.equal(chunks.length, 480);
  assert.equal(new Set(chunks.map(({ id }) => id)).size, 480);
  assert.ok(chunks.every(({ sourceUrl, text }) => sourceUrl.startsWith('https://') && text.length > 0));
});

test('validator rejects duplicate sources and unlabelled commercial estimates', () => {
  const broken = structuredClone(validCorpus);
  broken.cases[1].source.url = broken.cases[0].source.url;
  broken.cases[2].budget.provenance = 'source_fact';
  const result = validateDesignStyleCases(broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(({ code }) => code === 'INVALID_SOURCE_URL'));
  assert.ok(result.errors.some(({ code }) => code === 'INVALID_BUDGET'));
});

test('validator rejects ten near-duplicate cases disguised as coverage', () => {
  const broken = structuredClone(validCorpus);
  for (const item of broken.cases.filter(({ styleId }) => styleId === 'scandinavian')) {
    item.rooms = ['living'];
    item.dwellingType = 'apartment';
    item.intensity = 'typical';
    item.geography = 'Europe';
  }
  const result = validateDesignStyleCases(broken);
  assert.ok(result.errors.some(({ code, path }) => code === 'STYLE_CASE_HOMOGENEITY' && path === 'styles.scandinavian'));
});

test('held-out eval questions stay outside the case corpus and include refusal boundaries', () => {
  assert.ok(designStyleRetrievalEval.length >= 12);
  assert.ok(designStyleRetrievalEval.every(({ heldOut }) => heldOut === true));
  assert.ok(designStyleRetrievalEval.some(({ expectedStyleIds }) => expectedStyleIds.length === 0));
});

test('researched seed corpus contains 80 diverse traceable cases and 480 atomic chunks', () => {
  const result = validateDesignStyleCases(designStyleCases);
  assert.deepEqual(result, { ok: true, errors: [] });
  assert.equal(designStyleCases.cases.length, 80);
  assert.equal(projectStyleRagChunks(designStyleCases).length, 480);
});
