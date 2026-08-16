import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentTurn } from '../src/agent/harness.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createVersionHistory, saveSceneVersion } from '../src/domain/design-version.js';
import { createSceneStore, dispatchSceneCommand, serializeScene } from '../src/domain/scene.js';

const freshStore = () => createSceneStore(createDemoScene());
const objectById = (store, id) => store.currentScene.objects.find((object) => object.id === id);
const surfaceById = (store, id) => store.currentScene.surfaces.find((surface) => surface.id === id);
const movedHistory = () => {
  const initial = freshStore();
  const moved = dispatchSceneCommand(initial, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
  return { history: saveSceneVersion(createVersionHistory(initial), moved, { id: 'version-moved' }), store: moved };
};

test('local parser moves, rotates, and recolors real scene objects', async () => {
  let store = freshStore();

  const moved = await runAgentTurn({ store, input: '沙发向右移动20厘米' });
  assert.equal(objectById(moved.store, 'object-sofa').transform.x, 2400);
  assert.equal(moved.store.commands.length, 1);

  const rotated = await runAgentTurn({ store: moved.store, input: '双人床旋转90度' });
  assert.equal(objectById(rotated.store, 'object-primary-bed').transform.rotationY, Math.PI / 2);
  assert.equal(rotated.store.commands.length, 2);

  const material = await runAgentTurn({ store: rotated.store, input: '沙发改成橡木色' });
  assert.equal(objectById(material.store, 'object-sofa').materialId, 'mat-oak-veneer');
  assert.equal(material.store.commands.length, 3);
});

test('provider can inspect and change surfaces allowed for the current turn', async () => {
  const before = freshStore();
  const result = await runAgentTurn({
    store: before,
    input: '检查客餐厅并把地面换成瓷砖',
    provider: () => ({
      toolCalls: [
        { tool: 'inspect_room', args: { roomId: 'room-living-dining' } },
        {
          tool: 'set_surface_material',
          args: { surfaceId: 'surface-floor-living-dining', materialId: 'mat-floor-tile-warm' },
        },
      ],
    }),
  });

  assert.equal(surfaceById(result.store, 'surface-floor-living-dining').materialId, 'mat-floor-tile-warm');
  assert.equal(result.trace.steps[0].result.objects.includes('object-sofa'), true);
  assert.equal(result.store.commands.length, 1);
});

test('provider failure falls back once to deterministic local parsing', async () => {
  const before = freshStore();
  const result = await runAgentTurn({
    store: before,
    input: '沙发向右移动20厘米',
    provider: () => {
      throw new Error('api_key should be hidden');
    },
  });

  assert.equal(objectById(result.store, 'object-sofa').transform.x, 2400);
  assert.equal(result.trace.source, 'local');
  assert.equal(result.trace.fallbackReason.includes('api_key'), false);
});

test('provider fallback keeps a sanitized Aily failure code for diagnosis', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '先看看北欧方向，不要改',
    provider: () => { throw new Error('AILY_RESPONSE_INVALID'); },
  });
  assert.equal(result.trace.source, 'local');
  assert.equal(result.trace.fallbackReason, 'AILY_RESPONSE_INVALID');
  assert.equal(result.store.commands.length, 0);
});

test('illegal tool execution leaves the scene unchanged', async () => {
  const before = freshStore();
  const beforeScene = serializeScene(before.currentScene);
  const result = await runAgentTurn({
    store: before,
    input: '把沙发向左移动10000毫米',
    provider: () => ({
      toolCalls: [{ tool: 'move_object', args: { objectId: 'object-sofa', dx: -10000 } }],
    }),
  });

  assert.equal(serializeScene(result.store.currentScene), beforeScene);
  assert.equal(result.store.commands.length, 0);
  assert.equal(result.trace.steps[0].ok, false);
  assert.equal(result.trace.rolledBack, true);
  assert.match(result.trace.steps[0].error, /OBJECT_FOOTPRINT_OUTSIDE_ROOM/);
});

