import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { createAppServer } from '../server/index.mjs';
import { createPersistentProjectStore } from '../server/project-store.mjs';
import { callAily, getFeishuHealth, syncActivity } from '../server/feishu.mjs';
import { LarkCliError, runLarkCli } from '../server/lark-cli.mjs';
import { createDemoHouseholdConsensus, serializeHouseholdConsensus } from '../src/domain/household-consensus.js';
import { createVersionHistory, saveSceneVersion, serializeVersionHistory } from '../src/domain/design-version.js';
import { createSceneStore, dispatchSceneCommand } from '../src/domain/scene.js';
import { createDemoScene } from '../src/domain/demo-scene.js';

const listen = (server) => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
});
const close = (server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

test('lark-cli adapter parses envelopes and never forwards raw secret errors', async () => {
  const ok = await runLarkCli(['fake'], { runner: async () => ({ stdout: '{"ok":true,"data":{"value":1}}' }) });
  assert.equal(ok.data.value, 1);

  await assert.rejects(
    runLarkCli(['fake'], {
      runner: async () => ({
        stdout: JSON.stringify({ ok: false, error: { type: 'authorization', subtype: 'missing_scope', message: 'secret=abc' } }),
      }),
    }),
    (error) => error instanceof LarkCliError && error.message === 'MISSING_SCOPE' && !error.message.includes('abc'),
  );

  await assert.rejects(
    runLarkCli(['fake'], {
      runner: async () => {
        const error = new Error('exit 1');
        error.code = 1;
        error.stderr = JSON.stringify({ ok: false, error: { type: 'api', subtype: 'invalid_parameters', message: 'private upstream detail' } });
        throw error;
      },
    }),
    (error) => error instanceof LarkCliError && error.message === 'INVALID_PARAMETERS' && !error.message.includes('private'),
  );
});

test('Aily adapter performs the official session-message-run-message chain', async () => {
  const paths = [];
  const fakeRun = async (args) => {
    paths.push(`${args[1]} ${args[2]}`);
    const path = args[2];
    if (path === '/open-apis/aily/v1/sessions') return { data: { session: { id: 'session_test' } } };
    if (path.endsWith('/messages') && args[1] === 'POST') return { data: { message: { id: 'message_test' } } };
    if (path.endsWith('/runs') && args[1] === 'POST') return { data: { run: { id: 'run_test' } } };
    if (path.endsWith('/runs/run_test')) return { data: { run: { status: 'COMPLETED' } } };
    if (path.endsWith('/messages') && args[1] === 'GET') {
      return { data: { items: [{ plain_text: '{"toolCalls":[{"tool":"inspect_room","args":{"roomId":"room-living-dining"}}]}' }] } };
    }
    throw new Error(`unexpected ${path}`);
  };

  const result = await callAily({ input: '检查客餐厅', scene: {}, selectedObjectId: null, tools: [] }, {
    appId: 'spring_test__c',
    run: fakeRun,
    id: () => 'idempotent-test',
    pollMs: 0,
  });

  assert.equal(result.toolCalls[0].tool, 'inspect_room');
  assert.deepEqual(paths, [
    'POST /open-apis/aily/v1/sessions',
    'POST /open-apis/aily/v1/sessions/session_test/messages',
    'POST /open-apis/aily/v1/sessions/session_test/runs',
    'GET /open-apis/aily/v1/sessions/session_test/runs/run_test',
    'GET /open-apis/aily/v1/sessions/session_test/messages',
  ]);
});

test('Aily adapter prefers the official team-agent chat chain when agent ID is available', async () => {
  const paths = [];
  let sentPrompt;
  const fakeRun = async (args) => {
    paths.push(`${args[1]} ${args[2]}`);
    if (args[1] === 'POST') {
      const data = JSON.parse(args[args.indexOf('--data') + 1]);
      sentPrompt = JSON.parse(data.user_message.content[0].text);
      return { data: { agent_chat_id: 'chat_test', session_id: 'conversation_test' } };
    }
    return {
      data: {
        content: [{ type: 'text', text: '{"toolCalls":[{"tool":"inspect_room","args":{"roomId":"room-living-dining"}}]}' }],
        finish_reason: 'stop',
        status: 'Completed',
      },
    };
  };

  const result = await callAily({ input: '检查客餐厅', scene: {}, selectedObjectId: null, tools: [] }, {
    agentId: 'agent_test',
    run: fakeRun,
    pollMs: 0,
  });
  assert.equal(result.toolCalls[0].tool, 'inspect_room');
  assert.equal(sentPrompt.promptVersion, 'oppein-harness-v2.2');
  assert.equal(sentPrompt.rules.some((rule) => rule.includes('层板')), true);
  assert.deepEqual(paths, [
    'POST /open-apis/aily/v1/agents/agent_test/chats',
    'GET /open-apis/aily/v1/agents/agent_test/chats/chat_test',
  ]);
});

test('team-agent adapter waits when Completed arrives before its text content', async () => {
  let reads = 0;
  const fakeRun = async (args) => {
    if (args[1] === 'POST') return { data: { agent_chat_id: 'chat_eventual' } };
    reads += 1;
    return reads === 1
      ? { data: { status: 'Completed', content: [] } }
      : { data: { status: 'Completed', content: [{ type: 'text', text: '{"assistantReply":"已读取。","toolCalls":[]}' }] } };
  };
  const result = await callAily({ input: '检查客餐厅', scene: {}, selectedObjectId: null, tools: [] }, {
    agentId: 'agent_test',
    run: fakeRun,
    pollMs: 0,
    timeoutMs: 100,
  });
  assert.equal(reads, 2);
  assert.equal(result.assistantReply, '已读取。');
});

test('team-agent adapter accepts plain text only for a read-only turn', async () => {
  const fakeRun = async (args) => args[1] === 'POST'
    ? { data: { agent_chat_id: 'chat_text' } }
    : { data: { status: 'Completed', content: [{ type: 'text', text: '请先确认具体墙面。' }] } };
  const result = await callAily({
    input: '先给方向，不要改', scene: {}, selectedObjectId: null,
    tools: [{ name: 'request_clarification', writes: false }],
  }, { agentId: 'agent_test', run: fakeRun, pollMs: 0, timeoutMs: 100 });
  assert.deepEqual(result, { assistantReply: '请先确认具体墙面。', toolCalls: [] });
});

test('health reports only verified capabilities as ready', async () => {
  const scopes = [
    'aily:message:read', 'aily:message:write', 'aily:run:read',
    'aily:run:write', 'aily:session:read', 'aily:session:write',
    'base:app:read', 'base:record:create', 'base:record:read', 'base:record:update',
  ].join(' ');
  const fakeRun = async (args) => {
    if (args[0] === 'auth') {
      return { verified: true, identities: { user: { status: 'ready', tokenStatus: 'valid', scope: scopes } } };
    }
    return { data: { fields: [{ name: 'Event ID' }] } };
  };

  const unverified = await getFeishuHealth({ run: fakeRun, env: { AILY_APP_ID: 'spring_test__c' }, ailyVerifiedAt: null });
  assert.equal(unverified.aily.status, 'api_unavailable');
  assert.equal(unverified.base.status, 'api_unavailable');

  const verified = await getFeishuHealth({
    run: fakeRun,
    env: { AILY_APP_ID: 'spring_test__c' },
    ailyVerifiedAt: '2026-08-09T01:00:00.000Z',
    baseVerifiedAt: '2026-08-09T01:00:00.000Z',
  });
  assert.equal(verified.aily.status, 'ready');
  assert.equal(verified.base.status, 'ready');
});

test('BFF health identifies the active Agent provider', async () => {
  const server = createAppServer({
    health: async () => ({ aily: { status: 'ready' }, base: { status: 'ready' } }),
    sync: async () => {},
  });
  const origin = await listen(server);
  try {
    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.provider, 'aily');
  } finally {
    await close(server);
  }
});

