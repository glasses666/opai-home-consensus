import { randomUUID } from 'node:crypto';

import { buildAgentPrompt } from '../src/agent/prompt.js';
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

function parseToolCalls(text, { allowTextReply = false, captureRawResponse = false } = {}) {
  const cleaned = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const invalid = () => {
    const error = new Error('AILY_RESPONSE_INVALID');
    if (captureRawResponse) Object.defineProperty(error, 'rawResponse', { value: cleaned });
    return error;
  };
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    if (allowTextReply && cleaned) return { assistantReply: cleaned, toolCalls: [] };
    throw invalid();
  }
  if (!Array.isArray(parsed?.toolCalls) && !Array.isArray(parsed?.tool_calls)) {
    throw invalid();
  }
  return parsed;
}

function promptForContext(context) {
  if (context?.prompt !== undefined) {
    if (typeof context.prompt !== 'string' || !context.prompt.trim() || context.prompt.length > 60_000) {
      throw new Error('AILY_PROMPT_INVALID');
    }
    return context.prompt;
  }
  const { input, mode, scene, selectedObjectId, tools, catalog, designBrief, styleEvidence } = context ?? {};
  return buildAgentPrompt({ input, mode, scene, selectedObjectId, tools, catalog, designBrief, styleEvidence });
}

function apiArgs(method, path, { data, params } = {}) {
  const args = ['api', method, path, '--as', 'user', '--json'];
  if (params) args.push('--params', JSON.stringify(params));
  if (data) args.push('--data', JSON.stringify(data));
  return args;
}

