import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

import { callDesignDeepSeek } from '../server/deepseek.mjs';
import { createExperienceScene } from '../server/experience-store.mjs';
import { emptyRequirements, runDesignDialogue } from '../src/agent/dialogue.js';
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
const json = (value) => JSON.stringify(value);
const entity = (scene, id) => [...scene.objects, ...scene.surfaces].find((item) => item.id === id);
const distance = (scene, leftId, rightId) => {
  const left = entity(scene, leftId), right = entity(scene, rightId);
  return Math.hypot(left.transform.x - right.transform.x, left.transform.z - right.transform.z);
};
const sceneChanges = (before, after) => {
  const changes = [];
  for (const item of [...before.objects, ...before.surfaces]) {
    const next = entity(after, item.id);
    if (!next) changes.push({ id: item.id, kind: 'deleted' });
    else if (json(item) !== json(next)) changes.push({
      id: item.id,
      kind: item.id.startsWith('surface-') ? 'surface' : 'object',
      transformChanged: json(item.transform) !== json(next.transform),
      material: item.materialId === next.materialId ? null : [item.materialId, next.materialId],
    });
  }
  for (const item of [...after.objects, ...after.surfaces]) {
    if (!entity(before, item.id)) changes.push({ id: item.id, kind: 'added' });
  }
  return changes;
};
const hasConstraint = (requirements, kind, objectId) => requirements.hardConstraints.some((rule) =>
  rule.kind === kind && (!objectId || !rule.objectIds?.length || rule.objectIds.includes(objectId)));
const isRequestedDeepSeek = (result) => result.trace.provider === 'deepseek'
  && result.trace.providerTrace?.requestedModel === 'deepseek-v4-flash'
  && ['deepseek-v4-flash', 'deepseek-flash'].includes(result.trace.model);
const summarize = ({ id, input, before, result, checks, started }) => {
  const changes = sceneChanges(before, result.store.currentScene);
  return {
    id, input, passed: Object.values(checks).every(Boolean), checks,
    latencyMs: Math.round(performance.now() - started),
    provider: result.trace.provider, model: result.trace.model,
    mode: result.trace.mode, terminationReason: result.trace.terminationReason,
    assistantReply: result.trace.assistantReply,
    modelAttempts: result.trace.modelRequests.length,
    modelRequests: result.trace.modelRequests,
    requestedModel: result.trace.providerTrace?.requestedModel ?? null,
    validationErrors: result.trace.validationFeedback.map((item) => item.error),
    steps: result.trace.steps.map(({ tool, ok, error, disposition }) => ({ tool, ok, error: error ?? null, disposition: disposition ?? null })),
    toolCalls: result.trace.toolCalls,
    changes,
    requirements: {
      confirmed: result.requirements.confirmed.map(({ text, kind, objectIds }) => ({ text, kind, objectIds })),
      hardConstraints: result.requirements.hardConstraints.map(({ text, kind, objectIds }) => ({ text, kind, objectIds })),
      preferences: result.requirements.preferences.map(({ text, kind, objectIds }) => ({ text, kind, objectIds })),
      rejected: result.requirements.rejected.map(({ text, reason }) => ({ text, reason })),
    },
  };
};

