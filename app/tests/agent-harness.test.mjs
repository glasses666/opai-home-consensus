import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentTurn } from '../src/agent/harness.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore, serializeScene } from '../src/domain/scene.js';

const freshStore = () => createSceneStore(createDemoScene());
const objectById = (store, id) => store.currentScene.objects.find((object) => object.id === id);
const surfaceById = (store, id) => store.currentScene.surfaces.find((surface) => surface.id === id);

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

test('deterministic replay returns stable commands and traces', async () => {
  const first = await runAgentTurn({ store: freshStore(), input: '沙发向右移动20厘米' });
  const second = await runAgentTurn({ store: freshStore(), input: '沙发向右移动20厘米' });

  assert.equal(JSON.stringify(first.trace), JSON.stringify(second.trace));
  assert.equal(serializeScene(first.store.currentScene), serializeScene(second.store.currentScene));
  assert.deepEqual(first.store.commands, second.store.commands);
});
