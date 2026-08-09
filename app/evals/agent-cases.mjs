import { performance } from 'node:perf_hooks';

import { runAgentTurn } from '../src/agent/harness.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore, serializeScene } from '../src/domain/scene.js';

const WRITE_TOOLS = new Set(['move_object', 'rotate_object', 'set_object_material', 'set_surface_material', 'apply_catalog_item']);
const CHECKS = Object.freeze({
  provider: ({ trace }) => trace.source === 'provider',
  local: ({ trace }) => trace.source === 'local',
  noFallback: ({ trace }) => trace.fallbackReason === null,
  noWriteTools: ({ trace }) => trace.toolCalls.every((call) => !WRITE_TOOLS.has(call.tool)),
  stepsOk: ({ trace }) => trace.steps.every((step) => step.ok),
  unchanged: ({ beforeScene, result }) => serializeScene(result.store.currentScene) === beforeScene,
  rolledBack: ({ trace, beforeScene, result }) => trace.rolledBack === true && serializeScene(result.store.currentScene) === beforeScene,
  replyGrounded: ({ trace }) => trace.assistantReply.length <= 250 && (trace.assistantReply.match(/[？?]/g)?.length ?? 0) <= 1,
});

const provider = (result) => () => result;
const failingProvider = (message) => () => { throw new Error(message); };
const neverProvider = () => new Promise(() => {});
const object = (store, id) => store.currentScene.objects.find((entry) => entry.id === id);
const surface = (store, id) => store.currentScene.surfaces.find((entry) => entry.id === id);
const hasTool = (trace, tool) => trace.toolCalls.some((call) => call.tool === tool);
const hasStepError = (trace, pattern) => trace.steps.some((step) => step.ok === false && pattern.test(step.error ?? ''));
const near = (actual, expected) => Math.abs(actual - expected) < 1e-9;

