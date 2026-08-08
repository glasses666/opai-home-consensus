import { randomUUID } from 'node:crypto';

import { runLarkCli } from './lark-cli.mjs';

export const DEFAULT_BASE_TOKEN = 'S1GObxwLNaqZI9sRaZKcNZWPnRc';
export const DEFAULT_ACTIVITY_TABLE_ID = 'tbl35yjMLZMDsd1p';

export const AILY_LEGACY_REQUIRED_SCOPES = [
  'aily:message:read',
  'aily:message:write',
  'aily:run:read',
  'aily:run:write',
  'aily:session:read',
  'aily:session:write',
];

export const AILY_TEAM_REQUIRED_SCOPES = [
  'aily:agent_chat:read',
  'aily:agent_chat:write',
  'aily:agent_visibility:read',
];

export const BASE_REQUIRED_SCOPES = [
  'base:app:read',
  'base:record:create',
  'base:record:read',
  'base:record:update',
];

let lastAilySuccessAt = null;
let lastBaseSuccessAt = null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dataOf = (envelope) => envelope?.data ?? {};
const firstString = (...values) => values.find((value) => typeof value === 'string' && value.length > 0) ?? null;

function parseToolCalls(text) {
  const cleaned = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AILY_RESPONSE_INVALID');
  }
  if (!Array.isArray(parsed?.toolCalls) && !Array.isArray(parsed?.tool_calls)) {
    throw new Error('AILY_RESPONSE_INVALID');
  }
  return parsed;
}

function apiArgs(method, path, { data, params } = {}) {
  const args = ['api', method, path, '--as', 'user', '--json'];
  if (params) args.push('--params', JSON.stringify(params));
  if (data) args.push('--data', JSON.stringify(data));
  return args;
}

async function callAilyOnce({ input, scene, selectedObjectId, tools }, {
  appId,
  run = runLarkCli,
  id = randomUUID,
  pollMs = 250,
  timeoutMs = 12_000,
} = {}) {
  if (!appId) throw new Error('AILY_APP_ID_MISSING');

  const sessionEnvelope = await run(apiArgs('POST', '/open-apis/aily/v1/sessions', {
    data: { channel_context: '{}', metadata: JSON.stringify({ source: 'oppein-demo' }) },
  }));
  const session = dataOf(sessionEnvelope).session ?? dataOf(sessionEnvelope);
  const sessionId = firstString(session.id, session.session_id);
  if (!sessionId) throw new Error('AILY_SESSION_INVALID');

  const prompt = JSON.stringify({
    instruction: 'Return JSON only: {"toolCalls":[{"tool":"...","args":{}}]}. Use only listed tools; do not write scene JSON directly.',
    input,
    scene,
    selectedObjectId,
    tools,
  });
  await run(apiArgs('POST', `/open-apis/aily/v1/sessions/${sessionId}/messages`, {
    data: { idempotent_id: id(), content_type: 'TEXT', content: prompt },
  }));

  const runEnvelope = await run(apiArgs('POST', `/open-apis/aily/v1/sessions/${sessionId}/runs`, {
    data: { app_id: appId, metadata: JSON.stringify({ source: 'oppein-demo' }) },
  }));
  const startedRun = dataOf(runEnvelope).run ?? dataOf(runEnvelope);
  const runId = firstString(startedRun.id, startedRun.run_id);
  if (!runId) throw new Error('AILY_RUN_INVALID');

  const deadline = Date.now() + timeoutMs;
  let completed = false;
  while (Date.now() < deadline) {
    const statusEnvelope = await run(apiArgs('GET', `/open-apis/aily/v1/sessions/${sessionId}/runs/${runId}`));
    const currentRun = dataOf(statusEnvelope).run ?? dataOf(statusEnvelope);
    const status = String(currentRun.status ?? '').toUpperCase();
    if (['COMPLETED', 'SUCCEEDED', 'SUCCESS'].includes(status)) {
      completed = true;
      break;
    }
    if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(status)) throw new Error(`AILY_RUN_${status}`);
    await sleep(pollMs);
  }
  if (!completed) {
    const error = new Error('AILY_TIMEOUT');
    error.retryable = true;
    throw error;
  }

  const messagesEnvelope = await run(apiArgs('GET', `/open-apis/aily/v1/sessions/${sessionId}/messages`, {
    params: { run_id: runId, page_size: 50 },
  }));
  const messages = dataOf(messagesEnvelope).items ?? dataOf(messagesEnvelope).messages ?? [];
  const reply = [...messages].reverse().find((message) =>
    firstString(message.plain_text, message.content, message.text),
  );
  const content = reply && firstString(reply.plain_text, reply.content, reply.text);
  if (!content) throw new Error('AILY_RESPONSE_MISSING');

  lastAilySuccessAt = new Date().toISOString();
  return parseToolCalls(content);
}

