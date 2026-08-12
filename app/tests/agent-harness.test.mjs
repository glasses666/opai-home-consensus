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

  const rotated = await runAgentTurn({ store: moved.store, input: '餐桌旋转90度' });
  assert.equal(objectById(rotated.store, 'object-dining-table').transform.rotationY, Math.PI);
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
      assert.equal(styleEvidence.results.every((item) => item.citation?.url), true);
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
