import { approveReview } from '../test-support/quality-review-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callDeepSeek, callDesignDeepSeek } from '../server/deepseek.mjs';
import { createExperienceStore } from '../server/experience-store.mjs';
import { createExperienceRoutes } from '../server/experience-routes.mjs';
import { createAppServer } from '../server/index.mjs';

const prompt = { prompt: '{"task":"answer"}' };
const reply = (extra = {}) => ({ ok: true, json: async () => ({
  model: 'deepseek-flash', id: 'test-response',
  choices: [{ finish_reason: 'stop', message: { content: '{"action":"answer"}', reasoning_content: 'private reasoning must not escape' } }],
  usage: { completion_tokens: 180, completion_tokens_details: { reasoning_tokens: 150 } },
  ...extra,
}) });

test('main design provider enables high reasoning with a shared reasoning/output budget', async () => {
  let body;
  const result = await callDesignDeepSeek(prompt, { apiKey: 'test-key', thinking: 'enabled', reasoningEffort: 'high',
    fetchImpl: async (_url, request) => { body = JSON.parse(request.body); return reply(); },
  });
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.equal(body.reasoning_effort, 'high');
  assert.equal(body.max_tokens, 4096);
  assert.equal('temperature' in body, false);
  assert.equal('tools' in body, false); // Current Harness uses JSON observations, not native tool messages.
  assert.equal(result.providerTrace.model, 'deepseek-flash');
  assert.deepEqual(result.providerTrace.reasoning, { observed: true, tokens: 150 });
  assert.equal(result.providerTrace.parameters.reasoningEffort, 'high');
  assert.equal(JSON.stringify({ result, trace: result.providerTrace }).includes('private reasoning'), false);
});

test('requested thinking is not claimed as observed when the endpoint provides no evidence', async () => {
  const result = await callDesignDeepSeek(prompt, { apiKey: 'test-key', fetchImpl: async () => reply({
    choices: [{ finish_reason: 'stop', message: { content: '{"action":"answer"}' } }], usage: {},
  }) });
  assert.deepEqual(result.providerTrace.reasoning, { observed: false, tokens: null });
});

test('the design provider supports an explicit nonthinking rollback', async () => {
  let body;
  const result = await callDesignDeepSeek(prompt, { apiKey: 'test-key', thinking: 'disabled',
    fetchImpl: async (_url, request) => { body = JSON.parse(request.body); return reply(); },
  });
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.temperature, 0.1);
  assert.equal('reasoning_effort' in body, false);
  assert.equal(body.max_tokens, 4096);
  assert.equal(result.providerTrace.parameters.thinking, 'disabled');
});

test('review calls keep reasoning enabled but use purpose-sized output budgets', async () => {
  const observed = [];
  const fetchImpl = async (_url, request) => {
    observed.push(JSON.parse(request.body));
    return reply();
  };
  await callDesignDeepSeek({ ...prompt, purpose: 'review_requirements' }, { apiKey: 'test-key', fetchImpl });
  await callDesignDeepSeek({ ...prompt, purpose: 'review_proposal' }, { apiKey: 'test-key', fetchImpl });
  assert.deepEqual(observed.map(body => body.thinking), [{ type: 'enabled' }, { type: 'enabled' }]);
  assert.deepEqual(observed.map(body => body.reasoning_effort), ['low', 'high']);
  assert.deepEqual(observed.map(body => body.max_tokens), [4096, 4096]);
});

test('the independent structured reviewer can explicitly disable thinking without disabling planner reasoning', async () => {
  let body;
  await callDesignDeepSeek({ ...prompt, purpose: 'review_proposal', thinking: 'disabled', reasoningEffort: 'low', maxTokens: 4096 }, {
    apiKey: 'test-key', fetchImpl: async (_url, request) => { body=JSON.parse(request.body);return reply(); },
  });
  assert.deepEqual(body.thinking,{type:'disabled'});assert.equal(body.temperature,0.1);
  assert.equal('reasoning_effort' in body,false);assert.equal(body.max_tokens,4096);
});