test('a failed multi-tool turn rolls back earlier writes', async () => {
  const before = freshStore();
  const beforeScene = serializeScene(before.currentScene);
  const result = await runAgentTurn({
    store: before,
    input: '把沙发改成橡木色并向左移动10000毫米',
    provider: () => ({
      toolCalls: [
        { tool: 'set_object_material', args: { objectId: 'object-sofa', materialId: 'mat-oak-veneer' } },
        { tool: 'move_object', args: { objectId: 'object-sofa', dx: -10000 } },
      ],
    }),
  });

  assert.equal(serializeScene(result.store.currentScene), beforeScene);
  assert.equal(result.store.commands.length, 0);
  assert.equal(result.trace.rolledBack, true);
  assert.match(result.trace.assistantReply, /^没有修改：/);
  assert.doesNotMatch(result.trace.assistantReply, /已提交|已完成|已修改/);
});

test('provider receives a scene summary, not the live raw scene', async () => {
  const before = freshStore();
  const result = await runAgentTurn({
    store: before,
    input: '看看沙发',
    provider: ({ scene }) => {
      scene.objects.find((object) => object.id === 'object-sofa').transform.x = 9999;
      return { toolCalls: [] };
    },
  });

  assert.equal(objectById(result.store, 'object-sofa').transform.x, 2200);
});

test('provider tool calls are limited to the current turn allowlist', async () => {
  const before = freshStore();
  const result = await runAgentTurn({
    store: before,
    input: '把沙发向右移动20厘米',
    provider: ({ tools }) => {
      assert.equal(tools.some((tool) => tool.name === 'move_object'), true);
      assert.equal(tools.some((tool) => tool.name === 'rotate_object'), false);
      return { toolCalls: [{ tool: 'rotate_object', args: { objectId: 'object-sofa', degrees: 90 } }] };
    },
  });

  assert.equal(result.trace.source, 'local');
  assert.equal(result.trace.fallbackReason, 'TOOL_NOT_ALLOWED');
  assert.equal(objectById(result.store, 'object-sofa').transform.x, 2400);
  assert.equal(objectById(result.store, 'object-sofa').transform.rotationY, 0);
});

test('provider write arguments are bound to the resident target and amount', async () => {
  const wrongTarget = await runAgentTurn({
    store: freshStore(),
    input: '把沙发向右移动20厘米',
    provider: () => ({
      mode: 'execute', assistantReply: '移动家具。', reasons: [], unresolved: [],
      toolCalls: [{ tool: 'move_object', args: { objectId: 'object-primary-bed', dx: 200 } }],
    }),
  });
  assert.equal(wrongTarget.trace.source, 'local');
  assert.equal(wrongTarget.trace.fallbackReason, 'TOOL_ARGS_NOT_ALLOWED');
  assert.equal(objectById(wrongTarget.store, 'object-sofa').transform.x, 2400);
  assert.equal(objectById(wrongTarget.store, 'object-primary-bed').transform.x, 1500);

  const wrongAmount = await runAgentTurn({
    store: freshStore(),
    input: '把沙发向右移动20厘米',
    provider: () => ({
      mode: 'execute', assistantReply: '移动沙发。', reasons: [], unresolved: [],
      toolCalls: [{ tool: 'move_object', args: { objectId: 'object-sofa', dx: 2000 } }],
    }),
  });
  assert.equal(wrongAmount.trace.source, 'local');
  assert.equal(wrongAmount.trace.fallbackReason, 'TOOL_ARGS_NOT_ALLOWED');
  assert.equal(objectById(wrongAmount.store, 'object-sofa').transform.x, 2400);
});

test('provider may express the same move as an absolute coordinate', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '把沙发向右移动20厘米',
    provider: () => ({
      mode: 'execute', assistantReply: '准备移动沙发。', reasons: [], unresolved: [],
      toolCalls: [{ tool: 'move_object', args: { objectId: 'object-sofa', x: 2400, z: 5200 } }],
    }),
  });

  assert.equal(result.trace.source, 'provider');
  assert.equal(result.trace.fallbackReason, null);
  assert.equal(objectById(result.store, 'object-sofa').transform.x, 2400);
});

test('provider cannot smuggle undeclared write arguments', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '把沙发向右移动20厘米',
    provider: () => ({
      mode: 'execute', assistantReply: '准备移动沙发。', reasons: [], unresolved: [],
      toolCalls: [{ tool: 'move_object', args: { objectId: 'object-sofa', dx: 200, force: true } }],
    }),
  });

  assert.equal(result.trace.source, 'local');
  assert.equal(result.trace.fallbackReason, 'TOOL_CALL_INVALID');
  assert.equal(objectById(result.store, 'object-sofa').transform.x, 2400);
});

