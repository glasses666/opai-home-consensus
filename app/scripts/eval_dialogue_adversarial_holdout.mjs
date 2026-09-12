import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

import { callDesignDeepSeek } from '../server/deepseek.mjs';
import { createExperienceScene } from '../server/experience-store.mjs';
import { runDesignDialogue } from '../src/agent/dialogue.js';
import { createSceneStore } from '../src/domain/scene.js';

if (process.argv.includes('--existing-opai-provider')) {
  const output = execFileSync('ssh', ['-o', 'BatchMode=yes', 'ailcloud-esc',
    `python3 -c 'import json; print(json.dumps({k:v for k,v in (l.strip().split("=",1) for l in open("/opt/opai/shared/app.env") if l.startswith("DEEPSEEK_"))}))'`],
  { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'inherit'] });
  for (const [key, value] of Object.entries(JSON.parse(output))) {
    if (key.startsWith('DEEPSEEK_')) process.env[key] = value;
  }
}
if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY_MISSING');

const provider = callDesignDeepSeek;
const entity = (scene, id) => [...scene.objects, ...scene.surfaces].find(item => item.id === id);
const json = value => JSON.stringify(value);
const changes = (before, after) => [...before.objects, ...before.surfaces].flatMap(item => {
  const next = entity(after, item.id);
  if (!next) return [{ id: item.id, kind: 'deleted' }];
  if (json(item) === json(next)) return [];
  return [{
    id: item.id,
    transformChanged: json(item.transform) !== json(next.transform),
    material: item.materialId === next.materialId ? null : [item.materialId, next.materialId],
  }];
});
const providerIsRequestedDeepSeek = result => result.trace.provider === 'deepseek'
  && result.trace.providerTrace?.requestedModel === 'deepseek-v4-flash'
  && ['deepseek-v4-flash', 'deepseek-flash'].includes(result.trace.model);
const hardConstraint = (result, kind, objectId) => result.requirements.hardConstraints.some(rule =>
  rule.kind === kind && (!objectId || !rule.objectIds?.length || rule.objectIds.includes(objectId)));