test('a caller deadline cannot be extended by adapter options', async () => {
  let requestSignal;
  await assert.rejects(callDesignDeepSeek({ ...prompt, timeoutMs: 5 }, {
    apiKey: 'test-key', timeoutMs: 1000, fetchImpl: async (_url, request) => {
      requestSignal = request.signal;
      // An ordinary timer keeps the test alive while AbortSignal.timeout uses an unref timer.
      await new Promise(resolve => setTimeout(resolve, 20));
      requestSignal.throwIfAborted();
    },
  }), { message: 'DEEPSEEK_TIMEOUT' });
  assert.equal(requestSignal.aborted, true);
});

test('invalid thinking parameters fail before calling the endpoint', async () => {
  const fetchImpl = async () => assert.fail('must not fetch');
  for (const [options, code] of [
    [{ thinking: 'auto' }, 'DEEPSEEK_THINKING_INVALID'],
    [{ reasoningEffort: 'ultra' }, 'DEEPSEEK_REASONING_EFFORT_INVALID'],
    [{ maxTokens: 0 }, 'DEEPSEEK_TOKEN_BUDGET_INVALID'],
  ]) await assert.rejects(callDeepSeek(prompt, { apiKey: 'test-key', fetchImpl, ...options }), { message: code });
});

test('reasoning truncation cannot become a successful preview, even with parseable content', async () => {
  await assert.rejects(callDesignDeepSeek(prompt, { apiKey: 'test-key', fetchImpl: async () => reply({
    choices: [{ finish_reason: 'length', message: { content: '{"action":"preview"}', reasoning_content: 'not retained' } }],
  }) }), { message: 'DEEPSEEK_RESPONSE_TRUNCATED' });
});

test('timeout and cancellation during response-body receipt remain distinct failures', async () => {
  const abort = new AbortController();
  await assert.rejects(callDesignDeepSeek({ ...prompt, signal: abort.signal }, {
    apiKey: 'test-key', fetchImpl: async () => ({ ok: true, json: async () => {
      abort.abort(); throw new DOMException('cancelled', 'AbortError');
    } }),
  }), { message: 'REQUEST_CANCELLED', retryable: false });
  await assert.rejects(callDesignDeepSeek(prompt, {
    apiKey: 'test-key', fetchImpl: async () => ({ ok: true, json: async () => { throw new DOMException('deadline', 'TimeoutError'); } }),
  }), { message: 'DEEPSEEK_TIMEOUT' });
});

test('the actual experience route uses reasoning by default and persists only its provenance', async t => {
  const keys = ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL', 'DEEPSEEK_DESIGN_THINKING', 'DEEPSEEK_DESIGN_REASONING_EFFORT'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  } });
  process.env.DEEPSEEK_API_KEY = 'isolated-test-key';
  process.env.DEEPSEEK_BASE_URL = 'https://deepseek.example.test';
  process.env.DEEPSEEK_MODEL = 'deepseek-v4-flash';
  delete process.env.DEEPSEEK_DESIGN_THINKING;
  delete process.env.DEEPSEEK_DESIGN_REASONING_EFFORT;
  let body;
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, request) => {
    if (!String(url).startsWith('https://deepseek.example.test/')) return originalFetch(url, request);
    body = JSON.parse(request.body);
    return reply({ choices: [{ finish_reason: 'stop', message: {
      content: '{"action":"clarify","question":"你指的是哪张桌子？"}', reasoning_content: 'private reasoning must not escape',
    } }] });
  });
  const directory = mkdtempSync(join(tmpdir(), 'opai-reasoning-route-'));
  const store = createExperienceStore({ directory });
  const server = createAppServer({ experienceHandler: createExperienceRoutes({reviewProvider:approveReview, store }) });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/api/experience/projects`;
  const p = await (await fetch(origin, { method: 'POST', body: '{}' })).json();
  const response = await fetch(`${origin}/${p.projectId}/turn`, { method: 'POST', headers: { authorization: `Bearer ${p.accessToken}` },
    body: JSON.stringify({ requestId: 'reasoning-route', expectedRevision: 0, input: '桌子位置不对', versionHistory: p.versionHistory }),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.max_tokens, 8192);
  assert.equal(result.trace.providerTrace.reasoning.tokens, 150);
  const reopened = store.read(p.projectId, p.accessToken);
  assert.equal(reopened.conversation.at(-1).trace.providerTrace.parameters.thinking, 'enabled');
  assert.equal(JSON.stringify(reopened).includes('private reasoning'), false);
  assert.equal(reopened.versionHistory, p.versionHistory);
});