test('scoped preserve clauses do not cancel the one explicit edit', async () => {
  for (const input of [
    '把开放客餐厅南墙改成浅橡木木饰面，其他地方先别动',
    '其他墙面不要改，只把开放客餐厅南墙改成浅橡木木饰面',
  ]) {
    const result = await runAgentTurn({ store: freshStore(), input });
    assert.equal(result.trace.mode, 'execute', input);
    assert.equal(surfaceById(result.store, 'surface-wall-living-south').materialId, 'mat-wall-oak-panel', input);
  }

  const globalNoWrite = await runAgentTurn({ store: freshStore(), input: '开放客餐厅南墙先别动，只给我两个方向' });
  assert.equal(globalNoWrite.trace.mode, 'propose');
  assert.equal(globalNoWrite.store.commands.length, 0);
});

test('a previous blocked action does not swallow the next clarification turn', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '越界就不要改了。我还想在客餐厅加一组悬浮层板。',
  });
  assert.equal(result.trace.mode, 'clarify');
  assert.deepEqual(result.trace.toolCalls.map(({ tool }) => tool), ['search_catalog', 'request_clarification']);
  assert.equal(result.store.commands.length, 0);
});

test('ambiguous multi-object write asks instead of guessing a target', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '把沙发和餐桌向右移动20厘米',
  });
  assert.equal(result.trace.mode, 'clarify');
  assert.deepEqual(result.trace.toolCalls.map(({ tool }) => tool), ['request_clarification']);
  assert.equal(result.store.commands.length, 0);
});

test('chatty context cannot redirect an explicit furniture edit', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '餐桌先保持现在这样。对了，沙发往右挪20厘米就行。',
  });
  assert.equal(result.trace.mode, 'execute');
  assert.equal(objectById(result.store, 'object-sofa').transform.x, 2400);
  assert.equal(objectById(result.store, 'object-dining-table').transform.x, 6200);
});

test('a five-turn resident session survives provider drift without corrupting state', async () => {
  const turns = [
    '先给我两个客餐厅方向，不要改房屋',
    '把开放客餐厅南墙改成浅橡木木饰面，其他地方先别动',
    '把沙发向右移动20厘米，餐桌保持原位',
    '把沙发向左移动10000毫米',
    '越界就不要改了。我还想在客餐厅加一组悬浮层板',
  ];
  let store = freshStore();
  const results = [];
  for (const input of turns) {
    const result = await runAgentTurn({
      store,
      input,
      provider: () => ({ mode: 'execute', assistantReply: '已完成。', reasons: [], unresolved: [], toolCalls: [] }),
    });
    store = result.store;
    results.push(result);
  }

  assert.deepEqual(results.map((result) => result.trace.mode), ['propose', 'execute', 'execute', 'execute', 'clarify']);
  assert.equal(surfaceById(store, 'surface-wall-living-south').materialId, 'mat-wall-oak-panel');
  assert.equal(objectById(store, 'object-sofa').transform.x, 2400);
  assert.equal(results[3].trace.rolledBack, true);
  assert.equal(store.commands.length, 2);
});

test('no-write paraphrases stay read-only', async () => {
  for (const input of [
    '沙发右移20厘米，但这轮不许执行，只告诉我会发生什么',
    '别保存任何调整，先预览沙发右移20厘米的影响',
    '我只想看方案，沙发往右挪20厘米先不要落地',
  ]) {
    const result = await runAgentTurn({ store: freshStore(), input });
    assert.equal(result.trace.mode, 'propose', input);
    assert.equal(result.store.commands.length, 0, input);
    assert.equal(result.trace.toolCalls.some((call) => ['move_object', 'rotate_object', 'delete_object'].includes(call.tool)), false, input);
  }
});

test('delete_object is a write tool and no-write intent blocks it', async () => {
  const deleted = await runAgentTurn({ store: freshStore(), input: '删除沙发' });
  assert.equal(objectById(deleted.store, 'object-sofa'), undefined);
  assert.equal(deleted.store.commands.at(-1).type, 'object.delete');

  const before = freshStore();
  const beforeScene = serializeScene(before.currentScene);
  const blocked = await runAgentTurn({ store: before, input: '删除沙发，先给方案不要直接改' });
  assert.equal(serializeScene(blocked.store.currentScene), beforeScene);
  assert.equal(blocked.trace.toolCalls.some((call) => call.tool === 'delete_object'), false);
});

