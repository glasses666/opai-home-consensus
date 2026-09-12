import { execFileSync } from 'node:child_process';

import { callDeepSeek } from '../server/deepseek.mjs';
import { createExperienceScene } from '../server/experience-store.mjs';

if (process.argv.includes('--existing-opai-provider')) {
  const output = execFileSync('ssh', ['-o', 'BatchMode=yes', 'ailcloud-esc',
    `python3 -c 'import json; print(json.dumps({k:v for k,v in (l.strip().split("=",1) for l in open("/opt/opai/shared/app.env") if l.startswith("DEEPSEEK_"))}))'`],
  { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'inherit'] });
  for (const [key, value] of Object.entries(JSON.parse(output))) {
    if (key.startsWith('DEEPSEEK_')) process.env[key] = value;
  }
}

const scene = createExperienceScene();
const facts = {
  units: 'mm', axes: scene.floorPlan.axes,
  objects: scene.objects.map(({ id, name, roomId, transform, dimensions, materialId, capabilities }) =>
    ({ id, name, roomId, transform, dimensions, materialId, capabilities })),
  openings: scene.openings,
  materials: scene.materials.map(({ id, name, appliesTo }) => ({ id, name, appliesTo })),
};
const cases = [
  {
    id: 'conditional-check-without-preview',
    history: [],
    input: '如果把沙发往右挪会挡门，那就不要动它；先检查，不要预览。',
  },
  {
    id: 'contradictory-position-instructions',
    history: [],
    input: '把茶几往餐桌靠近200毫米，但所有家具位置都不动。',
  },
  {
    id: 'agent-chooses-relative-distance',
    history: [],
    input: '餐桌别动。茶几离餐桌稍微远一点就行，不要问我毫米数。',
  },
  {
    id: 'explicit-object-over-stale-selection',
    history: [],
    input: '把儿童房的床离书桌远一点，其他家具的位置都不变。',
    selectedContext: { objectId: 'object-sofa', roomId: 'room-living-dining' },
  },
  {
    id: 'cross-turn-psychology-correction',
    history: [
      { role: 'user', text: '客厅让我坐着像在上班。' },
      { role: 'assistant', text: '你坐下时更像是在等屏幕，还是觉得沙发太硬？' },
    ],
    input: '没有心理原因，我只是觉得沙发太灰；位置别动，直接给个现有材质试试。',
  },
];

const reports = [];
for (const entry of cases) {
  const result = await callDeepSeek({ prompt: `你是空间设计判断器。下面给出用户原话和 canonical scene 事实。只判断下一步，不执行、不保存。
优先服从用户文字而非页面旧选中；不编造场景里没有的对象；“不要预览”表示只读检查；互相冲突的条件要指出冲突；“稍微”可自行选择保守的100-400毫米，但需先观察关系；位置不变不等于材质不变。一次可撤销尝试只能声称实际选择的一种最终材质。
可用思路只有：读取对象/房间/规则、读取两个对象关系、朝参考对象靠近或远离、改一个现有对象的材质、追问、说明不支持。
只返回JSON：{"decision":"inspect|clarify|preview|unsupported","reply":"中文短回复","plan":[{"action":"动作","targetId":"可选","referenceId":"可选","amountMm":"可选数字"}],"constraints":[{"kind":"位置不变|材质不变|不新增","targetIds":[]}]}。
历史：${JSON.stringify(entry.history)}
页面旧选中：${JSON.stringify(entry.selectedContext ?? null)}
用户本轮：${entry.input}
场景事实：${JSON.stringify(facts)}` }, { timeoutMs: 40_000, maxTokens: 1200 });
  reports.push({
    id: entry.id, input: entry.input,
    requestedModel: result.providerTrace.requestedModel,
    responseModel: result.providerTrace.model,
    result: Object.fromEntries(Object.entries(result)),
  });
}
console.log(JSON.stringify({ schemaVersion: 1, suite: 'dialogue-raw-control-v1', reports }, null, 2));
