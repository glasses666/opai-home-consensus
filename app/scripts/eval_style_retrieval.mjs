#!/usr/bin/env node

import { designStyleRetrievalEval } from '../src/catalog/design-style-eval.js';
import { retrieveStyleCases } from '../src/catalog/style-retrieval.js';

const cases = designStyleRetrievalEval.map((item) => {
  const result = retrieveStyleCases(item.query, { limit: 3 });
  const returnedStyleIds = [...new Set(result.results.map(({ styleId }) => styleId))];
  const matchedFacets = item.facets.filter((facet) => result.detected?.facets.includes(facet));
  const facetTarget = Math.min(2, item.facets.length);
  const passed = item.expectedStyleIds.length
    ? item.expectedStyleIds.every((styleId) => returnedStyleIds.includes(styleId))
      && matchedFacets.length >= facetTarget
      && result.results.every(({ evidence }) => evidence.applicability.length && evidence.risks.length && evidence.unknowns.length)
    : result.status === 'blocked' && result.results.length === 0;
  return Object.freeze({
    id: item.id,
    passed,
    status: result.status,
    expectedStyleIds: item.expectedStyleIds,
    returnedStyleIds,
    matchedFacets,
    facetTarget,
    caseIds: result.results.map(({ caseId }) => caseId),
    boundary: result.boundary ?? null,
  });
});

const styleCases = cases.filter(({ expectedStyleIds }) => expectedStyleIds.length);
const boundaryCases = cases.filter(({ expectedStyleIds }) => !expectedStyleIds.length);
const report = Object.freeze({
  suite: 'design-style-retrieval-v1',
  passed: cases.every((item) => item.passed),
  metrics: Object.freeze({
    styleRecallAt3: styleCases.filter((item) => item.passed).length / styleCases.length,
    refusalAccuracy: boundaryCases.filter((item) => item.passed).length / boundaryCases.length,
    total: cases.length,
    failures: cases.filter((item) => !item.passed).length,
  }),
  cases: Object.freeze(cases),
});

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