test('rules and version comparison are read-only harness tools', async () => {
  const { history, store } = movedHistory();
  const rules = await runAgentTurn({ store, input: '检查沙发规则', selectedObjectId: 'object-sofa' });
  assert.equal(rules.store, store);
  assert.equal(rules.trace.steps[0].tool, 'check_rules');
  assert.equal(rules.trace.steps[0].result.source, 'demo');

  const compared = await runAgentTurn({ store, input: '对比上一版变化', versionHistory: history });
  assert.equal(compared.store, store);
  assert.equal(compared.trace.steps[0].tool, 'compare_versions');
  assert.equal(compared.trace.steps[0].result.fromVersionId, 'version-demo-initial');
  assert.equal(compared.trace.steps[0].result.toVersionId, 'version-moved');
  assert.equal(compared.trace.steps[0].result.objectDiffs.some((diff) => diff.objectId === 'object-sofa'), true);
});

test('request_confirmation never confirms a version for the resident', async () => {
  const { history, store } = movedHistory();
  const result = await runAgentTurn({ store, input: '就这版确认', versionHistory: history });

  assert.equal(result.store, store);
  assert.equal(result.trace.steps[0].tool, 'request_confirmation');
  assert.equal(result.trace.steps[0].result.versionId, 'version-moved');
  assert.equal(history.confirmedVersionId, null);
});

test('provider receives sanitized version summaries, not raw snapshots', async () => {
  const { history, store } = movedHistory();
  const result = await runAgentTurn({
    store,
    input: '对比上一版变化',
    versionHistory: history,
    provider: ({ versions }) => {
      assert.equal(versions.currentVersionId, 'version-moved');
      assert.equal(versions.versions.length, 2);
      assert.equal(versions.versions[1].summary.commandCount, 1);
      assert.equal('scene' in versions.versions[1], false);
      assert.equal('commands' in versions.versions[1], false);
      return { assistantReply: '已读取版本变化。', toolCalls: [{ tool: 'compare_versions', args: { beforeVersionId: 'version-demo-initial' } }] };
    },
  });

  assert.equal(result.trace.source, 'provider');
  assert.equal(result.trace.steps[0].result.sceneChanged, true);
});

test('style research reaches the provider without exposing write tools', async () => {
  const store = freshStore();
  const result = await runAgentTurn({
    store,
    input: '小户型北欧风，收纳别少，先给两个方向不要改',
    provider: ({ styleEvidence, tools }) => {
      assert.equal(styleEvidence.status, 'ready');
      assert.equal(styleEvidence.results[0].styleId, 'scandinavian');
      assert.equal(styleEvidence.results.length, 2);
      assert.equal(styleEvidence.results.every((item) => item.citation?.url && item.risks.length && item.unknowns.length), true);
      assert.equal(styleEvidence.results.every((item) => !('context' in item) && !('designMoves' in item)), true);
      assert.equal(tools.some((tool) => tool.writes), false);
      return { assistantReply: '方向一保留浅木与自然光；方向二增加封闭收纳。', toolCalls: [] };
    },
  });

  assert.equal(result.store, store);
  assert.equal(result.trace.source, 'provider');
  assert.equal(result.trace.styleEvidence.status, 'ready');
  assert.deepEqual(result.trace.steps, []);
});

test('a style label is not treated as an editable material', async () => {
  const store = freshStore();
  const result = await runAgentTurn({
    store,
    input: '把沙发改成北欧风',
    provider: ({ tools }) => {
      assert.equal(tools.some((tool) => tool.name === 'set_object_material'), false);
      return { assistantReply: '北欧不是当前目录中的材质，请先确认浅木或暖灰织物。', toolCalls: [] };
    },
  });

  assert.equal(result.store, store);
  assert.deepEqual(result.trace.steps, []);
});

test('deterministic replay returns stable commands and traces', async () => {
  const first = await runAgentTurn({ store: freshStore(), input: '沙发向右移动20厘米' });
  const second = await runAgentTurn({ store: freshStore(), input: '沙发向右移动20厘米' });

  assert.equal(JSON.stringify(first.trace), JSON.stringify(second.trace));
  assert.equal(serializeScene(first.store.currentScene), serializeScene(second.store.currentScene));
  assert.deepEqual(first.store.commands, second.store.commands);
});

