import assert from 'node:assert/strict';
import test from 'node:test';

import { emptyRequirements, runDesignDialogue } from '../src/agent/dialogue.js';
import { executeTool } from '../src/agent/harness.js';
import { createReferenceHome } from '../src/domain/reference-home.js';
import { createSceneStore, serializeScene } from '../src/domain/scene.js';
import { createVersionHistory, deserializeVersionHistory, saveSceneVersion, sceneStoreForVersion, serializeVersionHistory } from '../src/domain/design-version.js';
import { validatedWorkingStore } from '../server/experience-store.mjs';

const providerTrace = { provider: 'deepseek', model: 'deepseek-v4-flash' };
const blankPatch = () => ({
  hypotheses: [], confirmed: [], hardConstraints: [], preferences: [], unresolved: [], retract: [],
});
const oldReferenceStore = () => {
  const scene = createReferenceHome();
  scene.materials = scene.materials.filter(material => material.id !== 'mat-floor-dark-walnut');
  return createSceneStore(scene);
};
const floorIds = store => store.currentScene.surfaces.filter(surface => surface.kind === 'floor').map(surface => surface.id);

test('whole-home material tool adds the supported demo material to an old project and changes every floor atomically', async () => {
  const initial = oldReferenceStore();
  const ids = floorIds(initial);
  const changed = await executeTool(initial, {
    tool: 'set_surface_group_material',
    args: { surfaceIds: ids, materialId: 'mat-floor-dark-walnut' },
  });
  assert.equal(changed.store.currentScene.materials.some(material => material.id === 'mat-floor-dark-walnut'), true);
  assert.equal(changed.store.currentScene.surfaces.filter(surface => surface.kind === 'floor')
    .every(surface => surface.materialId === 'mat-floor-dark-walnut'), true);
  assert.equal(changed.store.cursor - initial.cursor, ids.length + 1, 'old histories add one material plus one command per floor');

  const before = serializeScene(initial.currentScene);
  await assert.rejects(executeTool(initial, {
    tool: 'set_surface_group_material',
    args: { surfaceIds: [...ids.slice(0, 2), 'surface-missing'], materialId: 'mat-floor-dark-walnut' },
  }), /SURFACE_NOT_FOUND/);
  assert.equal(serializeScene(initial.currentScene), before, 'a rejected group cannot mutate the caller store');
});

test('a new explicit whole-home floor request narrows only the stale material lock and accepts a provider-shaped preview', async () => {
  const initial = oldReferenceStore();
  const ids = floorIds(initial);
  const allEntityIds = [...initial.currentScene.objects, ...initial.currentScene.surfaces].map(entity => entity.id);
  const requirements = {
    ...emptyRequirements(),
    hardConstraints: [{
      id: 'old-colors-stay', text: '颜色也不用改', quote: '颜色也不用改', objectIds: allEntityIds,
      kind: 'lock_material', sourceTurnId: 'old-tea-table-turn', status: 'user_stated',
    }],
  };
  const input = '把全屋地板改成深棕色';
  const result = await runDesignDialogue({
    store: initial, requirements, input, requestId: 'whole-home-floor',
    provider: async ({ prompt }) => {
      const context = JSON.parse(prompt.slice(prompt.lastIndexOf('\n数据：\n') + '\n数据：\n'.length));
      assert.deepEqual([...context.currentMaterialIntent.surfaceIds].sort(), [...ids].sort());
      assert.equal(context.currentMaterialIntent.materialId, 'mat-floor-dark-walnut');
      assert.equal(context.requirements.hardConstraints[0].objectIds.some(id => ids.includes(id)), false);
      assert.equal(context.observations[0].result.materials.some(material => material.id === 'mat-floor-dark-walnut'), true);
      return {
        action: 'preview', assistantReply: '已把全屋九个房间的地板统一为深棕胡桃木预览，家具和墙面不变。',
        requirementsPatch: blankPatch(),
        toolCalls: [{ tool: 'set_surface_group_material', args: { surfaceIds: ids, materialId: 'mat-floor-dark-walnut' } }],
        reasons: [{ requirementText: input, fact: '当前场景有九个可编辑地面', objectIds: ids, tradeoff: '厨房和卫生间也统一为木色，仅作可撤销演示', sourceIds: [] }],
        providerTrace,
      };
    },
  });
  assert.equal(result.trace.terminationReason, 'legal_preview');
  assert.equal(result.trace.provider, 'deepseek');
  assert.equal(result.store.currentScene.surfaces.filter(surface => surface.kind === 'floor')
    .every(surface => surface.materialId === 'mat-floor-dark-walnut'), true);
  const remainingLock = result.requirements.hardConstraints.find(rule => rule.id === 'old-colors-stay');
  assert.equal(remainingLock.objectIds.some(id => ids.includes(id)), false);
  assert.equal(remainingLock.objectIds.includes('object-sofa'), true);
  assert.equal(remainingLock.objectIds.some(id => id.startsWith('surface-wall-')), true);
  assert.deepEqual(remainingLock.scopeOverrides[0].releasedObjectIds.sort(), [...ids].sort());
});