async function callAilyOnce(context, {
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

  const prompt = promptForContext(context);
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
  const parsed = parseToolCalls(content, { captureRawResponse: Boolean(context?.prompt) });
  if (context?.prompt) Object.defineProperty(parsed, 'providerTrace', { value: { provider: 'aily_legacy', sessionId, runId } });
  return parsed;
}

async function callTeamAgentOnce(context, {
  agentId,
  resumeChatId,
  run = runLarkCli,
  pollMs = 250,
  timeoutMs = 12_000,
} = {}) {
  if (!/^agent_[A-Za-z0-9_-]{1,59}$/.test(agentId ?? '')) throw new Error('AILY_AGENT_ID_INVALID');
  const safeAgentId = encodeURIComponent(agentId);
  let chatId = firstString(resumeChatId);
  if (chatId && (chatId.length > 256 || /\s/.test(chatId))) throw new Error('AILY_CHAT_ID_INVALID');
  if (!chatId) {
    const prompt = promptForContext(context);
    const created = await run(apiArgs('POST', `/open-apis/aily/v1/agents/${safeAgentId}/chats`, {
      data: {
        stream: false,
        user_message: { content: [{ type: 'text', text: prompt }] },
      },
    }));
    chatId = firstString(dataOf(created).agent_chat_id);
    if (!chatId) throw new Error('AILY_CHAT_INVALID');
  }
  const providerTrace = { provider: 'aily_team', agentId, chatId };

  const deadline = Date.now() + timeoutMs;
  let completedWithoutContent = false;
  while (Date.now() < deadline) {
    const result = dataOf(await run(apiArgs('GET', `/open-apis/aily/v1/agents/${safeAgentId}/chats/${encodeURIComponent(chatId)}`)));
    const state = String(result.status ?? '').toLowerCase();
    const text = (result.content ?? [])
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n');
    if ((result.finish_reason || ['completed', 'succeeded', 'success', 'finished'].includes(state)) && text) {
      lastAilySuccessAt = new Date().toISOString();
      let parsed;
      try {
        parsed = parseToolCalls(text, {
          allowTextReply: !context?.prompt && (context?.tools ?? []).every((tool) => tool.writes !== true),
          captureRawResponse: Boolean(context?.prompt),
        });
      } catch (error) {
        error.providerTrace = providerTrace;
        throw error;
      }
      if (context?.prompt) Object.defineProperty(parsed, 'providerTrace', { value: providerTrace });
      return parsed;
    }
    if (result.finish_reason || ['completed', 'succeeded', 'success', 'finished'].includes(state)) completedWithoutContent = true;
    if (['failed', 'expired', 'cancelled'].includes(state)) {
      const error = new Error(`AILY_CHAT_${state.toUpperCase()}`);
      error.providerTrace = providerTrace;
      throw error;
    }
    await sleep(pollMs);
  }
  const error = new Error(completedWithoutContent ? 'AILY_RESPONSE_MISSING' : 'AILY_TIMEOUT');
  error.retryable = true;
  error.providerTrace = providerTrace;
  throw error;
}

export async function callAily(context, options = {}) {
  const maxAttempts = options.maxAttempts ?? 2;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2) throw new Error('AILY_ATTEMPTS_INVALID');
  let resumeChatId = options.resumeChatId;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return options.agentId
        ? await callTeamAgentOnce(context, { ...options, resumeChatId })
        : await callAilyOnce(context, options);
    } catch (error) {
      const retryable = error?.retryable || error?.message === 'AILY_RESPONSE_INVALID';
      if (attempt === maxAttempts - 1 || !retryable) throw error;
      resumeChatId = error?.message === 'AILY_RESPONSE_INVALID' ? null : error?.providerTrace?.chatId;
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

export function safeBaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && /(^|\.)(feishu\.cn|larkoffice\.com)$/.test(url.hostname)
      && /^\/base\/[a-zA-Z0-9]+\/?$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export async function syncActivity(event, {
  run = runLarkCli,
  env = process.env,
} = {}) {
  if (!event?.eventId) throw new Error('ACTIVITY_EVENT_INVALID');
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
  const eventType = event.type ?? 'agent_turn';
  const trace = event.trace ?? {};
  const fields = {
    'Event ID': event.eventId,
    'Project ID': event.projectId ?? 'PRJ-2026-008',
    'Space ID': event.spaceId ?? 'scene-demo-whole-home',
    'Version ID': event.versionId ?? 'scene-demo-whole-home:n1',
    '事件类型': eventType,
    Actor: event.actor ?? (eventType === 'agent_turn' ? 'agent' : 'system'),
    Provider: event.provider === 'aily' ? 'aily' : 'local',
    '用户表达': event.input ?? eventType,
    'Structured Intent JSON': JSON.stringify(trace.toolCalls ?? event.payload ?? []),
    'Result JSON': JSON.stringify(event.result ?? trace),
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
    recordUrl: safeBaseUrl(env.FEISHU_BASE_URL),
  };
}

function familyBaseConfig(env = process.env) {
  const baseToken = env.FEISHU_FAMILY_BASE_TOKEN;
  const tableId = env.FEISHU_FAMILY_TABLE_ID;
  if (!/^[A-Za-z0-9]{8,128}$/.test(baseToken ?? '') || !/^tbl[A-Za-z0-9]{4,128}$/.test(tableId ?? '')) {
    throw new Error('FEISHU_FAMILY_BASE_NOT_CONFIGURED');
  }
  return { baseToken, tableId, baseUrl: safeBaseUrl(env.FEISHU_FAMILY_BASE_URL) };
}

const familySearchArgs = ({ baseToken, tableId }, eventId) => [
  'base', '+record-search',
  '--base-token', baseToken,
  '--table-id', tableId,
  '--keyword', eventId,
  '--search-field', 'Event ID',
  '--field-id', 'Event ID',
  '--limit', '2',
  '--format', 'json',
  '--as', 'user',
];

const familyBaseEntry = ({ tableId, baseUrl }, { recordId = null, eventId = null } = {}) => ({
  kind: 'base_root',
  openUrl: baseUrl,
  isDirect: false,
  accessStatus: 'unverified',
  tableId,
  recordId,
  lookup: eventId ? { field: 'Event ID', value: eventId } : null,
});

function safeRecordShareUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && /(^|\.)(feishu\.cn|larksuite\.com|larkoffice\.com)$/.test(url.hostname)
      && /^\/record\/[a-zA-Z0-9]+\/?$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

async function familyRecordEntry(config, { recordId, eventId, run }) {
  const fallback = familyBaseEntry(config, { recordId, eventId });
  try {
    const envelope = await run([
      'base', '+record-share-link-create',
      '--base-token', config.baseToken,
      '--table-id', config.tableId,
      '--record-ids', recordId,
      '--as', 'user', '--json',
    ]);
    const openUrl = safeRecordShareUrl(dataOf(envelope).record_share_links?.[recordId]);
    return openUrl ? {
      ...fallback,
      kind: 'record',
      openUrl,
      isDirect: true,
      // The read-only command creates a locator; it does not grant another
      // person permission to open it.
      accessStatus: 'unverified',
    } : fallback;
  } catch {
    return fallback;
  }
}

const fieldName = (field) => firstString(field?.name, field?.field_name);
const fieldType = (field) => firstString(field?.type, field?.type_name);

function platformProvenance(schemaFields, values) {
  const updatedByField = schemaFields.find((field) => fieldType(field) === 'updated_by');
  const updatedAtField = schemaFields.find((field) => fieldType(field) === 'updated_at');
  const actorValue = updatedByField ? values[fieldName(updatedByField)] : null;
  const actorCandidate = Array.isArray(actorValue) ? actorValue[0] : actorValue;
  const recordLastEditor = actorCandidate && typeof actorCandidate === 'object'
    && typeof actorCandidate.id === 'string' && actorCandidate.id.trim()
    && typeof actorCandidate.name === 'string' && actorCandidate.name.trim()
    ? { id: actorCandidate.id.trim().slice(0, 256), name: actorCandidate.name.trim().slice(0, 80) }
    : null;
  const editedValue = updatedAtField ? values[fieldName(updatedAtField)] : null;
  const recordLastEditedAt = typeof editedValue === 'string' || typeof editedValue === 'number'
    ? String(editedValue)
    : null;
  return {
    // `updated_by` is record-level audit metadata. It does not prove who
    // authored the opinion field, because service-side slot updates also
    // change the record's last editor.
    recordLastEditor,
    recordLastEditedAt,
    identityStatus: recordLastEditor ? 'verified_record_editor' : 'unverified',
  };
}

export function getFamilyBaseLocation({ env = process.env } = {}) {
  const { tableId, baseUrl } = familyBaseConfig(env);
  return {
    tableId,
    baseUrl,
    entry: familyBaseEntry({ tableId, baseUrl }),
  };
}

export async function syncFamilyActivity(event, {
  run = runLarkCli,
  env = process.env,
} = {}) {
  if (!event?.eventId || !event?.projectId || !event?.versionId || !event?.trace?.discussionId) {
    throw new Error('FAMILY_ACTIVITY_EVENT_INVALID');
  }
  const config = familyBaseConfig(env);
  const searchArgs = familySearchArgs(config, event.eventId);
  const existing = dataOf(await run(searchArgs)).record_id_list ?? [];
  if (existing.length > 1) throw new Error('FAMILY_BASE_EVENT_DUPLICATE');
  const recordId = existing[0] ?? null;
  const result = event.result ?? {};
  const fields = {
    'Event ID': event.eventId,
    'Project ID': event.projectId,
    'Discussion ID': event.trace.discussionId,
    'Version ID': event.versionId,
    '事件类型': event.type ?? 'family_discussion_event',
    '成员称呼': result.participantLabel ?? result.opinionSource?.memberLabel ?? '',
    'Source JSON': JSON.stringify(result.opinionSource ?? result.source ?? {}),
    'Result JSON': JSON.stringify(result),
    '同步状态': 'synced',
  };
  // A slot's opinion becomes human-owned after creation. Retrying sync must not
  // overwrite a family member's edit with the original placeholder.
  if (event.type === 'family_opinion_slot' && !recordId) fields['意见'] = event.input ?? '';
  if (event.type === 'family_opinion_received') fields['意见'] = event.input ?? '';
  const args = [
    'base', '+record-upsert',
    '--base-token', config.baseToken,
    '--table-id', config.tableId,
    '--json', JSON.stringify(fields),
    '--as', 'user', '--format', 'json',
  ];
  if (recordId) args.push('--record-id', recordId);
  await run(args);
  const readBackIds = dataOf(await run(searchArgs)).record_id_list ?? [];
  const verifiedRecordId = recordId ?? readBackIds[0] ?? null;
  if (!verifiedRecordId || !readBackIds.includes(verifiedRecordId)) throw new Error('FAMILY_BASE_READ_BACK_MISMATCH');
  const entry = event.type === 'family_opinion_slot'
    ? await familyRecordEntry(config, { recordId: verifiedRecordId, eventId: event.eventId, run })
    : familyBaseEntry(config, { recordId: verifiedRecordId, eventId: event.eventId });
  lastBaseSuccessAt = new Date().toISOString();
  return {
    eventId: event.eventId,
    recordId: verifiedRecordId,
    recordUrl: entry.openUrl,
    entry,
    verifiedAt: lastBaseSuccessAt,
  };
}

export async function readFamilyActivityRecord(recordId, {
  run = runLarkCli,
  env = process.env,
} = {}) {
  if (!/^[A-Za-z0-9_-]{4,256}$/.test(recordId ?? '')) throw new Error('FAMILY_BASE_RECORD_ID_INVALID');
  const config = familyBaseConfig(env);
  const envelope = await run([
    'base', '+record-get',
    '--base-token', config.baseToken,
    '--table-id', config.tableId,
    '--record-id', recordId,
    '--as', 'user', '--format', 'json',
  ]);
  const data = dataOf(envelope);
  const record = data.record ?? data;
  const fields = Array.isArray(data.fields) && Array.isArray(data.data?.[0])
    ? Object.fromEntries(data.fields.map((field, index) => [field, data.data[0][index]]))
    : record.fields ?? {};
  let schemaFields = [];
  try {
    const schema = dataOf(await run([
      'base', '+field-list',
      '--base-token', config.baseToken,
      '--table-id', config.tableId,
      '--as', 'user', '--json',
    ]));
    schemaFields = Array.isArray(schema.fields) ? schema.fields : [];
  } catch { /* Missing schema evidence degrades identity to unverified. */ }
  const provenance = platformProvenance(schemaFields, fields);
  const resolvedRecordId = firstString(record.record_id, record.id, data.record_id_list?.[0], recordId);
  const entry = await familyRecordEntry(config, {
    recordId: resolvedRecordId,
    eventId: fields['Event ID'] ?? null,
    run,
  });
  return {
    recordId: resolvedRecordId,
    eventId: fields['Event ID'] ?? null,
    projectId: fields['Project ID'] ?? null,
    discussionId: fields['Discussion ID'] ?? null,
    versionId: fields['Version ID'] ?? null,
    eventType: fields['事件类型'] ?? null,
    // This is an invitation/row label chosen by the project user. It is not
    // proof of who edited the Base record.
    invitedLabel: fields['成员称呼'] ?? null,
    memberLabel: fields['成员称呼'] ?? null,
    opinion: fields['意见'] ?? null,
    // The current CLI output exposes these as table fields. Until field
    // metadata proves they are platform-owned system fields, they remain
    // untrusted compatibility data and must never become an authenticated
    // author in the product.
    updatedBy: fields['更新人'] ?? null,
    updatedAt: fields['更新时间'] ?? null,
    ...provenance,
    recordUrl: entry.openUrl,
    entry,
  };
}
