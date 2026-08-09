import { performance } from 'node:perf_hooks';

import { runFixedAgentEval } from '../evals/agent-cases.mjs';
import { runAgentTurn } from '../src/agent/harness.js';
import { callAily } from '../server/feishu.mjs';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore } from '../src/domain/scene.js';

const requestedCase = process.argv.find((arg) => arg.startsWith('--case='))?.slice('--case='.length) ?? null;
const live = process.argv.includes('--live') || process.env.AILY_EVAL_LIVE === '1';

if (!live) {
  const report = await runFixedAgentEval({ caseId: requestedCase });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} else {
  const agentId = process.env.AILY_AGENT_ID;
  if (!agentId) throw new Error('AILY_AGENT_ID_MISSING');
  const writeTools = new Set(['move_object', 'rotate_object', 'set_object_material', 'set_surface_material', 'apply_catalog_item', 'delete_object']);
  const liveCases = [
    {
      id: 'wall-panel',
      input: '把开放客餐厅南墙改成浅橡木木饰面',
      check: (result) => result.trace.source === 'provider' &&
        result.trace.toolCalls.some((call) => call.tool === 'apply_catalog_item' && call.args.catalogItemId === 'demo-wall-panel-light-oak') &&
        result.trace.steps.every((step) => step.ok) &&
        result.store.currentScene.surfaces.find((surface) => surface.id === 'surface-wall-living-south')?.materialId === 'mat-wall-oak-panel',
    },
    {
      id: 'shelf-browse',
      input: '我想在客餐厅加一组悬浮层板，先给我方向，不要直接改',
      check: (result) => !result.trace.toolCalls.some((call) => writeTools.has(call.tool)) &&
        result.trace.steps.every((step) => step.ok) &&
        result.trace.assistantReply.length > 0 && result.trace.assistantReply.length <= 250,
    },
    {
      id: 'sofa-move',
      input: '把沙发向右移动20厘米',
      check: (result) => result.trace.toolCalls.some((call) => call.tool === 'move_object') &&
        result.trace.steps.every((step) => step.ok) &&
        result.store.currentScene.objects.find((object) => object.id === 'object-sofa')?.transform.x === 2400,
    },
  ].filter((entry) => !requestedCase || entry.id === requestedCase);
  if (!liveCases.length) throw new Error(`EVAL_CASE_NOT_FOUND: ${requestedCase}`);

  const cases = [];
  for (const entry of liveCases) {
    const started = performance.now();
    const result = await runAgentTurn({
      store: createSceneStore(createDemoScene()),
      input: entry.input,
      provider: (context) => callAily(context, { agentId, timeoutMs: 35_000, maxAttempts: 1 }),
      timeoutMs: 40_000,
    });
    cases.push({
      id: entry.id,
      passed: entry.check(result),
      latencyMs: Number((performance.now() - started).toFixed(3)),
      providerAccepted: result.trace.source === 'provider',
      source: result.trace.source,
      fallbackReason: result.trace.fallbackReason,
      assistantReply: result.trace.assistantReply,
      toolCalls: result.trace.toolCalls,
      steps: result.trace.steps.map((step) => ({ ok: step.ok, tool: step.tool, error: step.error ?? null })),
    });
  }
  const failed = cases.filter((entry) => !entry.passed).length;
  console.log(JSON.stringify({
    schemaVersion: 1,
    suite: 'agent-harness-live-smoke',
    caseCount: cases.length,
    passed: failed === 0,
    failed,
    cases,
  }, null, 2));
  if (failed) process.exitCode = 1;
}