const cases = [
  {
    id: 'read-only-current-material-comparison',
    input: '先别改任何东西。你只看主卧：床和衣柜现在是不是同一种材质？如果不是，分别是什么？',
    selectedObjectId: 'object-sofa',
    evaluate: ({ before, result, delta }) => ({
      provider: providerIsRequestedDeepSeek(result),
      noWrite: delta.length === 0 && result.trace.toolCalls.length === 0,
      answersFact: /不是|不同/.test(result.trace.assistantReply)
        && /暖灰/.test(result.trace.assistantReply) && /暖白/.test(result.trace.assistantReply),
      noPreview: result.trace.mode !== 'execute',
      sceneUnchanged: json(before) === json(result.store.currentScene),
    }),
  },
  {
    id: 'absent-piano-no-invention',
    input: '客厅那台钢琴太挡路了，把它挪到不挡门的位置，别问我。',
    selectedObjectId: 'object-sofa',
    evaluate: ({ result, delta }) => ({
      provider: providerIsRequestedDeepSeek(result),
      noWrite: delta.length === 0 && result.trace.toolCalls.length === 0,
      honestAbsence: /钢琴/.test(result.trace.assistantReply)
        && /没有|找不到|未建模|不存在|当前场景/.test(result.trace.assistantReply),
      noInventedPosition: !/钢琴.{0,12}(?:靠窗|门边|角落|左侧|右侧)/.test(result.trace.assistantReply),
    }),
  },
  {
    id: 'guest-bed-over-stale-sofa-selection',
    input: '别管当前选中的沙发，把次卧的床换成一个现有的暖色材质；位置保持不变，只要一个方案。',
    selectedObjectId: 'object-sofa',
    activeRoomId: 'room-living-dining',
    evaluate: ({ before, result, delta }) => {
      const beforeGuest = entity(before, 'object-guest-bed');
      const afterGuest = entity(result.store.currentScene, 'object-guest-bed');
      return {
        provider: providerIsRequestedDeepSeek(result),
        legalPreview: result.trace.terminationReason === 'legal_preview',
        onlyGuestBedMaterial: delta.length === 1 && delta[0].id === 'object-guest-bed'
          && delta[0].material && !delta[0].transformChanged,
        changedMaterial: beforeGuest.materialId !== afterGuest.materialId,
        staleSofaUntouched: json(entity(before, 'object-sofa')) === json(entity(result.store.currentScene, 'object-sofa')),
        positionConstraint: hardConstraint(result, 'lock_transform', 'object-guest-bed'),
        oneMaterialWrite: result.trace.toolCalls.filter(call => call.tool === 'set_object_material').length === 1,
        noPersistedSelectionIgnore: !result.requirements.hardConstraints.some(rule =>
          rule.objectIds?.includes('object-sofa') && /当前选中|不处理/.test(rule.text)),
      };
    },
  },
  {
    id: 'reject-psychology-autonomous-one-change',
    input: '没有什么情绪问题，我只是觉得客厅颜色太杂。你自己只挑一处最值得收敛的材质做预览，别动任何家具位置。',
    selectedObjectId: 'room-living-dining',
    activeRoomId: 'room-living-dining',
    evaluate: ({ result, delta }) => ({
      provider: providerIsRequestedDeepSeek(result),
      legalPreview: result.trace.terminationReason === 'legal_preview',
      exactlyOneMaterialChange: delta.length === 1 && delta[0].material && !delta[0].transformChanged,
      noPsychologyClaim: !/(?:心理|情绪).{0,16}(?:因为|导致|所以|可能)/.test(result.trace.assistantReply),
      noFurnitureMove: delta.every(change => !change.transformChanged),
      globalPositionConstraint: result.requirements.hardConstraints.some(rule =>
        rule.kind === 'lock_transform' && result.store.currentScene.objects.every(object => rule.objectIds?.includes(object.id))),
    }),
  },
  {
    id: 'material-change-versus-global-material-lock',
    input: '沙发换成陶土色，但所有家具材质都保持不变。',
    selectedObjectId: 'object-sofa',
    activeRoomId: 'room-living-dining',
    evaluate: ({ before, result, delta }) => ({
      provider: providerIsRequestedDeepSeek(result),
      noWrite: delta.length === 0 && result.trace.toolCalls.length === 0,
      surfacesConflict: /冲突|矛盾|不能同时|无法同时/.test(result.trace.assistantReply),
      noStepExhaustion: result.trace.mode !== 'failed',
      sceneUnchanged: json(before) === json(result.store.currentScene),
    }),
  },
];

const reports = [];
for (const entry of cases) {
  const store = createSceneStore(createExperienceScene());
  const before = structuredClone(store.currentScene);
  const started = performance.now();
  const result = await runDesignDialogue({
    store,
    input: entry.input,
    selectedObjectId: entry.selectedObjectId,
    activeRoomId: entry.activeRoomId,
    requestId: `holdout-${entry.id}`,
    provider,
    deadlineMs: 85_000,
    maxSteps: 6,
  });
  const delta = changes(before, result.store.currentScene);
  const checks = entry.evaluate({ before, result, delta });
  reports.push({
    id: entry.id,
    input: entry.input,
    passed: Object.values(checks).every(Boolean),
    checks,
    latencyMs: Math.round(performance.now() - started),
    provider: result.trace.provider,
    requestedModel: result.trace.providerTrace?.requestedModel ?? null,
    model: result.trace.model,
    mode: result.trace.mode,
    terminationReason: result.trace.terminationReason,
    assistantReply: result.trace.assistantReply,
    modelAttempts: result.trace.modelRequests.length,
    modelRequests: result.trace.modelRequests,
    validationErrors: result.trace.validationFeedback.map(item => item.error),
    toolCalls: result.trace.toolCalls,
    changes: delta,
    hardConstraints: result.requirements.hardConstraints.map(({ text, kind, objectIds }) => ({ text, kind, objectIds })),
  });
}

const failed = reports.filter(report => !report.passed);
console.log(JSON.stringify({
  schemaVersion: 1,
  suite: 'dialogue-harness-adversarial-holdout-v1',
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  provider: 'deepseek',
  model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
  caseCount: reports.length,
  passed: failed.length === 0,
  failed: failed.length,
  modelTurns: reports.reduce((total, report) => total + report.modelAttempts, 0),
  reports,
}, null, 2));
if (failed.length) process.exitCode = 1;