async function callTeamAgentOnce({ input, scene, selectedObjectId, tools }, {
  agentId,
  run = runLarkCli,
  pollMs = 250,
  timeoutMs = 12_000,
} = {}) {
  if (!/^agent_[A-Za-z0-9_-]{1,59}$/.test(agentId ?? '')) throw new Error('AILY_AGENT_ID_INVALID');
  const safeAgentId = encodeURIComponent(agentId);
  const prompt = JSON.stringify({
    instruction: 'Return JSON only: {"toolCalls":[{"tool":"...","args":{}}]}. Use only listed tools; do not write scene JSON directly.',
    input,
    scene,
    selectedObjectId,
    tools,
  });
  const created = await run(apiArgs('POST', `/open-apis/aily/v1/agents/${safeAgentId}/chats`, {
    data: {
      stream: false,
      user_message: { content: [{ type: 'text', text: prompt }] },
    },
  }));
  const chatId = firstString(dataOf(created).agent_chat_id);
  if (!chatId) throw new Error('AILY_CHAT_INVALID');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = dataOf(await run(apiArgs('GET', `/open-apis/aily/v1/agents/${safeAgentId}/chats/${encodeURIComponent(chatId)}`)));
    const state = String(result.status ?? '').toLowerCase();
    const text = (result.content ?? [])
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n');
    if (result.finish_reason || ['completed', 'succeeded', 'success', 'finished', 'cancelled'].includes(state)) {
      if (!text) throw new Error('AILY_RESPONSE_MISSING');
      lastAilySuccessAt = new Date().toISOString();
      return parseToolCalls(text);
    }
    if (['failed', 'expired'].includes(state)) throw new Error(`AILY_CHAT_${state.toUpperCase()}`);
    await sleep(pollMs);
  }
  const error = new Error('AILY_TIMEOUT');
  error.retryable = true;
  throw error;
}

export async function callAily(context, options = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return options.agentId
        ? await callTeamAgentOnce(context, options)
        : await callAilyOnce(context, options);
    } catch (error) {
      if (attempt === 1 || !error?.retryable) throw error;
    }
  }
  throw new Error('AILY_UNAVAILABLE');
}

const status = (state, reason, extra = {}) => ({ status: state, reason, ...extra });