const singleCases = [
  {
    id: 'conditional-check-without-preview',
    input: '如果把沙发往右挪会挡门，那就不要动它；先检查，不要预览。',
    selectedObjectId: 'object-sofa', activeRoomId: 'room-living-dining',
    evaluate: ({ before, result }) => {
      const changes = sceneChanges(before, result.store.currentScene);
      return {
        provider: isRequestedDeepSeek(result),
        noWrite: changes.length === 0 && result.trace.toolCalls.length === 0,
        respectedPreviewBan: result.trace.mode !== 'execute',
        useful: /门|规则|检查|不能|无法|需要/.test(result.trace.assistantReply),
        noDefinitiveGuessWithoutDistance: !/(?:确实|一定|肯定|必然).{0,24}(?:挡|碰撞|越界|风险)/.test(result.trace.assistantReply),
      };
    },
  },
  {
    id: 'objects-absent-from-canonical-scene',
    input: '厨房加个岛台，再把冰箱换到另一边，预算两万内。',
    selectedObjectId: 'surface-floor-kitchen', activeRoomId: 'room-kitchen',
    evaluate: ({ before, result }) => ({
      provider: isRequestedDeepSeek(result),
      noFabricatedWrite: sceneChanges(before, result.store.currentScene).length === 0 && result.trace.toolCalls.length === 0,
      honestBoundary: result.trace.mode !== 'execute' && /岛台|冰箱|当前|没有|无法|不能|缺少|未/.test(result.trace.assistantReply),
      noFabricatedLocation: !/(?:门洞|靠窗|厨房外)/.test(result.trace.assistantReply),
      noPriceClaim: !/(?:报价|预算).{0,8}(?:可以|足够|没问题|能做)/.test(result.trace.assistantReply),
    }),
  },
  {
    id: 'contradictory-position-instructions',
    input: '把茶几往餐桌靠近200毫米，但所有家具位置都不动。',
    selectedObjectId: 'object-coffee-table', activeRoomId: 'room-living-dining',
    evaluate: ({ before, result }) => ({
      provider: isRequestedDeepSeek(result),
      noWrite: sceneChanges(before, result.store.currentScene).length === 0 && result.trace.toolCalls.length === 0,
      surfacesConflict: result.trace.mode !== 'execute' && /冲突|同时|位置不动|不能|无法|确认/.test(result.trace.assistantReply),
      noStepExhaustion: result.trace.mode !== 'failed',
    }),
  },
  {
    id: 'autonomous-small-material-trial',
    input: '沙发看着太沉了，别问我颜色，你先基于现有材质做一个可撤销尝试，位置不动。',
    selectedObjectId: 'object-sofa', activeRoomId: 'room-living-dining',
    evaluate: ({ before, result }) => {
      const afterSofa = entity(result.store.currentScene, 'object-sofa');
      const beforeSofa = entity(before, 'object-sofa');
      const changes = sceneChanges(before, result.store.currentScene);
      return {
        provider: isRequestedDeepSeek(result),
        madePreview: result.trace.terminationReason === 'legal_preview',
        materialOnly: changes.length === 1 && changes[0].id === 'object-sofa' && changes[0].material && !changes[0].transformChanged,
        meaningfulChange: afterSofa.materialId !== beforeSofa.materialId,
        persistedPositionConstraint: hasConstraint(result.requirements, 'lock_transform', 'object-sofa'),
      };
    },
  },
  {
    id: 'agent-chooses-relative-distance',
    input: '餐桌别动。茶几离餐桌稍微远一点就行，不要问我毫米数。',
    selectedObjectId: 'object-dining-table', activeRoomId: 'room-living-dining',
    evaluate: ({ before, result }) => {
      const changes = sceneChanges(before, result.store.currentScene);
      return {
        provider: isRequestedDeepSeek(result),
        madePreview: result.trace.terminationReason === 'legal_preview',
        onlyCoffeeTableMoved: changes.length === 1 && changes[0].id === 'object-coffee-table' && changes[0].transformChanged,
        movedAway: distance(result.store.currentScene, 'object-coffee-table', 'object-dining-table') > distance(before, 'object-coffee-table', 'object-dining-table'),
        usedGroundedRelation: result.trace.toolCalls.some((call) => call.tool === 'move_relative_to_object' && call.args.relation === 'away'),
        persistedDiningConstraint: hasConstraint(result.requirements, 'lock_transform', 'object-dining-table'),
      };
    },
  },
  {
    id: 'explicit-room-over-stale-selection',
    input: '主卧地板换成暖灰瓷砖，其他房间不要动。',
    selectedObjectId: 'surface-floor-living-dining', activeRoomId: 'room-living-dining',
    evaluate: ({ before, result }) => {
      const changes = sceneChanges(before, result.store.currentScene);
      return {
        provider: isRequestedDeepSeek(result),
        madePreview: result.trace.terminationReason === 'legal_preview',
        correctOnlyTarget: changes.length === 1 && changes[0].id === 'surface-floor-primary-bedroom',
        correctMaterial: entity(result.store.currentScene, 'surface-floor-primary-bedroom').materialId === 'mat-floor-tile-warm',
        didNotUseSelection: entity(result.store.currentScene, 'surface-floor-living-dining').materialId === entity(before, 'surface-floor-living-dining').materialId,
      };
    },
  },
  {
    id: 'explicit-object-over-stale-selection',
    input: '把儿童房的床离书桌远一点，其他家具的位置都不变。',
    selectedObjectId: 'object-sofa', activeRoomId: 'room-living-dining',
    evaluate: ({ before, result }) => {
      const changes = sceneChanges(before, result.store.currentScene);
      return {
        provider: isRequestedDeepSeek(result),
        madePreview: result.trace.terminationReason === 'legal_preview',
        onlyChildBedMoved: changes.length === 1 && changes[0].id === 'object-flex-bed' && changes[0].transformChanged,
        movedAwayFromDesk: distance(result.store.currentScene, 'object-flex-bed', 'object-flex-desk') > distance(before, 'object-flex-bed', 'object-flex-desk'),
        didNotMoveSelectedSofa: json(entity(result.store.currentScene, 'object-sofa').transform) === json(entity(before, 'object-sofa').transform),
        persistedOtherFurniture: hasConstraint(result.requirements, 'lock_transform', 'object-sofa'),
      };
    },
  },
];

