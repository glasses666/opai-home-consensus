import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { createAppServer } from '../server/index.mjs';
import { createPersistentProjectStore } from '../server/project-store.mjs';
import { firstPlanBriefFromSetup, generateFirstPlan } from '../src/agent/first-plan.js';
import { createDemoScene } from '../src/domain/demo-scene.js';

const fixture = JSON.parse(readFileSync(new URL('../evals/gate32/gate32-20260814041954-20260814/records/art-deco__balanced__random-1-20260814.json', import.meta.url), 'utf8'));
const setup = {
  step: 'summary',
  sourceType: 'demo',
  fileName: '',
  floorplanConfirmed: true,
  floorplanNote: '已确认',
  budget: '20–35 万',
  members: ['self', 'partner'],
  memberDetails: {},
  styles: ['art-deco', 'scandinavian'],
  ready: true,
};
const fixtureProvider = () => {
  let index = 0;
  return async () => fixture.segmentRecords[index++].response;
};
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = (server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

test('first-plan setup is normalized before the v1.21 three-segment contract runs', async () => {
  const prepared = firstPlanBriefFromSetup({ ...setup, members: ['self', 'self', 'partner'], ignored: 'nope' });
  assert.deepEqual(prepared.setup.members, ['self', 'partner']);
  assert.equal(prepared.brief.knownFacts.length, 3);

  const generated = await generateFirstPlan({ scene: createDemoScene(), setup, provider: fixtureProvider() });
  assert.equal(generated.promptVersion, 'oppein-standard-master-plan-v1.21');
  assert.equal(generated.plan.title, fixture.plan.title);
  assert.deepEqual(generated.stages.map(({ status }) => status), Array(5).fill('completed'));

  assert.throws(() => firstPlanBriefFromSetup({ ...setup, ready: false }), /PROJECT_SETUP_INCOMPLETE/);
});

test('project store persists first-plan idempotency without creating a scene version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-first-plan-store-'));
  const file = join(dir, 'project.json');
  try {
    const store = createPersistentProjectStore({ filePath: file });
    const saved = store.saveFirstPlan({
      eventId: 'evt-first-plan',
      setupFingerprint: firstPlanBriefFromSetup(setup).setupFingerprint,
      versionId: store.currentVersionId,
      status: 'ready',
      stages: [],
      result: { plan: { title: 'test' } },
      provider: { source: 'aily', status: 'ready' },
      error: null,
    });
    const restarted = createPersistentProjectStore({ filePath: file });
    assert.deepEqual(restarted.findFirstPlanByEventId(saved.eventId), saved);
    assert.equal(restarted.snapshot().versions.length, 1);
    assert.throws(() => restarted.saveFirstPlan({ ...saved, setupFingerprint: 'different' }), /EVENT_ID_CONFLICT/);
    assert.throws(() => restarted.recordVersion({
      expectedVersionId: restarted.currentVersionId,
      store: restarted.getSceneStore(),
      event: { eventId: saved.eventId },
    }), /EVENT_ID_CONFLICT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('first-plan endpoint returns a durable Aily plan and idempotent replay', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-first-plan-http-'));
  const store = createPersistentProjectStore({ filePath: join(dir, 'project.json') });
  let providerCalls = 0;
  const provider = fixtureProvider();
  const server = createAppServer({
    projectStore: store,
    firstPlanProvider: async (context) => { providerCalls += 1; return provider(context); },
    sync: async () => { throw new Error('offline'); },
  });
  const origin = await listen(server);
  const request = {
    eventId: 'evt-first-plan-http',
    expectedVersionId: store.currentVersionId,
    setup,
  };
  try {
    const first = await fetch(`${origin}/api/projects/project-demo/first-plan`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    });
    const body = await first.json();
    assert.equal(first.status, 200);
    assert.equal(body.status, 'ready');
    assert.equal(body.provider.source, 'aily');
    assert.equal(body.provider.replayed, false);
    assert.equal(body.result.plan.title, fixture.plan.title);
    assert.equal(body.sync, 'pending');
    assert.equal(body.error, null);
    assert.equal(providerCalls, 3);

    const replay = await fetch(`${origin}/api/projects/project-demo/first-plan`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    });
    const replayBody = await replay.json();
    assert.equal(replayBody.provider.replayed, true);
    assert.equal(providerCalls, 3);
  } finally {
    await close(server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('first-plan endpoint degrades truthfully when Aily is unavailable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-first-plan-degraded-'));
  const store = createPersistentProjectStore({ filePath: join(dir, 'project.json') });
  const server = createAppServer({ projectStore: store, firstPlanProvider: null, sync: async () => {} });
  const origin = await listen(server);
  try {
    const response = await fetch(`${origin}/api/projects/project-demo/first-plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId: 'evt-first-plan-offline', expectedVersionId: store.currentVersionId, setup }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'degraded');
    assert.equal(body.result, null);
    assert.equal(body.provider.status, 'unavailable');
    assert.equal(body.provider.source, 'none');
    assert.equal(body.error.code, 'AILY_UNAVAILABLE');
  } finally {
    await close(server);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('first-plan endpoint keeps the envelope stable for invalid setup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-first-plan-invalid-'));
  const store = createPersistentProjectStore({ filePath: join(dir, 'project.json') });
  const server = createAppServer({ projectStore: store });
  const origin = await listen(server);
  try {
    const response = await fetch(`${origin}/api/projects/project-demo/first-plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId: 'evt-invalid', expectedVersionId: store.currentVersionId, setup: { ...setup, ready: false } }),
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(body), ['status', 'stages', 'result', 'provider', 'sync', 'error']);
    assert.equal(body.status, 'failed');
    assert.equal(body.provider.status, 'not_started');
    assert.equal(body.sync, 'not_attempted');
    assert.equal(body.error.code, 'PROJECT_SETUP_INCOMPLETE');
  } finally {
    await close(server);
    rmSync(dir, { recursive: true, force: true });
  }
});