test('harness fixes clarify propose and execute modes before provider planning', async () => {
  const inputs = [
    ['家里有孩子，想改善一下，但还没决定先改哪个房间', 'clarify'],
    ['小户型北欧风先给两个方向，不要改', 'propose'],
    ['把沙发向右移动20厘米', 'execute'],
  ];
  for (const [input, expectedMode] of inputs) {
    const result = await runAgentTurn({
      store: freshStore(),
      input,
      provider: ({ mode, tools }) => {
        if (mode !== 'execute') assert.equal(tools.every((tool) => !tool.writes), true);
        return {
          mode,
          assistantReply: mode === 'clarify' ? '你想先改善哪个房间？' : mode === 'propose' ? '先比较两个方向。' : '移动沙发。',
          reasons: ['来自当前需求'],
          unresolved: mode === 'clarify' ? ['优先房间'] : [],
          toolCalls: mode === 'clarify'
            ? [{ tool: 'request_clarification', args: { question: '你想先改善哪个房间？' } }]
            : mode === 'execute'
              ? [{ tool: 'move_object', args: { objectId: 'object-sofa', dx: 200 } }]
              : [],
        };
      },
    });
    assert.equal(result.trace.mode, expectedMode, input);
    assert.equal(result.trace.providerModeExplicit, true, input);
    assert.equal(result.trace.source, 'provider', input);
  }
});

test('provider cannot switch an execute turn into propose mode', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '把沙发向右移动20厘米',
    provider: () => ({ mode: 'propose', assistantReply: '先看看。', reasons: [], unresolved: [], toolCalls: [] }),
  });
  assert.equal(result.trace.source, 'local');
  assert.equal(result.trace.fallbackReason, 'PROVIDER_MODE_INVALID');
  assert.equal(result.trace.mode, 'execute');
  assert.equal(result.store.currentScene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);
});

test('declared mode drift is diagnostic when calls obey the harness mode', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '家里有孩子，想改善一下，但还没决定先改哪个房间',
    provider: () => ({
      mode: 'propose',
      assistantReply: '你想先改善哪个房间？',
      reasons: ['优先空间未明确'],
      unresolved: ['优先空间'],
      toolCalls: [{ tool: 'request_clarification', args: { question: '你想先改善哪个房间？' } }],
    }),
  });
  assert.equal(result.trace.source, 'provider');
  assert.equal(result.trace.mode, 'clarify');
  assert.equal(result.trace.providerDeclaredMode, 'propose');
  assert.equal(result.trace.providerReplyIssue, 'PROVIDER_MODE_CORRECTED');
});

test('clarify mode collapses provider punctuation to one resident question', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '我想在客餐厅加一组悬浮层板',
    provider: ({ mode }) => ({
      mode,
      assistantReply: '放在哪面墙？要单层还是双层？',
      reasons: ['安装位置未明确'],
      unresolved: ['墙面与层数'],
      toolCalls: [{ tool: 'request_clarification', args: { question: '放在哪面墙？要单层还是双层？' } }],
    }),
  });
  assert.equal(result.trace.providerReplyIssue, null);
  assert.equal(result.trace.assistantReply, '放在哪面墙，要单层还是双层？');
  assert.equal(result.trace.toolCalls[0].args.question, result.trace.assistantReply);
});

test('clarify mode repairs a missing read-only clarification call', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '我想在客餐厅加一组悬浮层板',
    provider: ({ mode }) => ({
      mode,
      assistantReply: '层板准备放在哪面墙？',
      reasons: ['目标墙面未明确'],
      unresolved: ['层板准备放在哪面墙？'],
      toolCalls: [{ tool: 'search_catalog', args: { query: '层板' } }],
    }),
  });
  assert.equal(result.trace.source, 'provider');
  assert.equal(result.trace.providerReplyIssue, 'PROVIDER_CLARIFICATION_REPAIRED');
  assert.deepEqual(result.trace.toolCalls.map(({ tool }) => tool), ['search_catalog', 'request_clarification']);
  assert.equal(result.store.commands.length, 0);
});
