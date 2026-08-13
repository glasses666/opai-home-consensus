import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { createAgentLiveServer } from '../server/agent-live.mjs';

const fakeRunner = () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  queueMicrotask(() => {
    child.stdout.write('{"passed":true}\n');
    child.stdout.end();
    child.emit('close', 0);
  });
  return child;
};

test('live observer is allowlisted, token-gated, and reports completion', async () => {
  const live = createAgentLiveServer({ token: 'test-token', runner: fakeRunner });
  await new Promise((resolve) => live.server.listen(0, '127.0.0.1', resolve));
  const { port } = live.server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const forbidden = await fetch(`${base}/api/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caseId: 'golden-propose-style' }) });
    assert.equal(forbidden.status, 403);
    const unknown = await fetch(`${base}/api/run`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-live-token': 'test-token' }, body: JSON.stringify({ caseId: 'shell-anything' }) });
    assert.equal(unknown.status, 400);
    const accepted = await fetch(`${base}/api/run`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-agent-live-token': 'test-token' }, body: JSON.stringify({ caseId: 'golden-propose-style' }) });
    assert.equal(accepted.status, 202);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(live.getState(), {
      status: 'passed', caseId: 'golden-propose-style', startedAt: live.getState().startedAt, elapsedMs: live.getState().elapsedMs, exitCode: 0,
    });
  } finally {
    await new Promise((resolve) => live.server.close(resolve));
  }
});

test('live observer exposes the fixed five-turn resident session', () => {
  const live = createAgentLiveServer({ token: 'test-token', runner: fakeRunner });
  assert.equal(typeof live.run, 'function');
  assert.doesNotThrow(() => live.run('resident-five-turns'));
});
