import assert from 'node:assert/strict';
import test from 'node:test';

import { AGENT_EVAL_CASES, runFixedAgentEval } from '../evals/agent-cases.mjs';

test('offline agent eval covers B2 harness risks with deterministic report shape', async () => {
  let tick = 0;
  const report = await runFixedAgentEval({ now: () => tick++ * 7 });

  assert.equal(AGENT_EVAL_CASES.length >= 20 && AGENT_EVAL_CASES.length <= 30, true);
  assert.equal(report.passed, true);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.failed, 0);
  assert.equal(report.caseCount, AGENT_EVAL_CASES.length);
  assert.deepEqual(Object.keys(report.groups).sort(), [
    'grounded_reply',
    'hard_constraints',
    'provider_fallback',
    'tool_selection',
    'unauthorized_mutation',
  ]);
  assert.deepEqual(report.latency, { minMs: 7, maxMs: 7, meanMs: 7, p95Ms: 7 });
  assert.equal(report.cases.every((entry) => entry.trace && Array.isArray(entry.trace.toolCalls) && Array.isArray(entry.trace.steps)), true);
  assert.equal(JSON.parse(JSON.stringify(report)).suite, 'agent-harness-offline-b2');
});

test('offline agent eval can run one selected case', async () => {
  const report = await runFixedAgentEval({ caseId: 'provider-timeout-fallback', now: () => 1 });

  assert.equal(report.passed, true);
  assert.equal(report.caseCount, 1);
  assert.equal(report.cases[0].fallbackReason, 'PROVIDER_TIMEOUT');
});
