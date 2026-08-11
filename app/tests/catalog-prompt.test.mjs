import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentTurn } from '../src/agent/harness.js';
import { AGENT_PROMPT_VERSION, buildAgentPrompt } from '../src/agent/prompt.js';
import { demoCatalogPlugin } from '../src/catalog/demo-catalog.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore, serializeScene } from '../src/domain/scene.js';

const freshStore = () => createSceneStore(createDemoScene());
const surfaceById = (store, id) => store.currentScene.surfaces.find((surface) => surface.id === id);

test('demo catalog covers renovation systems and labels every commercial value', () => {
  const description = demoCatalogPlugin.describe();
  assert.equal(description.source, 'demo');
  assert.equal(description.itemCount, 18);
  for (const category of ['wall_finish', 'floor_finish', 'ceiling_finish', 'shelving', 'partition', 'feature_wall', 'cabinetry', 'furniture', 'door', 'worktop', 'ceiling', 'hardware']) {
    assert.equal(description.categories.includes(category), true, category);
  }

  const items = demoCatalogPlugin.search({ limit: 20 });
  assert.equal(items.every((item) => item.source === 'demo'), true);
  assert.equal(items.every((item) => item.commercial.price.source === 'estimate'), true);
  assert.equal(items.every((item) => item.commercial.leadTime.source === 'estimate'), true);
});

test('catalog search returns wall-mounted shelves without calling them furniture', () => {
  const shelves = demoCatalogPlugin.search({ query: '架子', category: 'shelving' });
  assert.equal(shelves.length, 2);
  assert.equal(shelves.every((item) => item.category === 'shelving' && item.kind !== 'movable_component'), true);
  assert.equal(shelves.every((item) => item.sceneReady === false), true);
});

test('local planner applies a scene-ready wall system through SceneCommand', async () => {
  const result = await runAgentTurn({ store: freshStore(), input: '把开放客餐厅南墙改成浅橡木木饰面' });
  assert.equal(surfaceById(result.store, 'surface-wall-living-south').materialId, 'mat-wall-oak-panel');
  assert.deepEqual(result.store.commands[0], {
    type: 'surface.setMaterial',
    surfaceId: 'surface-wall-living-south',
    materialId: 'mat-wall-oak-panel',
  });
  assert.equal(result.trace.steps[0].result.source, 'demo');
  assert.equal(result.trace.steps[0].result.commercial.price.source, 'estimate');
});

test('provider applies a scene-ready ceiling finish through the same SceneCommand', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '把开放客餐厅顶面换成暖灰饰面',
    provider: () => ({ toolCalls: [{
      tool: 'apply_catalog_item',
      args: { catalogItemId: 'demo-ceiling-paint-greige', surfaceId: 'surface-ceiling-living-dining' },
    }] }),
  });
  assert.equal(surfaceById(result.store, 'surface-ceiling-living-dining').materialId, 'mat-ceiling-greige');
  assert.deepEqual(result.store.commands[0], { type: 'surface.setMaterial', surfaceId: 'surface-ceiling-living-dining', materialId: 'mat-ceiling-greige' });
});

test('non-scene-ready shelving cannot be installed by a provider', async () => {
  const before = freshStore();
  const result = await runAgentTurn({
    store: before,
    input: '直接把开放客餐厅南墙应用木饰面',
    provider: () => ({
      assistantReply: '我直接装。',
      toolCalls: [{
        tool: 'apply_catalog_item',
        args: { catalogItemId: 'demo-shelf-floating-900', surfaceId: 'surface-wall-living-south' },
      }],
    }),
  });

  assert.equal(serializeScene(result.store.currentScene), serializeScene(before.currentScene));
  assert.equal(result.trace.rolledBack, true);
  assert.match(result.trace.steps[0].error, /CATALOG_ITEM_NOT_SCENE_READY/);
});

test('local shelf request searches the catalog and asks for mounting context', async () => {
  const result = await runAgentTurn({ store: freshStore(), input: '儿童房想加一个架子' });
  assert.equal(result.store.commands.length, 0);
  assert.deepEqual(result.trace.toolCalls.map((call) => call.tool), ['search_catalog', 'request_clarification']);
  assert.equal(result.trace.steps[0].result.items.every((item) => item.category === 'shelving'), true);
  assert.match(result.trace.steps[1].result.question, /哪个房间|哪面墙|收纳/);
});

test('provider receives catalog summary and its user-facing reply is preserved', async () => {
  let received;
  const result = await runAgentTurn({
    store: freshStore(),
    input: '先看看层板方向，不要改',
    provider: (context) => {
      received = context;
      return { assistantReply: '我先给你看两个演示方向，不改场景。', toolCalls: [] };
    },
  });

  assert.equal(received.catalog.source, 'demo');
  assert.equal(received.catalog.items.some((item) => item.category === 'shelving'), true);
  assert.deepEqual(received.tools.map((tool) => tool.name), ['inspect_object', 'search_catalog', 'inspect_catalog_item', 'request_clarification']);
  assert.equal(received.tools.every((tool) => tool.writes === false), true);
  assert.equal(result.trace.assistantReply, '我先给你看两个演示方向，不改场景。');
  assert.equal(result.store.commands.length, 0);
});