const reports = [];
for (const entry of singleCases) {
  const store = createSceneStore(createExperienceScene());
  const before = structuredClone(store.currentScene);
  const started = performance.now();
  const result = await runDesignDialogue({
    store, input: entry.input, selectedObjectId: entry.selectedObjectId,
    activeRoomId: entry.activeRoomId, requestId: `adversarial-${entry.id}`,
    provider, deadlineMs: 85_000, maxSteps: 6,
  });
  reports.push(summarize({ ...entry, before, result, checks: entry.evaluate({ before, result }), started }));
}

{
  const id = 'cross-turn-psychology-correction';
  const firstInput = '客厅让我坐着像在上班。';
  const secondInput = '没有心理原因，我只是觉得沙发太灰；位置别动，直接给个现有材质试试。';
  const store = createSceneStore(createExperienceScene());
  const before = structuredClone(store.currentScene);
  const started = performance.now();
  const first = await runDesignDialogue({ store, input: firstInput, requestId: `${id}-1`, provider });
  const second = await runDesignDialogue({
    store: first.store, requirements: first.requirements, input: secondInput,
    conversation: [
      { id: `${id}-1`, role: 'user', text: firstInput },
      { id: `${id}-1-assistant`, role: 'assistant', text: first.trace.assistantReply, trace: first.trace },
    ],
    selectedObjectId: 'object-sofa', activeRoomId: 'room-living-dining',
    requestId: `${id}-2`, provider,
  });
  const oldHypotheses = first.requirements.hypotheses.map((item) => item.id);
  const changes = sceneChanges(before, second.store.currentScene);
  const beforeSofa = entity(before, 'object-sofa');
  const afterSofa = entity(second.store.currentScene, 'object-sofa');
  const visibleMaterialIds = new Set([beforeSofa?.materialId, afterSofa?.materialId]);
  const unshownMaterialNames = before.materials
    .filter((material) => material.name && second.trace.assistantReply.includes(material.name)
      && !visibleMaterialIds.has(material.id))
    .map((material) => material.name);
  const checks = {
    provider: isRequestedDeepSeek(second),
    madePreview: second.trace.terminationReason === 'legal_preview',
    sofaMaterialOnly: changes.length === 1 && changes[0].id === 'object-sofa' && changes[0].material && !changes[0].transformChanged,
    acceptsCorrection: !/(?:心理|情绪|工作状态).*(?:可能|因为|导致)/.test(second.trace.assistantReply),
    retractsAnyOldHypothesis: oldHypotheses.length === 0 || oldHypotheses.every((hypothesisId) => !second.requirements.hypotheses.some((item) => item.id === hypothesisId)),
    persistedPositionConstraint: hasConstraint(second.requirements, 'lock_transform', 'object-sofa'),
    oneVisibleMaterialTrial: second.trace.toolCalls.filter((call) => call.tool === 'set_object_material' && call.args.objectId === 'object-sofa').length === 1,
    noUnappliedMaterialClaim: unshownMaterialNames.length === 0,
  };
  reports.push({
    ...summarize({ id, input: `${firstInput} -> ${secondInput}`, before, result: second, checks, started }),
    firstTurn: {
      mode: first.trace.mode, assistantReply: first.trace.assistantReply,
      hypotheses: first.requirements.hypotheses.map(({ id: hypothesisId, text }) => ({ id: hypothesisId, text })),
      modelAttempts: first.trace.modelRequests.length,
      modelRequests: first.trace.modelRequests,
    },
  });
}

const failed = reports.filter((report) => !report.passed);
const usage = reports.reduce((total, report) => total + report.modelAttempts + (report.firstTurn?.modelAttempts ?? 0), 0);
console.log(JSON.stringify({
  schemaVersion: 1,
  suite: 'dialogue-harness-adversarial-v1',
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  provider: 'deepseek', model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
  caseCount: reports.length, passed: failed.length === 0, failed: failed.length,
  modelTurns: usage, reports,
}, null, 2));
if (failed.length) process.exitCode = 1;