test('negative, question, and incompatible material wording never release an existing material lock', async () => {
  for (const input of [
    '不要把全屋地板改成深棕色',
    '把全屋地板改成深棕色吗？',
    '把全屋墙面改成深棕色',
  ]) {
    const initial = oldReferenceStore();
    const requirements = {
      ...emptyRequirements(),
      hardConstraints: [{
        id: 'global-lock', text: '颜色保持', quote: '颜色保持', objectIds: [],
        kind: 'lock_material', sourceTurnId: 'prior', status: 'user_stated',
      }],
    };
    const result = await runDesignDialogue({
      store: initial, requirements, input, requestId: `safe-${input}`,
      provider: async ({ prompt }) => {
        const context = JSON.parse(prompt.slice(prompt.lastIndexOf('\n数据：\n') + '\n数据：\n'.length));
        assert.equal(context.currentMaterialIntent, null);
        return { action: 'clarify', question: '这次是否要修改材质？', requirementsPatch: blankPatch(), providerTrace };
      },
    });
    assert.equal(result.requirements.hardConstraints[0].objectIds.length, 0);
    assert.equal(result.requirements.rejected.length, 0);
  }
});

test('an explicitly named room takes precedence over a stale selected surface when narrowing the lock', async () => {
  const initial = oldReferenceStore();
  const allEntityIds = [...initial.currentScene.objects, ...initial.currentScene.surfaces].map(entity => entity.id);
  const requirements = {
    ...emptyRequirements(),
    hardConstraints: [{ id: 'lock', text: '颜色保持', quote: '颜色保持', objectIds: allEntityIds, kind: 'lock_material', sourceTurnId: 'prior', status: 'user_stated' }],
  };
  const result = await runDesignDialogue({
    store: initial, requirements, selectedObjectId: 'surface-floor-flex',
    input: '把厨房地板改成暖灰色', requestId: 'kitchen-floor',
    provider: async ({ prompt }) => {
      const context = JSON.parse(prompt.slice(prompt.lastIndexOf('\n数据：\n') + '\n数据：\n'.length));
      assert.deepEqual(context.currentMaterialIntent.surfaceIds, ['surface-floor-kitchen']);
      return { action: 'clarify', question: '厨房地板将使用现有暖灰砖，是否继续？', requirementsPatch: blankPatch(), providerTrace };
    },
  });
  const lock = result.requirements.hardConstraints.find(rule => rule.id === 'lock');
  assert.equal(lock.objectIds.includes('surface-floor-kitchen'), false);
  assert.equal(lock.objectIds.includes('surface-floor-flex'), true);
});

test('an old project can keep the unsaved material preview, continue, save, and reopen it byte-identically', async () => {
  const initial = oldReferenceStore();
  const history = createVersionHistory(initial, { id: 'history-old-material' });
  const preview = await executeTool(initial, {
    tool: 'set_surface_group_material',
    args: { surfaceIds: floorIds(initial), materialId: 'mat-floor-dark-walnut' },
  });
  const continued = validatedWorkingStore(serializeScene(preview.store.currentScene), history, emptyRequirements());
  assert.equal(serializeScene(continued.currentScene), serializeScene(preview.store.currentScene));
  const saved = saveSceneVersion(history, continued, { id: 'version-dark-floor' });
  const reopened = deserializeVersionHistory(serializeVersionHistory(saved));
  assert.equal(serializeScene(sceneStoreForVersion(reopened).currentScene), serializeScene(preview.store.currentScene));
});

test('a short confirmation inherits only the immediately preceding yes-no material request', async () => {
  const initial = oldReferenceStore();
  const ids = floorIds(initial);
  const priorInput = '把全屋地板改成深棕色';
  const result = await runDesignDialogue({
    store: initial, input: '允许', requestId: 'confirm-floor',
    conversation: [
      { id: 'prior-floor', role: 'user', text: priorInput },
      { id: 'prior-floor-assistant', role: 'assistant', text: '是否允许我把全屋地板改成深棕色？', trace: { terminationReason: 'clarify' } },
    ],
    provider: async ({ prompt }) => {
      const context = JSON.parse(prompt.slice(prompt.lastIndexOf('\n数据：\n') + '\n数据：\n'.length));
      assert.equal(context.confirmationContext.priorUserInput, priorInput);
      assert.equal(context.currentMaterialIntent.materialId, 'mat-floor-dark-walnut');
      return {
        action: 'preview', assistantReply: '按刚才确认的范围生成全屋深棕地板预览。', requirementsPatch: blankPatch(),
        toolCalls: [{ tool: 'set_surface_group_material', args: { surfaceIds: ids, materialId: 'mat-floor-dark-walnut' } }],
        reasons: [{ requirementText: priorInput, fact: '九个地面均可编辑', objectIds: ids, tradeoff: '全屋统一色调', sourceIds: [] }],
        providerTrace,
      };
    },
  });
  assert.equal(result.trace.terminationReason, 'legal_preview');
  assert.equal(result.requirements.confirmed.some(item => item.lastConfirmationQuote === '允许'
    || item.quote === '允许'), true);
});

test('an affirmative answer does not choose between two stale alternatives', async () => {
  const initial = oldReferenceStore();
  const result = await runDesignDialogue({
    store: initial, input: '允许', requestId: 'ambiguous-confirmation',
    conversation: [
      { id: 'prior', role: 'user', text: '把全屋地板改成深棕色' },
      { id: 'prior-assistant', role: 'assistant', text: '你要移动茶几，还是把全屋地板改成深棕色？', trace: { terminationReason: 'clarify' } },
    ],
    provider: async ({ prompt }) => {
      const context = JSON.parse(prompt.slice(prompt.lastIndexOf('\n数据：\n') + '\n数据：\n'.length));
      assert.equal(context.confirmationContext, null);
      return { action: 'clarify', question: '你这次要继续改地板，还是处理茶几？', requirementsPatch: blankPatch(), providerTrace };
    },
  });
  assert.equal(result.trace.terminationReason, 'clarify');
  assert.equal(serializeScene(result.store.currentScene), serializeScene(initial.currentScene));
});