test('Base activity sync updates the same record for a repeated Event ID', async () => {
  const calls = [];
  const fakeRun = async (args) => {
    calls.push(args);
    if (args.includes('+record-search')) return { data: { record_id_list: ['rec_existing'] } };
    return { data: { record: { record_id: 'rec_existing' } } };
  };
  const event = {
    eventId: 'evt-test',
    input: '沙发向右移动20厘米',
    provider: 'local',
    trace: { source: 'local', toolCalls: [] },
  };

  const result = await syncActivity(event, { run: fakeRun, env: {} });
  assert.equal(result.recordId, 'rec_existing');
  assert.equal(calls[1].includes('--record-id'), true);
  assert.equal(calls[1][calls[1].indexOf('--record-id') + 1], 'rec_existing');
  assert.equal(calls.length, 3);
});

test('Base activity sync obtains a created record ID from read-back', async () => {
  let searches = 0;
  const fakeRun = async (args) => {
    if (args.includes('+record-search')) {
      searches += 1;
      return { data: { record_id_list: searches === 1 ? [] : ['rec_created'] } };
    }
    return { data: { record: { create: { 'Event ID': 'evt-created' } } } };
  };
  const result = await syncActivity({
    eventId: 'evt-created',
    input: '沙发向右移动20厘米',
    provider: 'local',
    trace: { source: 'local', toolCalls: [] },
  }, { run: fakeRun, env: {} });

  assert.equal(result.recordId, 'rec_created');
  assert.equal(searches, 2);
});