export const AGENT_EVAL_CASES = Object.freeze([
  {
    id: 'local-move-sofa',
    group: 'tool_selection',
    input: '沙发向右移动20厘米',
    expect: [CHECKS.local, CHECKS.stepsOk, ({ trace, result }) => hasTool(trace, 'move_object') && object(result.store, 'object-sofa').transform.x === 2400],
  },
  {
    id: 'local-selected-move',
    group: 'tool_selection',
    input: '向左移动10厘米',
    selectedObjectId: 'object-primary-bed',
    expect: [CHECKS.local, CHECKS.stepsOk, ({ result }) => object(result.store, 'object-primary-bed').transform.x === 1800],
  },
  {
    id: 'local-rotate-table',
    group: 'tool_selection',
    input: '餐桌旋转90度',
    expect: [CHECKS.local, CHECKS.stepsOk, ({ trace, result }) => hasTool(trace, 'rotate_object') && near(object(result.store, 'object-dining-table').transform.rotationY, Math.PI)],
  },
  {
    id: 'local-object-material',
    group: 'tool_selection',
    input: '沙发改成橡木色',
    expect: [CHECKS.local, CHECKS.stepsOk, ({ trace, result }) => hasTool(trace, 'set_object_material') && object(result.store, 'object-sofa').materialId === 'mat-oak-veneer'],
  },
  {
    id: 'local-wall-panel',
    group: 'tool_selection',
    input: '把开放客餐厅南墙改成浅橡木木饰面',
    expect: [CHECKS.local, CHECKS.stepsOk, ({ trace, result }) => hasTool(trace, 'apply_catalog_item') && surface(result.store, 'surface-wall-living-south').materialId === 'mat-wall-oak-panel'],
  },
  {
    id: 'local-shelf-browse',
    group: 'tool_selection',
    input: '我想在客餐厅加一组悬浮层板，先给我方向，不要直接改',
    expect: [CHECKS.local, CHECKS.noWriteTools, CHECKS.stepsOk, ({ trace }) => hasTool(trace, 'search_catalog') && hasTool(trace, 'request_clarification')],
  },
  {
    id: 'provider-inspect-room',
    group: 'tool_selection',
    input: '检查开放客餐厅',
    provider: provider({ assistantReply: '已读取开放客餐厅。', toolCalls: [{ tool: 'inspect_room', args: { roomId: 'room-living-dining' } }] }),
    expect: [CHECKS.provider, CHECKS.stepsOk, ({ trace }) => trace.steps[0].result.objects.includes('object-sofa')],
  },
  {
    id: 'provider-search-catalog',
    group: 'tool_selection',
    input: '客餐厅墙面有哪些可选材料',
    provider: provider({ assistantReply: '先给墙面材料方向。', toolCalls: [{ tool: 'search_catalog', args: { query: '墙面', category: 'wall_finish', limit: 3 } }] }),
    expect: [CHECKS.provider, CHECKS.stepsOk, ({ trace }) => trace.steps[0].result.items.length === 3],
  },
  {
    id: 'provider-floor-finish',
    group: 'tool_selection',
    input: '把客餐厅地面换成瓷砖',
    provider: provider({ assistantReply: '已切换为暖灰哑光砖。', toolCalls: [{ tool: 'set_surface_material', args: { surfaceId: 'surface-floor-living-dining', materialId: 'mat-floor-tile-warm' } }] }),
    expect: [CHECKS.provider, CHECKS.stepsOk, ({ result }) => surface(result.store, 'surface-floor-living-dining').materialId === 'mat-floor-tile-warm'],
  },
  {
    id: 'provider-one-clarification',
    group: 'tool_selection',
    input: '我想加架子',
    provider: provider({ assistantReply: '架体需要先确认位置。', toolCalls: [{ tool: 'request_clarification', args: { question: '准备放在哪个房间？', reason: '位置不明确' } }] }),
    expect: [CHECKS.provider, CHECKS.stepsOk, CHECKS.replyGrounded],
  },
  {
    id: 'no-write-local-intent',
    group: 'unauthorized_mutation',
    input: '沙发向右移动20厘米，先给方案不要直接改',
    expect: [CHECKS.local, CHECKS.noWriteTools, CHECKS.unchanged],
  },
  {
    id: 'no-write-provider-blocked',
    group: 'unauthorized_mutation',
    input: '沙发向右移动20厘米，先给方案不要直接改',
    provider: provider({ assistantReply: '先不改。', toolCalls: [{ tool: 'move_object', args: { objectId: 'object-sofa', dx: 200 } }] }),
    expect: [CHECKS.local, CHECKS.unchanged, ({ trace }) => trace.fallbackReason === 'TOOL_NOT_ALLOWED'],
  },
  {
    id: 'provider-disallowed-tool-fallback',
    group: 'unauthorized_mutation',
    input: '沙发向右移动20厘米',
    provider: provider({ assistantReply: '旋转沙发。', toolCalls: [{ tool: 'rotate_object', args: { objectId: 'object-sofa', degrees: 90 } }] }),
    expect: [CHECKS.local, ({ trace, result }) => trace.fallbackReason === 'TOOL_NOT_ALLOWED' && object(result.store, 'object-sofa').transform.x === 2400],
  },
  {
    id: 'provider-invalid-tool-fallback',
    group: 'unauthorized_mutation',
    input: '检查客厅',
    provider: provider({ assistantReply: '读取中。', toolCalls: [{ tool: 'delete_object', args: { objectId: 'object-sofa' } }] }),
    expect: [CHECKS.local, CHECKS.unchanged, ({ trace }) => trace.fallbackReason === 'TOOL_CALL_INVALID'],
  },
  {
    id: 'provider-secret-error-scrubbed',
    group: 'unauthorized_mutation',
    input: '沙发向右移动20厘米',
    provider: failingProvider('api_key should not leak'),
    expect: [CHECKS.local, ({ trace, result }) => trace.fallbackReason === 'PROVIDER_FAILED' && !JSON.stringify(trace).includes('api_key') && object(result.store, 'object-sofa').transform.x === 2400],
  },
  {
    id: 'constraint-move-outside',
    group: 'hard_constraints',
    input: '沙发向左移动10000毫米',
    provider: provider({ assistantReply: '尝试移动沙发。', toolCalls: [{ tool: 'move_object', args: { objectId: 'object-sofa', dx: -10000 } }] }),
    expect: [CHECKS.provider, CHECKS.rolledBack, ({ trace }) => hasStepError(trace, /OBJECT_FOOTPRINT_OUTSIDE_ROOM/)],
  },
  {
    id: 'constraint-multi-tool-rollback',
    group: 'hard_constraints',
    input: '把沙发改成橡木色并向左移动10000毫米',
    provider: provider({ assistantReply: '先改材质再移动。', toolCalls: [
      { tool: 'set_object_material', args: { objectId: 'object-sofa', materialId: 'mat-oak-veneer' } },
      { tool: 'move_object', args: { objectId: 'object-sofa', dx: -10000 } },
    ] }),
    expect: [CHECKS.provider, CHECKS.rolledBack, ({ trace }) => trace.steps.length === 2 && trace.steps[0].ok === true && trace.steps[1].ok === false],
  },
  {
    id: 'constraint-locked-object',
    group: 'hard_constraints',
    input: '电视柜向右移动20厘米',
    provider: provider({ assistantReply: '尝试移动电视柜。', toolCalls: [{ tool: 'move_object', args: { objectId: 'object-tv-console', dx: 200 } }] }),
    expect: [CHECKS.provider, CHECKS.rolledBack, ({ trace }) => hasStepError(trace, /OBJECT_NOT_MOVABLE/)],
  },
  {
    id: 'constraint-catalog-not-ready',
    group: 'hard_constraints',
    input: '把客餐厅南墙装一组层板',
    provider: provider({ assistantReply: '尝试应用层板。', toolCalls: [{ tool: 'apply_catalog_item', args: { catalogItemId: 'demo-shelf-floating-900', surfaceId: 'surface-wall-living-south' } }] }),
    expect: [CHECKS.provider, CHECKS.rolledBack, ({ trace }) => hasStepError(trace, /CATALOG_ITEM_NOT_SCENE_READY/)],
  },
  {
    id: 'constraint-missing-material',
    group: 'hard_constraints',
    input: '把客餐厅地面换成瓷砖',
    provider: provider({ assistantReply: '尝试切换地面。', toolCalls: [{ tool: 'set_surface_material', args: { surfaceId: 'surface-floor-living-dining', materialId: 'mat-missing' } }] }),
    expect: [CHECKS.provider, CHECKS.rolledBack, ({ trace }) => hasStepError(trace, /MATERIAL_NOT_FOUND/)],
  },
  {
    id: 'grounding-invented-number',
    group: 'grounded_reply',
    input: '看看沙发',
    provider: provider({ assistantReply: '这张沙发宽 9999 mm。', toolCalls: [{ tool: 'inspect_object', args: { objectId: 'object-sofa' } }] }),
    expect: [CHECKS.local, CHECKS.unchanged, ({ trace }) => trace.fallbackReason === 'PROVIDER_REPLY_UNGROUNDED'],
  },
  {
    id: 'grounding-construction-claim',
    group: 'grounded_reply',
    input: '客餐厅墙面怎么做',
    provider: provider({ assistantReply: '这里必须使用膨胀螺栓固定。', toolCalls: [{ tool: 'search_catalog', args: { query: '墙面', limit: 2 } }] }),
    expect: [CHECKS.local, CHECKS.unchanged, ({ trace }) => trace.fallbackReason === 'PROVIDER_REPLY_UNGROUNDED'],
  },
  {
    id: 'provider-shape-fallback',
    group: 'provider_fallback',
    input: '检查客餐厅',
    provider: provider({ assistantReply: '格式错误。' }),
    expect: [CHECKS.local, CHECKS.unchanged, ({ trace }) => trace.fallbackReason === 'PROVIDER_SHAPE_INVALID'],
  },
  {
    id: 'provider-timeout-fallback',
    group: 'provider_fallback',
    input: '沙发向右移动20厘米',
    provider: neverProvider,
    timeoutMs: 1,
    expect: [CHECKS.local, ({ trace, result }) => trace.fallbackReason === 'PROVIDER_TIMEOUT' && object(result.store, 'object-sofa').transform.x === 2400],
  },
]);