test('provider reply drops conversational filler before it reaches the resident', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '检查主卧当前规则',
    provider: () => ({ assistantReply: '您好，好的，没问题。建议保持当前布局。', toolCalls: [] }),
  });

  assert.equal(result.trace.assistantReply, '建议保持当前布局。');
});

test('no-write intent blocks local scene writes', async () => {
  for (const intent of ['先看看', '给方向', '不要直接改', '别改']) {
    const before = freshStore();
    const beforeScene = serializeScene(before.currentScene);
    const result = await runAgentTurn({
      store: before,
      input: `把开放客餐厅南墙改成浅橡木木饰面，${intent}`,
    });

    assert.equal(serializeScene(result.store.currentScene), beforeScene, intent);
    assert.equal(result.store.commands.length, 0, intent);
    assert.equal(result.trace.toolCalls.some((call) => call.tool === 'apply_catalog_item'), false, intent);
  }
});

test('no-write intent rejects provider write tools and preserves the scene', async () => {
  const before = freshStore();
  const beforeScene = serializeScene(before.currentScene);
  const result = await runAgentTurn({
    store: before,
    input: '把开放客餐厅南墙改成浅橡木木饰面，先给方向，别改',
    provider: ({ tools }) => {
      assert.equal(tools.every((tool) => tool.writes === false), true);
      return {
        assistantReply: '已修改。',
        toolCalls: [{
          tool: 'apply_catalog_item',
          args: { catalogItemId: 'demo-wall-panel-light-oak', surfaceId: 'surface-wall-living-south' },
        }],
      };
    },
  });

  assert.equal(serializeScene(result.store.currentScene), beforeScene);
  assert.equal(result.store.commands.length, 0);
  assert.equal(result.trace.source, 'local');
  assert.equal(result.trace.fallbackReason, 'TOOL_NOT_ALLOWED');
  assert.equal(result.trace.assistantReply, '仅提供方向，不修改当前场景。');
});

test('provider construction claims not present in context fall back safely', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '客餐厅想加悬浮层板，先给方向，不要改',
    provider: () => ({ assistantReply: '建议用 2 个膨胀螺栓固定。', toolCalls: [] }),
  });

  assert.equal(result.trace.source, 'local');
  assert.equal(result.trace.fallbackReason, 'PROVIDER_REPLY_UNGROUNDED');
  assert.match(result.trace.assistantReply, /安装规则尚未接入/);
  assert.equal(result.store.commands.length, 0);
});

test('provider reply may repeat a normalized number from its validated tool call', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '把沙发向右移动20厘米',
    provider: () => ({
      assistantReply: '将向右移动 200 mm。',
      toolCalls: [{ tool: 'move_object', args: { objectId: 'object-sofa', dx: 200 } }],
    }),
  });

  assert.equal(result.trace.source, 'provider');
  assert.equal(result.store.currentScene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);
});

test('provider may return null for an omitted clarification options array', async () => {
  const result = await runAgentTurn({
    store: freshStore(),
    input: '客餐厅加层板，先问我位置',
    provider: () => ({
      assistantReply: '你想装在哪面墙？',
      toolCalls: [{ tool: 'request_clarification', args: { question: '你想装在哪面墙？', options: null } }],
    }),
  });

  assert.equal(result.trace.steps[0].ok, true);
  assert.deepEqual(result.trace.steps[0].result.options, []);
});

test('provider may offer four bounded clarification options', async () => {
  const store = createSceneStore(createDemoScene());
  const result = await runAgentTurn({
    store,
    input: '我想在客餐厅加一组层板',
    provider: async () => ({
      assistantReply: '你想把层板装在哪面墙，主要收纳什么？',
      toolCalls: [{
        tool: 'request_clarification',
        args: {
          question: '你想把层板装在哪面墙，主要收纳什么？',
          options: ['沙发背景墙', '电视背景墙', '餐区墙面', '玄关墙面'],
        },
      }],
    }),
  });

  assert.equal(result.trace.steps[0].ok, true);
  assert.equal(result.trace.steps[0].result.options.length, 4);
});

test('prompt contract distinguishes building components and forbids invented catalog data', () => {
  const prompt = JSON.parse(buildAgentPrompt({ input: '加层板', scene: {}, selectedObjectId: null, tools: [], catalog: {} }));
  assert.equal(prompt.promptVersion, AGENT_PROMPT_VERSION);
  assert.match(prompt.output, /JSON/);
  assert.equal(prompt.rules.some((rule) => rule.includes('不创造目录外')), true);
  assert.equal(prompt.rules.some((rule) => rule.includes('墙面、地面、门、吊顶、层板')), true);
  assert.equal(prompt.rules.some((rule) => rule.includes('不要直接改')), true);
  assert.equal(prompt.rules.some((rule) => rule.includes('省略寒暄和口头禅')), true);
});
