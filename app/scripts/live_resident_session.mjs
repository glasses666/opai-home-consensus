import assert from 'node:assert/strict';

import { runAgentTurn } from '../src/agent/harness.js';
import { callAily } from '../server/feishu.mjs';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createDesignBrief } from '../src/domain/design-brief.js';
import { createSceneStore } from '../src/domain/scene.js';

if (!process.env.AILY_AGENT_ID && !process.env.AILY_APP_ID) throw new Error('AILY_AGENT_ID_MISSING');

const turns = [
  '我们一家三口住在南方，小户型，有孩子、玩具很多，喜欢浅木但不想全屋白。先给我两个客餐厅方向，不要改房屋。',
  '我选更温暖克制的方向。把开放客餐厅南墙改成浅橡木木饰面，其他地方先别动。',
  '看起来可以。把沙发向右移动20厘米，给孩子的活动区多留一点空间。',
  '我想看看极端情况：把沙发向左移动10000毫米。',
  '越界就不要改了。我还想在客餐厅加一组悬浮层板。',
];

let store = createSceneStore(createDemoScene());
let designBrief = createDesignBrief();
const results = [];

console.log('=== 住户连续会话 · 同一 DesignBrief / 同一 canonical scene ===');
console.log('说明：Aily 负责规划；所有写入由本地 Harness 与 SceneCommand 校验。\n');

for (const [index, input] of turns.entries()) {
  console.log(`\n住户 [${index + 1}/${turns.length}]`);
  console.log(input);
  console.log('\nAily 正在思考…');
  const beforeCommands = store.commands.length;
  const result = await runAgentTurn({
    store,
    input,
    provider: (context) => callAily(context, {
      agentId: process.env.AILY_AGENT_ID,
      appId: process.env.AILY_APP_ID,
      timeoutMs: 50_000,
      maxAttempts: 2,
    }),
    designBrief,
    timeoutMs: 105_000,
  });
  store = result.store;
  designBrief = result.trace.designBrief;
  results.push(result);
  const newCommands = store.commands.slice(beforeCommands);
  console.log(`\nAily：${result.trace.assistantReply || '没有解释文本。'}`);
  console.log(`合同：mode=${result.trace.mode} · source=${result.trace.source} · fallback=${result.trace.fallbackReason ?? 'none'}`);
  console.log(`依据：${result.trace.reasons?.join('；') || '无'}`);
  console.log(`未决：${result.trace.unresolved?.join('；') || '无'}`);
  console.log(`工具：${result.trace.toolCalls.length ? result.trace.toolCalls.map((call) => `${call.tool}(${JSON.stringify(call.args)})`).join(' → ') : '无写入 / 无工具'}`);
  console.log(`校验：${result.trace.steps.length ? result.trace.steps.map((step) => step.ok ? `${step.tool}=ok` : `${step.tool}=blocked: ${step.error}`).join('；') : '只读回合'}`);
  console.log(`场景：${result.trace.rolledBack ? '本轮原子回滚' : newCommands.length ? `新增 ${newCommands.length} 条 SceneCommand` : '未改变'}`);
}

const sofa = store.currentScene.objects.find((object) => object.id === 'object-sofa');
const wall = store.currentScene.surfaces.find((surface) => surface.id === 'surface-wall-living-south');
console.log('\n=== 会话结束 ===');
console.log(`最终沙发坐标：x=${sofa.transform.x} z=${sofa.transform.z}`);
console.log(`最终南墙材质：${wall.materialId}`);
console.log(`累计 SceneCommand：${store.commands.length}`);

const providerTurns = results.filter((result) => result.trace.source === 'provider').length;
assert.ok(providerTurns > 0, '必须有至少一轮真实 Aily 成功参与');
assert.deepEqual(results.map((result) => result.trace.mode), ['propose', 'execute', 'execute', 'execute', 'clarify']);
assert.equal(results[3].trace.rolledBack, true, '越界移动必须原子回滚');
assert.equal(results[4].store.commands.length, 2, '澄清轮不得写入场景');
assert.equal(sofa.transform.x, 2400);
assert.equal(wall.materialId, 'mat-wall-oak-panel');
assert.equal(store.commands.length, 2);
console.log(`验收：passed · 真实 Aily ${providerTurns}/5 · 安全降级 ${5 - providerTurns}/5 · 越界回滚 · 澄清禁写 · 最终场景一致`);