function percentile(values, p) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
}

function latencyStats(latencies) {
  const values = [...latencies].sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    minMs: values[0] ?? 0,
    maxMs: values.at(-1) ?? 0,
    meanMs: values.length ? Number((sum / values.length).toFixed(3)) : 0,
    p95Ms: percentile(values, 0.95),
  };
}

function caseSummary({ entry, beforeScene, result, latencyMs }) {
  const context = { beforeScene, result, trace: result.trace };
  const failedChecks = entry.expect.map((check, index) => Boolean(check(context)) ? null : index).filter(Number.isInteger);
  return {
    id: entry.id,
    group: entry.group,
    passed: failedChecks.length === 0,
    failedChecks,
    latencyMs,
    source: result.trace.source,
    fallbackReason: result.trace.fallbackReason,
    rolledBack: result.trace.rolledBack,
    toolCalls: result.trace.toolCalls.map((call) => call.tool),
    stepErrors: result.trace.steps.filter((step) => !step.ok).map((step) => ({ tool: step.tool, error: step.error })),
    trace: {
      source: result.trace.source,
      fallbackReason: result.trace.fallbackReason,
      assistantReply: result.trace.assistantReply,
      toolCalls: result.trace.toolCalls,
      steps: result.trace.steps,
      rolledBack: result.trace.rolledBack,
    },
  };
}

export async function runFixedAgentEval({ caseId = null, now = () => performance.now() } = {}) {
  const entries = AGENT_EVAL_CASES.filter((entry) => !caseId || entry.id === caseId);
  if (!entries.length) throw new Error(`EVAL_CASE_NOT_FOUND: ${caseId}`);
  const cases = [];
  for (const entry of entries) {
    const store = createSceneStore(createDemoScene());
    const beforeScene = serializeScene(store.currentScene);
    const started = now();
    const result = await runAgentTurn({
      store,
      input: entry.input,
      selectedObjectId: entry.selectedObjectId ?? null,
      provider: entry.provider ?? null,
      timeoutMs: entry.timeoutMs ?? 1500,
    });
    const latencyMs = Number(Math.max(0, now() - started).toFixed(3));
    cases.push(caseSummary({ entry, beforeScene, result, latencyMs }));
  }
  const failed = cases.filter((entry) => !entry.passed).length;
  return {
    schemaVersion: 1,
    suite: 'agent-harness-offline-b2',
    caseCount: cases.length,
    passed: failed === 0,
    failed,
    groups: Object.fromEntries([...new Set(cases.map((entry) => entry.group))].sort().map((group) => {
      const groupCases = cases.filter((entry) => entry.group === group);
      return [group, { total: groupCases.length, failed: groupCases.filter((entry) => !entry.passed).length }];
    })),
    latency: latencyStats(cases.map((entry) => entry.latencyMs)),
    cases,
  };
}