export async function getFeishuHealth({
  run = runLarkCli,
  env = process.env,
  ailyVerifiedAt = lastAilySuccessAt,
  baseVerifiedAt = lastBaseSuccessAt,
} = {}) {
  let auth;
  try {
    auth = await run(['auth', 'status', '--json', '--verify']);
  } catch (error) {
    const state = error?.code === 'CLI_UNAVAILABLE' || error?.code === 'CLI_TIMEOUT' ? 'api_unavailable' : 'auth_failed';
    return { aily: status(state, error?.code ?? 'auth_failed'), base: status(state, error?.code ?? 'auth_failed') };
  }

  const user = auth?.identities?.user;
  if (!auth?.verified || user?.status !== 'ready' || user?.tokenStatus !== 'valid') {
    return { aily: status('auth_failed', 'user_token_invalid'), base: status('auth_failed', 'user_token_invalid') };
  }
  const scopes = new Set(String(user.scope ?? '').split(/\s+/).filter(Boolean));
  const missingBase = BASE_REQUIRED_SCOPES.filter((scope) => !scopes.has(scope));

  let aily;
  const teamAgentId = env.AILY_AGENT_ID;
  const legacyAppId = env.AILY_APP_ID;
  const requiredAilyScopes = teamAgentId ? AILY_TEAM_REQUIRED_SCOPES : AILY_LEGACY_REQUIRED_SCOPES;
  const missingAily = requiredAilyScopes.filter((scope) => !scopes.has(scope));
  if (!teamAgentId && !legacyAppId) {
    aily = status('api_unavailable', 'missing_agent_or_app_id');
  } else if (missingAily.length) {
    aily = status('missing_scope', 'missing_scope', { missingScopes: missingAily });
  } else if (teamAgentId) {
    try {
      if (!/^agent_[A-Za-z0-9_-]{1,59}$/.test(teamAgentId)) throw new Error('AILY_AGENT_ID_INVALID');
      const visibility = dataOf(await run(apiArgs('POST', `/open-apis/aily/v1/agents/${encodeURIComponent(teamAgentId)}/agent_visibility/check`, {
        data: { channel_type: 'web_sdk' },
      }))).visibility;
      aily = visibility !== true
        ? status('api_unavailable', 'agent_not_visible')
        : ailyVerifiedAt
          ? status('ready', 'real_turn_verified', { verifiedAt: ailyVerifiedAt })
          : status('api_unavailable', 'real_turn_not_verified');
    } catch (error) {
      aily = status(error?.missingScopes?.length ? 'missing_scope' : 'api_unavailable', error?.code ?? 'visibility_probe_failed', {
        ...(error?.missingScopes?.length ? { missingScopes: error.missingScopes } : {}),
      });
    }
  } else if (!ailyVerifiedAt) {
    aily = status('api_unavailable', 'real_turn_not_verified');
  } else {
    aily = status('ready', 'real_turn_verified', { verifiedAt: ailyVerifiedAt });
  }

  let base;
  if (missingBase.length) {
    base = status('missing_scope', 'missing_scope', { missingScopes: missingBase });
  } else {
    try {
      const envelope = await run([
        'base', '+field-list',
        '--base-token', env.FEISHU_BASE_TOKEN ?? DEFAULT_BASE_TOKEN,
        '--table-id', env.FEISHU_ACTIVITY_TABLE_ID ?? DEFAULT_ACTIVITY_TABLE_ID,
        '--as', 'user', '--format', 'json',
      ]);
      const fields = dataOf(envelope).fields ?? [];
      if (!fields.some((field) => field.name === 'Event ID')) {
        base = status('api_unavailable', 'activity_schema_invalid');
      } else if (!baseVerifiedAt) {
        base = status('api_unavailable', 'real_write_not_verified');
      } else {
        base = status('ready', 'write_read_verified', { verifiedAt: baseVerifiedAt });
      }
    } catch (error) {
      base = status(error?.missingScopes?.length ? 'missing_scope' : 'api_unavailable', error?.code ?? 'base_probe_failed', {
        ...(error?.missingScopes?.length ? { missingScopes: error.missingScopes } : {}),
      });
    }
  }
  return { aily, base };
}

export async function syncActivity(event, {
  run = runLarkCli,
  env = process.env,
} = {}) {
  if (!event?.eventId || !event?.input || !event?.trace) throw new Error('ACTIVITY_EVENT_INVALID');
  const baseToken = env.FEISHU_BASE_TOKEN ?? DEFAULT_BASE_TOKEN;
  const tableId = env.FEISHU_ACTIVITY_TABLE_ID ?? DEFAULT_ACTIVITY_TABLE_ID;
  const searchArgs = [
    'base', '+record-search',
    '--base-token', baseToken,
    '--table-id', tableId,
    '--keyword', event.eventId,
    '--search-field', 'Event ID',
    '--field-id', 'Event ID',
    '--limit', '2',
    '--format', 'json',
    '--as', 'user',
  ];
  const search = await run(searchArgs);
  const existingId = dataOf(search).record_id_list?.[0] ?? null;
  const fields = {
    'Event ID': event.eventId,
    'Project ID': event.projectId ?? 'PRJ-2026-008',
    'Space ID': event.spaceId ?? 'scene-demo-whole-home',
    'Version ID': event.versionId ?? 'scene-demo-whole-home:n1',
    '事件类型': 'agent_turn',
    Actor: 'agent',
    Provider: event.provider === 'aily' ? 'aily' : 'local',
    '用户表达': event.input,
    'Structured Intent JSON': JSON.stringify(event.trace.toolCalls ?? []),
    'Result JSON': JSON.stringify(event.trace),
    'Trace ID': event.traceId ?? event.eventId,
    '同步状态': 'synced',
  };
  const args = [
    'base', '+record-upsert',
    '--base-token', baseToken,
    '--table-id', tableId,
    '--json', JSON.stringify(fields),
    '--as', 'user', '--format', 'json',
  ];
  if (existingId) args.push('--record-id', existingId);
  await run(args);
  const readBack = await run(searchArgs);
  const readBackIds = dataOf(readBack).record_id_list ?? [];
  const recordId = existingId ?? readBackIds[0] ?? null;
  if (!recordId || !readBackIds.includes(recordId)) {
    throw new Error('BASE_READ_BACK_MISMATCH');
  }
  lastBaseSuccessAt = new Date().toISOString();
  return {
    eventId: event.eventId,
    recordId,
    verifiedAt: lastBaseSuccessAt,
  };
}
