import { performance } from 'node:perf_hooks';

import { runFixedAgentEval } from '../evals/agent-cases.mjs';
import { runAgentTurn } from '../src/agent/harness.js';
import { callAily } from '../server/feishu.mjs';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore } from '../src/domain/scene.js';

const requestedCase = process.argv.find((arg) => arg.startsWith('--case='))?.slice('--case='.length) ?? null;
const requestedSuite = process.argv.find((arg) => arg.startsWith('--suite='))?.slice('--suite='.length) ?? 'smoke';
const live = process.argv.includes('--live') || process.env.AILY_EVAL_LIVE === '1';

if (!live) {
  const report = await runFixedAgentEval({ caseId: requestedCase });
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} else {
  const agentId = process.env.AILY_AGENT_ID;
  if (!agentId) throw new Error('AILY_AGENT_ID_MISSING');
  const writeTools = new Set(['move_object', 'rotate_object', 'set_object_material', 'set_surface_material', 'apply_catalog_item', 'delete_object']);
  const smokeCases = [
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
      check: (result) => result.trace.source === 'provider' &&
        !result.trace.toolCalls.some((call) => writeTools.has(call.tool)) &&
        result.trace.steps.every((step) => step.ok) &&
        result.trace.assistantReply.length > 0 && result.trace.assistantReply.length <= 250,
    },
    {
      id: 'sofa-move',
      input: '把沙发向右移动20厘米',
      check: (result) => result.trace.source === 'provider' &&
        result.trace.toolCalls.some((call) => call.tool === 'move_object') &&
        result.trace.steps.every((step) => step.ok) &&
        result.store.currentScene.objects.find((object) => object.id === 'object-sofa')?.transform.x === 2400,
    },
    {
      id: 'japandi-direction',
      input: '南方潮湿小户型想做日式北欧，先给两个方向，不要改房屋',
      check: (result) => result.trace.source === 'provider' &&
        result.trace.styleEvidence?.detected?.styleIds.includes('japandi') &&
        !result.trace.toolCalls.some((call) => writeTools.has(call.tool)) &&
        result.store.commands.length === 0,
    },
  ];
  const styleCases = [
    ['style-scandinavian', '48平米小户型，有孩子且需要大量收纳，北欧风怎么做才不是只变白？先给方向，不要改房屋', ['scandinavian']],
    ['style-minimalist', '三代同堂的家庭可以做极简吗？不能只建议少买东西。先给方向，不要改房屋', ['minimalist']],
    ['style-contemporary', '当代风怎么区分长期基底和容易过时的元素？先给方向，不要改房屋', ['contemporary']],
    ['style-mid-century', '小户型想做中世纪现代，怎么保留比例又不堆成复古展厅？先给方向，不要改房屋', ['mid-century-modern']],
    ['style-quiet-luxury', '预算只够做两个高质量节点，静奢风优先投资哪里？先给方向，不要改房屋', ['quiet-luxury']],
    ['style-new-chinese', '层高不高的公寓怎么做新中式，又不堆格栅和符号？先给方向，不要改房屋', ['new-chinese']],
    ['style-industrial', '工业风客厅有混凝土和钢，如何处理回声、冷感和维护？先给方向，不要改房屋', ['industrial']],
    ['style-cross-calm', '想要安静浅木，但不要日式低矮，在北欧与日式北欧之间怎么取舍？先给方向，不要改房屋', ['scandinavian', 'japandi']],
  ].map(([id, input, expectedStyleIds]) => ({
    id,
    input,
    check: (result) => result.trace.source === 'provider' &&
      result.trace.providerReplyIssue === null &&
      expectedStyleIds.every((styleId) => result.trace.styleEvidence?.detected?.styleIds.includes(styleId)) &&
      !result.trace.toolCalls.some((call) => writeTools.has(call.tool)) &&
      result.trace.steps.every((step) => step.ok) &&
      result.store.commands.length === 0 &&
      result.trace.assistantReply.length > 0 && result.trace.assistantReply.length <= 250,
  }));
  const liveCases = (requestedSuite === 'style' ? styleCases : smokeCases)
    .filter((entry) => !requestedCase || entry.id === requestedCase);
  if (!liveCases.length) throw new Error(`EVAL_CASE_NOT_FOUND: ${requestedCase}`);

  const cases = [];
  for (const entry of liveCases) {
    const started = performance.now();
    const result = await runAgentTurn({
      store: createSceneStore(createDemoScene()),
      input: entry.input,
      provider: (context) => callAily(context, { agentId, timeoutMs: 50_000, maxAttempts: 2 }),
      timeoutMs: 105_000,
    });
    cases.push({
      id: entry.id,
      passed: entry.check(result),
      latencyMs: Number((performance.now() - started).toFixed(3)),
      providerAccepted: result.trace.source === 'provider',
      source: result.trace.source,
      fallbackReason: result.trace.fallbackReason,
      providerReplyIssue: result.trace.providerReplyIssue,
      assistantReply: result.trace.assistantReply,
      toolCalls: result.trace.toolCalls,
      steps: result.trace.steps.map((step) => ({ ok: step.ok, tool: step.tool, error: step.error ?? null })),
    });
  }
  const failed = cases.filter((entry) => !entry.passed).length;
  console.log(JSON.stringify({
    schemaVersion: 1,
    suite: requestedSuite === 'style' ? 'agent-harness-live-style' : 'agent-harness-live-smoke',
    caseCount: cases.length,
    passed: failed === 0,
    failed,
    cases,
  }, null, 2));
  if (failed) process.exitCode = 1;
}