test('BFF applies an Agent turn and keeps Base failure as pending', async () => {
  const server = createAppServer({
    projectStore: null,
    health: async () => ({ aily: { status: 'api_unavailable' }, base: { status: 'ready' } }),
    sync: async () => { throw new Error('offline'); },
    id: () => 'test',
  });
  const origin = await listen(server);
  try {
    const response = await fetch(`${origin}/api/agent/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: '沙发向右移动20厘米', eventId: 'evt-http-test' }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.scene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);
    assert.equal(body.sync, 'pending');

    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.pendingBaseEvents, 1);
  } finally {
    await close(server);
  }
});

test('BFF persists versions and pending Base events across restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-bff-store-'));
  const file = join(dir, 'project.json');
  try {
    const sync = async () => { throw new Error('offline'); };
    let server = createAppServer({
      projectStore: createPersistentProjectStore({ filePath: file, id: () => 'server-one' }),
      health: async () => ({ aily: { status: 'api_unavailable' }, base: { status: 'ready' } }),
      sync,
    });
    let origin = await listen(server);
    const response = await fetch(`${origin}/api/agent/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: '沙发向右移动20厘米', eventId: 'evt-persist-test' }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.sync, 'pending');
    const versionId = body.project.currentVersionId;
    await close(server);

    server = createAppServer({
      projectStore: createPersistentProjectStore({ filePath: file }),
      health: async () => ({ aily: { status: 'api_unavailable' }, base: { status: 'ready' } }),
      sync,
    });
    origin = await listen(server);
    const project = await (await fetch(`${origin}/api/projects/project-demo`)).json();
    assert.equal(project.project.currentVersionId, versionId);
    assert.equal(project.scene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);
    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.pendingBaseEvents, 1);
    await close(server);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('BFF rejects stale expectedVersionId before overwriting a newer version', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-bff-conflict-'));
  try {
    let providerCalls = 0;
    const projectStore = createPersistentProjectStore({ filePath: join(dir, 'project.json'), id: () => 'server-two' });
    const initialVersionId = projectStore.currentVersionId;
    const server = createAppServer({
      projectStore,
      health: async () => ({ aily: { status: 'api_unavailable' }, base: { status: 'api_unavailable' } }),
      sync: async () => {},
      agentProvider: () => {
        providerCalls += 1;
        return { toolCalls: [{ tool: 'move_object', args: { objectId: 'object-sofa', dx: 200 } }] };
      },
    });
    const origin = await listen(server);
    try {
      const ok = await fetch(`${origin}/api/agent/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: '沙发向右移动20厘米', eventId: 'evt-fresh', expectedVersionId: initialVersionId }),
      });
      assert.equal(ok.status, 200);
      assert.equal(providerCalls, 1);
      providerCalls = 0;

      const stale = await fetch(`${origin}/api/agent/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: '沙发向右移动20厘米', eventId: 'evt-stale', expectedVersionId: initialVersionId }),
      });
      const staleBody = await stale.json();
      assert.equal(stale.status, 409);
      assert.equal(staleBody.error, 'VERSION_CONFLICT');
      assert.equal(providerCalls, 0);

      const invalid = await fetch(`${origin}/api/agent/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: '沙发向右移动20厘米', eventId: 'evt-invalid', expectedVersionId: 1 }),
      });
      assert.equal(invalid.status, 400);

      const mismatch = await fetch(`${origin}/api/agent/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: '沙发向右移动20厘米',
          eventId: 'evt-mismatch',
          versionId: initialVersionId,
          expectedVersionId: projectStore.currentVersionId,
        }),
      });
      assert.equal(mismatch.status, 400);
      assert.equal((await mismatch.json()).error, 'VERSION_ID_MISMATCH');
      assert.equal(providerCalls, 0);
    } finally {
      await close(server);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('concurrent turns capture one base version and reject the stale finisher', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-bff-concurrent-'));
  try {
    const providerCalls = [];
    const projectStore = createPersistentProjectStore({ filePath: join(dir, 'project.json') });
    const server = createAppServer({
      projectStore,
      health: async () => ({ aily: { status: 'api_unavailable' }, base: { status: 'api_unavailable' } }),
      sync: async () => {},
      agentProvider: (context) => new Promise((resolve) => providerCalls.push({ context, resolve })),
    });
    const origin = await listen(server);
    const waitForCalls = async (count) => {
      while (providerCalls.length < count) await new Promise((resolve) => setImmediate(resolve));
    };
    try {
      const request = (eventId) => fetch(`${origin}/api/agent/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: '沙发向右移动20厘米', eventId }),
      });
      const firstRequest = request('evt-concurrent-first');
      await waitForCalls(1);
      const secondRequest = request('evt-concurrent-second');
      await waitForCalls(2);

      providerCalls[0].resolve({ toolCalls: [{ tool: 'move_object', args: { objectId: 'object-sofa', dx: 200 } }] });
      const first = await firstRequest;
      providerCalls[1].resolve({ toolCalls: [{ tool: 'move_object', args: { objectId: 'object-sofa', dx: 200 } }] });
      const second = await secondRequest;

      assert.equal(first.status, 200);
      assert.equal(second.status, 409);
      assert.equal((await second.json()).error, 'VERSION_CONFLICT');
      assert.equal(projectStore.getSceneStore().currentScene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);
      assert.equal(projectStore.snapshot().versions.length, 2);
    } finally {
      await close(server);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('BFF replays an existing event ID without applying the turn twice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-bff-idempotent-'));
  try {
    const projectStore = createPersistentProjectStore({ filePath: join(dir, 'project.json'), id: () => 'server-three' });
    const server = createAppServer({
      projectStore,
      health: async () => ({ aily: { status: 'api_unavailable' }, base: { status: 'api_unavailable' } }),
      sync: async () => {},
    });
    const origin = await listen(server);
    try {
      const body = JSON.stringify({ input: '沙发向右移动20厘米', eventId: 'evt-repeat' });
      const first = await (await fetch(`${origin}/api/agent/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).json();
      const second = await (await fetch(`${origin}/api/agent/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).json();

      assert.equal(first.scene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);
      assert.equal(second.scene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);
      assert.equal(second.trace.source, 'idempotent_replay');
      assert.equal(projectStore.snapshot().versions.length, 2);

      const conflict = await fetch(`${origin}/api/agent/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: '餐桌旋转90度', eventId: 'evt-repeat' }),
      });
      assert.equal(conflict.status, 409);
      assert.equal((await conflict.json()).error, 'EVENT_ID_CONFLICT');
    } finally {
      await close(server);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('BFF records a no-write turn without creating a new version', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-bff-readonly-'));
  try {
    const projectStore = createPersistentProjectStore({ filePath: join(dir, 'project.json') });
    const server = createAppServer({
      projectStore,
      health: async () => ({ aily: { status: 'api_unavailable' }, base: { status: 'api_unavailable' } }),
      sync: async () => {},
    });
    const origin = await listen(server);
    try {
      const response = await fetch(`${origin}/api/agent/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: '先看看客餐厅，不要改', eventId: 'evt-readonly-http' }),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.version.id, 'version-demo-initial');
      assert.equal(projectStore.snapshot().versions.length, 1);
    } finally {
      await close(server);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('BFF client-scene Agent mode returns commands without persisting server versions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-bff-client-scene-'));
  try {
    const projectStore = createPersistentProjectStore({ filePath: join(dir, 'project.json') });
    const beforeScene = projectStore.getSceneStore().currentScene;
    const server = createAppServer({
      projectStore,
      health: async () => ({ aily: { status: 'api_unavailable' }, base: { status: 'api_unavailable' } }),
      sync: async () => {},
      agentProvider: () => ({ toolCalls: [{ tool: 'move_object', args: { objectId: 'object-sofa', dx: 200 } }] }),
    });
    const origin = await listen(server);
    try {
      const response = await fetch(`${origin}/api/agent/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: '沙发向右移动20厘米',
          eventId: 'evt-client-scene',
          versionId: projectStore.currentVersionId,
          scene: JSON.stringify(beforeScene),
        }),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.commands.length, 1);
      assert.equal(body.scene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);
      assert.equal(projectStore.snapshot().versions.length, 1);
    } finally {
      await close(server);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('BFF snapshot confirm review and export keep statuses and pending sync', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-bff-handoff-'));
  try {
    const projectStore = createPersistentProjectStore({ filePath: join(dir, 'project.json'), id: () => 'handoff' });
    const initial = createSceneStore(createDemoScene());
    const moved = dispatchSceneCommand(initial, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
    const version = projectStore.recordVersion({
      expectedVersionId: projectStore.currentVersionId,
      store: moved,
      event: { eventId: 'evt-handoff-version', input: 'move', provider: 'local', trace: { toolCalls: [] } },
    });
    let history = createVersionHistory(initial, { now: '2026-08-11T00:00:00.000Z' });
    history = saveSceneVersion(history, moved, { id: version.id, now: version.createdAt, source: 'manual' });
    const household = createDemoHouseholdConsensus(version.id);
    const server = createAppServer({
      projectStore,
      health: async () => ({ aily: { status: 'api_unavailable' }, base: { status: 'ready' } }),
      sync: async () => { throw new Error('offline'); },
    });
    const origin = await listen(server);
    try {
      const snapshot = await fetch(`${origin}/api/projects/project-demo/snapshot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: 'evt-snapshot',
          versionHistory: serializeVersionHistory(history),
          householdConsensus: serializeHouseholdConsensus(household),
        }),
      });
      assert.equal(snapshot.status, 200);
      assert.equal((await snapshot.json()).sync, 'pending');

      const confirmed = await fetch(`${origin}/api/versions/${version.id}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: 'evt-confirm-http', actor: 'resident' }),
      });
      const confirmedBody = await confirmed.json();
      assert.equal(confirmed.status, 200);
      assert.equal(confirmedBody.version.status, 'customer_confirmed');

      const reviewed = await fetch(`${origin}/api/versions/${version.id}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: 'evt-review-http', action: 'approve', note: '可以交接' }),
      });
      const reviewedBody = await reviewed.json();
      assert.equal(reviewed.status, 200);
      assert.equal(reviewedBody.version.status, 'designer_verified');
      assert.equal(reviewedBody.sync, 'pending');

      const exported = await (await fetch(`${origin}/api/projects/project-demo/export?versionId=${version.id}`)).json();
      assert.equal(exported.packet.version.id, version.id);
      assert.equal(exported.review.currentVersionId, version.id);
      assert.equal(exported.review.capability.base, 'ready');
      assert.equal(exported.packet.downstreamPlaceholders.production, 'not_connected_in_v1');
      assert.equal(exported.packet.unresolved.some((item) => item.code === 'OPPEIN_ENTERPRISE_API_PENDING'), true);
    } finally {
      await close(server);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('BFF exposes the replaceable demo catalog without claiming real SKUs', async () => {
  const server = createAppServer({
    projectStore: null,
    health: async () => ({ aily: { status: 'api_unavailable' }, base: { status: 'api_unavailable' } }),
  });
  const origin = await listen(server);
  try {
    const response = await fetch(`${origin}/api/catalog/components?q=%E5%B1%82%E6%9D%BF&category=shelving`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.catalog.source, 'demo');
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].id, 'demo-shelf-floating-900');
    assert.equal(body.items[0].commercial.price.source, 'estimate');

    const itemResponse = await fetch(`${origin}/api/catalog/components/demo-wall-panel-light-oak`);
    const itemBody = await itemResponse.json();
    assert.equal(itemResponse.status, 200);
    assert.equal(itemBody.item.operation.type, 'surface.setMaterial');

    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.catalog.status, 'ready');
    assert.equal(health.catalog.reason, 'demo_catalog');

    const invalid = await fetch(`${origin}/api/catalog/components?limit=100`);
    assert.equal(invalid.status, 400);
  } finally {
    await close(server);
  }
});

test('BFF persists handoff snapshot, customer confirmation, designer review, and export read-back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-bff-handoff-'));
  try {
    const projectStore = createPersistentProjectStore({ filePath: join(dir, 'project.json') });
    const initial = projectStore.getSceneStore();
    const changed = dispatchSceneCommand(initial, {
      type: 'object.setTransform',
      objectId: 'object-sofa',
      transform: { x: 2400 },
    });
    const history = saveSceneVersion(createVersionHistory(initial), changed, {
      id: 'version-browser-v2',
      now: '2026-08-11T00:00:00.000Z',
      source: 'manual',
    });
    const consensus = createDemoHouseholdConsensus(history.currentVersionId);
    const server = createAppServer({
      projectStore,
      health: async () => ({ aily: { status: 'api_unavailable' }, base: { status: 'api_unavailable' } }),
      sync: async () => { throw new Error('offline'); },
      id: () => 'handoff',
    });
    const origin = await listen(server);
    try {
      const snapshot = await fetch(`${origin}/api/projects/project-demo/snapshot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: 'evt-handoff-http',
          versionHistory: serializeVersionHistory(history),
          householdConsensus: serializeHouseholdConsensus(consensus),
        }),
      });
      const snapshotBody = await snapshot.json();
      assert.equal(snapshot.status, 200);
      assert.equal(snapshotBody.sync, 'pending');
      assert.equal(snapshotBody.packet.version.id, history.currentVersionId);
      assert.equal(projectStore.currentVersionId, history.currentVersionId);
      assert.equal(projectStore.getSceneStore().currentScene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);

      const confirmed = await fetch(`${origin}/api/versions/${history.currentVersionId}/confirm`, { method: 'POST' });
      const confirmedBody = await confirmed.json();
      assert.equal(confirmed.status, 200);
      assert.equal(confirmedBody.packet.version.status, 'customer_confirmed');

      const invalidReview = await fetch(`${origin}/api/versions/${history.currentVersionId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'maybe' }),
      });
      assert.equal(invalidReview.status, 400);

      const reviewed = await fetch(`${origin}/api/versions/${history.currentVersionId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'approved', notes: '可进入下一步' }),
      });
      const reviewedBody = await reviewed.json();
      assert.equal(reviewed.status, 200);
      assert.equal(reviewedBody.reviewDecision.decision, 'approved');
      assert.equal(reviewedBody.handoffUrl, `/handoff/${history.currentVersionId}`);

      const exported = await (await fetch(`${origin}/api/projects/project-demo/export`)).json();
      assert.equal(exported.packet.version.status, 'designer_verified');
      assert.equal(exported.reviewDecision.decision, 'approved');
      assert.equal(exported.packet.unresolved.some((item) => item.code === 'OPPEIN_ENTERPRISE_API_PENDING'), true);
    } finally {
      await close(server);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
