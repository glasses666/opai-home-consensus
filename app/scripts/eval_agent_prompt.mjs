import { runAgentTurn } from '../src/agent/harness.js';
import { callAily } from '../server/feishu.mjs';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore } from '../src/domain/scene.js';

const agentId = process.env.AILY_AGENT_ID;
if (!agentId) throw new Error('AILY_AGENT_ID_MISSING');

const WRITE_TOOLS = new Set(['move_object', 'rotate_object', 'set_object_material', 'set_surface_material', 'apply_catalog_item']);
const requestedCase = process.argv.find((arg) => arg.startsWith('--case='))?.slice('--case='.length);
const cases = [
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
    check: (result) => !result.trace.toolCalls.some((call) => WRITE_TOOLS.has(call.tool)) &&
      result.trace.steps.every((step) => step.ok) &&
      result.trace.assistantReply.length > 0 && result.trace.assistantReply.length <= 250 &&
      !/250|350/.test(result.trace.assistantReply),
  },
  {
    id: 'sofa-move',
    input: '把沙发向右移动20厘米',
    check: (result) => result.trace.toolCalls.some((call) => call.tool === 'move_object') &&
      result.trace.steps.every((step) => step.ok) &&
      result.store.currentScene.objects.find((object) => object.id === 'object-sofa')?.transform.x === 2400,
  },
].filter((entry) => !requestedCase || entry.id === requestedCase);

if (!cases.length) throw new Error(`EVAL_CASE_NOT_FOUND: ${requestedCase}`);

let failed = 0;
for (const entry of cases) {
  const result = await runAgentTurn({
    store: createSceneStore(createDemoScene()),
    input: entry.input,
    provider: (context) => callAily(context, { agentId, timeoutMs: 35_000, maxAttempts: 1 }),
    timeoutMs: 40_000,
  });
  const passed = entry.check(result);
  if (!passed) failed += 1;
  console.log(JSON.stringify({
    id: entry.id,
    passed,
    providerAccepted: result.trace.source === 'provider',
    source: result.trace.source,
    fallbackReason: result.trace.fallbackReason,
    assistantReply: result.trace.assistantReply,
    toolCalls: result.trace.toolCalls,
    steps: result.trace.steps.map((step) => ({ ok: step.ok, tool: step.tool, error: step.error ?? null })),
  }));
}

if (failed) process.exitCode = 1;
