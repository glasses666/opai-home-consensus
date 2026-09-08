import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runAgentTurn } from '../src/agent/harness.js';
import { FIRST_PLAN_STAGES, firstPlanBriefFromSetup, generateFirstPlan } from '../src/agent/first-plan.js';
import { STANDARD_PLAN_PROMPT_VERSION } from '../src/agent/standard-design-plan.js';
import { demoCatalogPlugin } from '../src/catalog/demo-catalog.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { normalizeDesignBrief } from '../src/domain/design-brief.js';
import { confirmSceneVersion, createVersionHistory, deserializeVersionHistory, reviewSceneVersion, saveSceneVersion, serializeVersionHistory } from '../src/domain/design-version.js';
import { createDemoHouseholdConsensus, deserializeHouseholdConsensus, serializeHouseholdConsensus } from '../src/domain/household-consensus.js';
import { buildDesignerReview, buildHandoffPacket } from '../src/domain/handoff.js';
import { createSceneStore, deserializeScene } from '../src/domain/scene.js';
import { callDeepSeek } from './deepseek.mjs';
import { generateConsensusSummary } from './consensus-secretary.mjs';
import { callAily, getFeishuHealth, syncActivity, safeBaseUrl } from './feishu.mjs';
import { createPersistentProjectStore } from './project-store.mjs';

const JSON_LIMIT = 128 * 1024;
const SNAPSHOT_JSON_LIMIT = 1024 * 1024;
const AILY_RESPONSE_TIMEOUT_MS = 35_000;
const AGENT_PROVIDER_TIMEOUT_MS = 38_000;
const FIRST_PLAN_PROVIDER_TIMEOUT_MS = 240_000;
const DEFAULT_PROJECT_STORE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'project-demo.json');
const REVIEW_ACTIONS = new Set(['approve', 'return']);

export function handoffActivitySummary(snapshot, projectId, publicAppUrl = process.env.PUBLIC_APP_URL) {
  const history = deserializeVersionHistory(snapshot.versionHistory);
  const consensus = deserializeHouseholdConsensus(snapshot.householdConsensus);
  const review = buildDesignerReview(history, consensus, { projectId, versionId: snapshot.versionId });
  let reviewUrl = null;
  try {
    const origin = new URL(publicAppUrl);
    if (origin.protocol === 'https:' && !origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash) {
      reviewUrl = new URL(`/review/${encodeURIComponent(projectId)}?versionId=${encodeURIComponent(snapshot.versionId)}`, origin).href;
    }
  } catch { /* Unconfigured origins are intentionally not guessed. */ }
  return {
    versionId: snapshot.versionId, versionLabel: review.currentVersionLabel, status: review.status,
    changedFurnitureCount: review.objectDiffs.length, changedSurfaceCount: review.surfaceDiffs.length,
    ruleStatus: review.ruleStatus, ruleIssueCount: review.ruleIssues.length,
    unresolvedCount: review.unresolved.length, professionalReviewCount: review.professionalReviews.length,
    boundary: '概念方案演示；规则与影响为 demo/estimate，不代表真实报价、BOM、施工或专业审批。',
    reviewUrl,
  };
}

const pendingFirstPlanStages = () => FIRST_PLAN_STAGES.map((stage) => ({ ...stage, status: 'pending', attempts: 0 }));
const firstPlanEnvelope = (record, sync, replayed = false) => ({
  status: record.status,
  stages: record.stages,
  result: record.result,
  provider: { ...record.provider, replayed },
  sync,
  error: record.error,
});

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

const compactHistoryFromProjectStore = (snapshot) => ({
  ...snapshot.versions.slice(1).reduce(
    (history, version) => saveSceneVersion(history, {
      initialScene: snapshot.versions[0].scene,
      currentScene: version.scene,
      commands: version.commands,
      cursor: version.cursor,
    }, {
      id: version.id,
      now: version.createdAt,
      source: version.source,
    }),
    createVersionHistory(createSceneStore(snapshot.versions[0].scene), { now: snapshot.versions[0].createdAt }),
  ),
  currentVersionId: snapshot.project.currentVersionId,
});

const payloadFromHandoffSnapshot = (snapshot, { projectId, versionId, capability } = {}) => {
  const history = deserializeVersionHistory(snapshot.versionHistory);
  const consensus = deserializeHouseholdConsensus(snapshot.householdConsensus);
  const targetVersionId = versionId ?? snapshot.versionId;
  return {
    project: { id: projectId },
    packet: buildHandoffPacket(history, consensus, { projectId, versionId: targetVersionId, capability }),
    review: buildDesignerReview(history, consensus, { projectId, versionId: targetVersionId, capability }),
    reviewDecision: snapshot.review ?? null,
    consensusSummary: snapshot.consensusSummary ?? null,
    feishuDelivery: snapshot.feishuDelivery ?? { status: 'not_submitted' },
  };
};

const verifiedCapability = async (health) => {
  try {
    const value = await health();
    return {
      aily: value.aily?.status ?? value.aily ?? 'api_unavailable',
      base: value.base?.status ?? value.base ?? 'api_unavailable',
    };
  } catch {
    return { aily: 'api_unavailable', base: 'api_unavailable' };
  }
};

async function readJson(request, limit = JSON_LIMIT) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new Error('REQUEST_JSON_INVALID');
  }
}

export function createAppServer({
    initialStore = createSceneStore(createDemoScene()),
    projectStore = null,
    catalogPlugin = demoCatalogPlugin,
    health = getFeishuHealth,
    sync = syncActivity,
    agentProvider = process.env.DEEPSEEK_API_KEY
      ? (context) => callDeepSeek(context, { timeoutMs: AILY_RESPONSE_TIMEOUT_MS })
      : process.env.AILY_AGENT_ID || process.env.AILY_APP_ID
      ? (context) => callAily(context, {
          agentId: process.env.AILY_AGENT_ID,
          appId: process.env.AILY_APP_ID,
          timeoutMs: AILY_RESPONSE_TIMEOUT_MS,
          maxAttempts: 1,
        })
      : null,
    firstPlanProvider = process.env.DEEPSEEK_API_KEY
      ? (context) => callDeepSeek(context, { timeoutMs: FIRST_PLAN_PROVIDER_TIMEOUT_MS, maxTokens: 4096 })
      : process.env.AILY_AGENT_ID || process.env.AILY_APP_ID
      ? (context) => callAily(context, {
          agentId: process.env.AILY_AGENT_ID,
          appId: process.env.AILY_APP_ID,
          timeoutMs: FIRST_PLAN_PROVIDER_TIMEOUT_MS,
          maxAttempts: 1,
        })
      : null,
    consensusProvider = process.env.AILY_AGENT_ID
      ? (context) => callAily(context, { agentId: process.env.AILY_AGENT_ID, timeoutMs: 40_000, maxAttempts: 2 })
      : null,
    providerName = process.env.DEEPSEEK_API_KEY ? 'deepseek' : process.env.AILY_AGENT_ID || process.env.AILY_APP_ID ? 'aily' : firstPlanProvider ? 'aily' : agentProvider ? 'provider' : 'local',
    id = randomUUID,
  } = {}) {
  let store = initialStore;
  const pendingEvents = new Map();

  let activeFlush = null;
  let flushRequested = false;
  // A prior process cannot still be syncing this in-memory queue. Preserve the
  // saved handoff but expose interrupted attempts as explicitly retryable.
  for (const snapshot of projectStore?.snapshot().handoffSnapshots ?? []) {
    if (snapshot.versionHistory && snapshot.feishuDelivery?.status === 'pending') {
      projectStore.updateHandoffSnapshot(snapshot.versionId, (saved) => ({
        ...saved, feishuDelivery: { status: 'failed', eventId: saved.eventId, reason: 'BASE_SYNC_INTERRUPTED' },
      }), snapshot.eventId);
    }
  }
  const performFlush = async () => {
    if (projectStore) {
      const attempted = new Set();
      for (let event; (event = projectStore.listPendingBaseEvents().find((candidate) => !attempted.has(candidate.eventId)));) {
        attempted.add(event.eventId);
        try {
          const receipt = await sync(event);
          if (event.type === 'snapshot_published') {
            if (!receipt?.recordId || receipt.eventId !== event.eventId || !Number.isFinite(Date.parse(receipt.verifiedAt))) {
              throw new Error('BASE_RECEIPT_NOT_VERIFIED');
            }
            projectStore.updateHandoffSnapshot(event.versionId, (snapshot) => ({
              ...snapshot,
              feishuDelivery: { status: 'synced', eventId: event.eventId, recordId: receipt.recordId,
                verifiedAt: receipt.verifiedAt, recordUrl: safeBaseUrl(receipt.recordUrl) },
            }), event.eventId);
          }
          projectStore.markBaseSynced(event.eventId);
        } catch {
          if (event.type === 'snapshot_published') {
            projectStore.updateHandoffSnapshot(event.versionId, (snapshot) => ({
              ...snapshot, feishuDelivery: { status: 'failed', eventId: event.eventId, reason: 'BASE_SYNC_UNAVAILABLE' },
            }), event.eventId);
          }
          // Durable queue remains on disk for the next business-request retry.
        }
      }
      return;
    }
    for (const [eventId, event] of pendingEvents) {
      try {
        await sync(event);
        pendingEvents.delete(eventId);
      } catch {
        // ponytail: process-memory queue is enough for the local demo; use durable storage before deployment.
      }
    }
  };
  const flushPending = () => {
    flushRequested = true;
    if (!activeFlush) activeFlush = (async () => {
      do {
        flushRequested = false;
        await performFlush();
      } while (flushRequested);
    })().finally(() => { activeFlush = null; });
    return activeFlush;
  };

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');

      if (request.method === 'GET' && url.pathname === '/api/health/live') {
        sendJson(response, 200, { status: 'ok', service: 'opai-backend' });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/health') {
        const capabilities = await health();
        sendJson(response, 200, {
          ...capabilities,
          provider: providerName === 'deepseek' ? 'deepseek' : capabilities.aily?.status === 'ready' ? 'aily' : 'local',
          catalog: { status: 'ready', reason: 'demo_catalog', ...(await Promise.resolve(catalogPlugin.describe())) },
          pendingBaseEvents: projectStore ? projectStore.listPendingBaseEvents().length : pendingEvents.size,
        });
        return;
      }

      const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (request.method === 'GET' && projectMatch) {
        if (!projectStore) {
          sendJson(response, 200, { project: { id: decodeURIComponent(projectMatch[1]), currentVersionId: 'memory' }, scene: store.currentScene });
          return;
        }
        const project = projectStore.getProject();
        if (project.id !== decodeURIComponent(projectMatch[1])) {
          sendJson(response, 404, { error: 'PROJECT_NOT_FOUND' });
          return;
        }
        sendJson(response, 200, {
          project,
          scene: projectStore.getSceneStore(project.currentVersionId).currentScene,
        });
        return;
      }

      const firstPlanMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/first-plan$/);
      if (request.method === 'POST' && firstPlanMatch) {
        const projectId = decodeURIComponent(firstPlanMatch[1]);
        let body;
        try {
          body = await readJson(request);
        } catch (error) {
          sendJson(response, 400, firstPlanEnvelope({
            status: 'failed', stages: pendingFirstPlanStages(), result: null,
            provider: { source: 'none', status: 'not_started', promptVersion: STANDARD_PLAN_PROMPT_VERSION, reason: null },
            error: { code: error.message, retryable: false },
          }, 'not_attempted'));
          return;
        }
        const project = projectStore?.getProject();
        if (!projectStore || project?.id !== projectId) {
          sendJson(response, projectStore ? 404 : 503, firstPlanEnvelope({
            status: 'failed', stages: pendingFirstPlanStages(), result: null,
            provider: { source: 'none', status: 'not_started', promptVersion: STANDARD_PLAN_PROMPT_VERSION, reason: null },
            error: { code: projectStore ? 'PROJECT_NOT_FOUND' : 'PROJECT_STORE_UNAVAILABLE', retryable: false },
          }, 'not_attempted'));
          return;
        }
        if (typeof body.eventId !== 'string' || !body.eventId || body.eventId.length > 128) {
          sendJson(response, 400, firstPlanEnvelope({
            status: 'failed', stages: pendingFirstPlanStages(), result: null,
            provider: { source: 'none', status: 'not_started', promptVersion: STANDARD_PLAN_PROMPT_VERSION, reason: null },
            error: { code: 'EVENT_ID_INVALID', retryable: false },
          }, 'not_attempted'));
          return;
        }
        if (typeof body.expectedVersionId !== 'string' || !body.expectedVersionId || body.expectedVersionId.length > 128) {
          sendJson(response, 400, firstPlanEnvelope({
            status: 'failed', stages: pendingFirstPlanStages(), result: null,
            provider: { source: 'none', status: 'not_started', promptVersion: STANDARD_PLAN_PROMPT_VERSION, reason: null },
            error: { code: 'EXPECTED_VERSION_ID_INVALID', retryable: false },
          }, 'not_attempted'));
          return;
        }

        let prepared;
        try {
          prepared = firstPlanBriefFromSetup(body.setup);
        } catch (error) {
          sendJson(response, 400, firstPlanEnvelope({
            status: 'failed', stages: error.stages ?? pendingFirstPlanStages(), result: null,
            provider: { source: 'none', status: 'not_started', promptVersion: STANDARD_PLAN_PROMPT_VERSION, reason: null },
            error: { code: error.code ?? 'PROJECT_SETUP_INVALID', retryable: false },
          }, 'not_attempted'));
          return;
        }

        const existing = projectStore.findFirstPlanByEventId(body.eventId);
        if (existing) {
          if (existing.setupFingerprint !== prepared.setupFingerprint || existing.versionId !== body.expectedVersionId) {
            sendJson(response, 409, firstPlanEnvelope({
              status: 'failed', stages: pendingFirstPlanStages(), result: null,
              provider: { source: 'none', status: 'not_started', promptVersion: STANDARD_PLAN_PROMPT_VERSION, reason: null },
              error: { code: 'EVENT_ID_CONFLICT', retryable: false },
            }, 'not_attempted'));
            return;
          }
          const syncStatus = projectStore.listPendingBaseEvents().some((event) => event.eventId === body.eventId) ? 'pending' : 'synced';
          sendJson(response, 200, firstPlanEnvelope(existing, syncStatus, true));
          return;
        }
        if (projectStore.findEventById(body.eventId)) {
          sendJson(response, 409, firstPlanEnvelope({
            status: 'failed', stages: pendingFirstPlanStages(), result: null,
            provider: { source: 'none', status: 'not_started', promptVersion: STANDARD_PLAN_PROMPT_VERSION, reason: null },
            error: { code: 'EVENT_ID_CONFLICT', retryable: false },
          }, 'not_attempted'));
          return;
        }
        if (body.expectedVersionId !== project.currentVersionId) {
          sendJson(response, 409, firstPlanEnvelope({
            status: 'failed', stages: pendingFirstPlanStages(), result: null,
            provider: { source: 'none', status: 'not_started', promptVersion: STANDARD_PLAN_PROMPT_VERSION, reason: null },
            error: { code: 'VERSION_CONFLICT', retryable: false },
          }, 'not_attempted'));
          return;
        }

        let record;
        try {
          const generated = await generateFirstPlan({
            scene: projectStore.getSceneStore(body.expectedVersionId).currentScene,
            setup: prepared.setup,
            provider: firstPlanProvider,
          });
          record = projectStore.saveFirstPlan({
            eventId: body.eventId,
            setupFingerprint: generated.setupFingerprint,
            versionId: body.expectedVersionId,
            status: 'ready',
            stages: generated.stages,
            result: {
              projectId,
              versionId: body.expectedVersionId,
              styleId: generated.styleId,
              promptVersion: generated.promptVersion,
              warnings: generated.warnings,
              plan: generated.plan,
            },
            provider: { source: providerName, status: 'ready', promptVersion: generated.promptVersion, reason: null },
            error: null,
          });
        } catch (error) {
          const reason = error.code ?? (/^(AILY|DEEPSEEK)_/.test(error.message ?? '') ? error.message : 'FIRST_PLAN_GENERATION_FAILED');
          record = projectStore.saveFirstPlan({
            eventId: body.eventId,
            setupFingerprint: prepared.setupFingerprint,
            versionId: body.expectedVersionId,
            status: 'degraded',
            stages: error.stages ?? pendingFirstPlanStages(),
            result: null,
            provider: {
              source: firstPlanProvider ? providerName : 'none',
              status: firstPlanProvider ? 'failed' : 'unavailable',
              promptVersion: STANDARD_PLAN_PROMPT_VERSION,
              reason,
            },
            error: { code: reason, retryable: error.retryable !== false },
          });
        }

        projectStore.enqueueBaseEvent({
          eventId: body.eventId,
          type: record.status === 'ready' ? 'first_plan_generated' : 'first_plan_degraded',
          projectId,
          spaceId: 'scene-demo-whole-home',
          versionId: body.expectedVersionId,
          provider: record.provider.source,
          input: 'project_setup',
          payload: { status: record.status, styleId: record.result?.styleId ?? prepared.styleId, promptVersion: STANDARD_PLAN_PROMPT_VERSION },
          result: record.result ? { title: record.result.plan.title } : { error: record.error.code },
          traceId: body.eventId,
        });
        await flushPending();
        const syncStatus = projectStore.listPendingBaseEvents().some((event) => event.eventId === body.eventId) ? 'pending' : 'synced';
        sendJson(response, 200, firstPlanEnvelope(record, syncStatus));
        return;
      }

      const exportMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/export$/);
      if (request.method === 'GET' && exportMatch) {
        const projectId = decodeURIComponent(exportMatch[1]);
        const requestedVersionId = url.searchParams.get('versionId') || null;
        const capability = await verifiedCapability(health);
        if (!projectStore) {
          const history = createVersionHistory(createSceneStore(store.initialScene));
          const consensus = createDemoHouseholdConsensus(history.currentVersionId);
          const targetVersionId = requestedVersionId ?? history.currentVersionId;
          sendJson(response, 200, {
            project: { id: projectId },
            packet: buildHandoffPacket(history, consensus, { projectId, versionId: targetVersionId, capability }),
            review: buildDesignerReview(history, consensus, { projectId, versionId: targetVersionId, capability }),
            reviewDecision: null,
          });
          return;
        }
        const snapshot = projectStore.snapshot();
        if (snapshot.project.id !== projectId) {
          sendJson(response, 404, { error: 'PROJECT_NOT_FOUND' });
          return;
        }
        const saved = requestedVersionId
          ? projectStore.getHandoffSnapshotForVersion(requestedVersionId)
          : projectStore.getLatestHandoffSnapshot();
        if (saved) {
          sendJson(response, 200, payloadFromHandoffSnapshot(saved, { projectId, versionId: requestedVersionId ?? saved.versionId, capability }));
          return;
        }
        const history = compactHistoryFromProjectStore(snapshot);
        const consensus = createDemoHouseholdConsensus(history.currentVersionId);
        const targetVersionId = requestedVersionId ?? history.currentVersionId;
        sendJson(response, 200, {
          project: { id: projectId },
          packet: buildHandoffPacket(history, consensus, { projectId, versionId: targetVersionId, capability }),
          review: buildDesignerReview(history, consensus, { projectId, versionId: targetVersionId, capability }),
          reviewDecision: null,
        });
        return;
      }

      const deliveryMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/feishu-delivery$/);
      if (deliveryMatch && ['GET', 'POST'].includes(request.method)) {
        if (!projectStore || projectStore.getProject().id !== decodeURIComponent(deliveryMatch[1])) {
          sendJson(response, 404, { error: 'PROJECT_NOT_FOUND' }); return;
        }
        const body = request.method === 'POST' ? await readJson(request) : {};
        const versionId = body.versionId ?? url.searchParams.get('versionId') ?? projectStore.currentVersionId;
        let saved = projectStore.getHandoffSnapshotForVersion(versionId);
        if (!saved) {
          sendJson(response, request.method === 'GET' ? 200 : 404, request.method === 'GET'
            ? { feishuDelivery: { status: 'not_submitted' } }
            : { error: 'HANDOFF_SNAPSHOT_NOT_FOUND' });
          return;
        }
        if (request.method === 'POST' && saved.feishuDelivery?.status !== 'synced') {
          saved = projectStore.updateHandoffSnapshot(versionId, (snapshot) => ({
            ...snapshot, feishuDelivery: { status: 'pending', eventId: saved.eventId },
          }), saved.eventId);
          projectStore.enqueueBaseEvent({ eventId: saved.eventId, type: 'snapshot_published',
            input: 'handoff_snapshot', projectId: projectStore.getProject().id, versionId,
            trace: { source: 'handoff_snapshot', versionId }, traceId: saved.eventId, provider: 'local',
            result: handoffActivitySummary(saved, projectStore.getProject().id) }, { retry: true });
          void flushPending().catch(() => {});
        }
        sendJson(response, 200, { feishuDelivery: saved.feishuDelivery ?? { status: 'not_submitted' } });
        return;
      }

      const snapshotMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/snapshot$/);
      if (request.method === 'POST' && snapshotMatch) {
        const projectId = decodeURIComponent(snapshotMatch[1]);
        const body = await readJson(request, SNAPSHOT_JSON_LIMIT);
        if (!projectStore || projectStore.getProject().id !== projectId) {
          sendJson(response, projectStore ? 404 : 503, { error: projectStore ? 'PROJECT_NOT_FOUND' : 'PROJECT_STORE_UNAVAILABLE' });
          return;
        }
        if (typeof body.eventId !== 'string' || !body.eventId || body.eventId.length > 128) {
          sendJson(response, 400, { error: 'EVENT_ID_INVALID' });
          return;
        }
        const history = deserializeVersionHistory(typeof body.versionHistory === 'string' ? body.versionHistory : JSON.stringify(body.versionHistory));
        const consensus = deserializeHouseholdConsensus(typeof body.householdConsensus === 'string' ? body.householdConsensus : JSON.stringify(body.householdConsensus));
        const current = history.versions.find((version) => version.id === history.currentVersionId);
        if (!current) {
          sendJson(response, 400, { error: 'VERSION_NOT_FOUND' });
          return;
        }
        projectStore.publishVersionHistory(history);
        let saved = projectStore.saveHandoffSnapshot({
          eventId: body.eventId,
          versionId: current.id,
          versionHistory: serializeVersionHistory(history),
          householdConsensus: serializeHouseholdConsensus(consensus),
        });
        if (consensusProvider && !saved.consensusSummary) {
          saved = projectStore.updateHandoffSnapshot(current.id, (snapshot) => ({
            ...snapshot,
            consensusSummary: { status: 'pending', provider: 'aily' },
          }), body.eventId);
          const review = buildDesignerReview(history, consensus, { projectId, versionId: current.id });
          void generateConsensusSummary(review, consensusProvider)
            .then((summary) => projectStore.updateHandoffSnapshot(current.id, (snapshot) => ({ ...snapshot, consensusSummary: summary }), body.eventId))
            .catch((error) => projectStore.updateHandoffSnapshot(current.id, (snapshot) => ({
              ...snapshot,
              consensusSummary: {
                status: 'failed',
                provider: 'aily',
                reason: /^AILY_|^CONSENSUS_/.test(error?.message ?? '') ? error.message : 'CONSENSUS_PROVIDER_FAILED',
              },
            }), body.eventId));
        }
        if (saved.feishuDelivery?.status !== 'synced') saved = projectStore.updateHandoffSnapshot(current.id, (snapshot) => ({
          ...snapshot, feishuDelivery: { status: 'pending', eventId: body.eventId },
        }), body.eventId);
        projectStore.enqueueBaseEvent({
          eventId: body.eventId,
          type: 'snapshot_published',
          input: 'handoff_snapshot',
          projectId,
          provider: 'local',
          trace: { source: 'handoff_snapshot', versionId: current.id },
          traceId: body.eventId,
          versionId: current.id,
          result: handoffActivitySummary(saved, projectId),
        });
        void flushPending().catch(() => {});
        sendJson(response, 200, {
          ...payloadFromHandoffSnapshot(saved, { projectId }),
          sync: projectStore.listPendingBaseEvents().some((pending) => pending.eventId === body.eventId) ? 'pending' : 'synced',
        });
        return;
      }

      const confirmMatch = url.pathname.match(/^\/api\/versions\/([^/]+)\/confirm$/);
      if (request.method === 'POST' && confirmMatch) {
        const versionId = decodeURIComponent(confirmMatch[1]);
        const body = await readJson(request, SNAPSHOT_JSON_LIMIT);
        if (!projectStore) {
          sendJson(response, 503, { error: 'PROJECT_STORE_UNAVAILABLE' });
          return;
        }
        if (body.eventId !== undefined && (typeof body.eventId !== 'string' || !body.eventId || body.eventId.length > 128)) {
          sendJson(response, 400, { error: 'EVENT_ID_INVALID' });
          return;
        }
        const eventId = body.eventId ?? `evt-confirm-${id()}`;
        const version = projectStore.confirmVersion({ versionId, eventId, actor: typeof body.actor === 'string' ? body.actor.slice(0, 80) : 'customer' });
        const snapshot = projectStore.getHandoffSnapshotForVersion(versionId);
        if (snapshot) {
          projectStore.updateHandoffSnapshot(versionId, (saved) => {
            let history = deserializeVersionHistory(saved.versionHistory);
            if (history.versions.find((candidate) => candidate.id === versionId)?.status !== 'customer_confirmed') {
              history = confirmSceneVersion(history, versionId);
            }
            return { ...saved, versionHistory: serializeVersionHistory(history), confirmedAt: version.confirmation?.confirmedAt ?? new Date().toISOString() };
          });
        }
        projectStore.enqueueBaseEvent({
          eventId,
          type: 'customer_confirmed',
          input: 'customer_confirmed',
          projectId: projectStore.getProject().id,
          provider: 'local',
          trace: { source: 'customer_confirmed', versionId, actor: body.actor ?? 'customer' },
          traceId: eventId,
          versionId,
        });
        await flushPending();
        sendJson(response, 200, {
          project: projectStore.getProject(),
          version,
          ...(projectStore.getHandoffSnapshotForVersion(versionId)
            ? payloadFromHandoffSnapshot(projectStore.getHandoffSnapshotForVersion(versionId), { projectId: projectStore.getProject().id, versionId })
            : {}),
          sync: projectStore.listPendingBaseEvents().some((pending) => pending.eventId === eventId) ? 'pending' : 'synced',
        });
        return;
      }

      const reviewMatch = url.pathname.match(/^\/api\/versions\/([^/]+)\/review$/);
      if (request.method === 'POST' && reviewMatch) {
        const versionId = decodeURIComponent(reviewMatch[1]);
        const body = await readJson(request);
        if (!projectStore) {
          sendJson(response, 503, { error: 'PROJECT_STORE_UNAVAILABLE' });
          return;
        }
        const action = body.action ?? (body.decision === 'approved' ? 'approve' : body.decision === 'returned' ? 'return' : null);
        if (!REVIEW_ACTIONS.has(action)) {
          sendJson(response, 400, { error: 'REVIEW_ACTION_INVALID' });
          return;
        }
        if (body.eventId !== undefined && (typeof body.eventId !== 'string' || !body.eventId || body.eventId.length > 128)) {
          sendJson(response, 400, { error: 'EVENT_ID_INVALID' });
          return;
        }
        const eventId = body.eventId ?? `evt-review-${id()}`;
        const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : typeof body.notes === 'string' ? body.notes.slice(0, 1000) : '';
        const version = projectStore.reviewVersion({ versionId, eventId, action, note });
        const snapshot = projectStore.getHandoffSnapshotForVersion(versionId);
        if (snapshot && !(snapshot.review?.status === version.status
          && snapshot.review?.action === action
          && snapshot.review?.note === note
          && snapshot.review?.reviewedAt === version.review?.reviewedAt)) {
          projectStore.updateHandoffSnapshot(versionId, (saved) => ({
            ...saved,
            versionHistory: serializeVersionHistory(reviewSceneVersion(
              deserializeVersionHistory(saved.versionHistory),
              versionId,
              { action, note, now: version.review?.reviewedAt ?? new Date().toISOString() },
            )),
            review: {
              action,
              decision: action === 'approve' ? 'approved' : 'returned',
              note,
              status: version.status,
              reviewedAt: version.review?.reviewedAt ?? new Date().toISOString(),
              source: 'demo',
            },
          }));
        }
        projectStore.enqueueBaseEvent({
          eventId,
          type: version.status,
          input: version.status,
          projectId: projectStore.getProject().id,
          provider: 'local',
          trace: { source: version.status, versionId, action, note },
          traceId: eventId,
          versionId,
        });
        await flushPending();
        sendJson(response, 200, {
          project: projectStore.getProject(),
          version,
          review: version.review,
          reviewDecision: projectStore.getHandoffSnapshotForVersion(versionId)?.review ?? null,
          handoffUrl: action === 'approve' ? `/handoff/${versionId}` : null,
          sync: projectStore.listPendingBaseEvents().some((pending) => pending.eventId === eventId) ? 'pending' : 'synced',
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/catalog/components') {
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
        const items = await Promise.resolve(catalogPlugin.search({
          query: url.searchParams.get('q') ?? undefined,
          category: url.searchParams.get('category') ?? undefined,
          kind: url.searchParams.get('kind') ?? undefined,
          appliesTo: url.searchParams.get('appliesTo') ?? undefined,
          ...(limit === undefined ? {} : { limit }),
        }));
        sendJson(response, 200, { catalog: await Promise.resolve(catalogPlugin.describe()), items });
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/catalog/components/')) {
        const itemId = decodeURIComponent(url.pathname.slice('/api/catalog/components/'.length));
        const item = await Promise.resolve(catalogPlugin.get(itemId));
        sendJson(response, item ? 200 : 404, item ? { item } : { error: 'CATALOG_ITEM_NOT_FOUND' });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/agent/turn') {
        const body = await readJson(request);
        if (typeof body.input !== 'string' || !body.input.trim() || body.input.length > 4000) {
          sendJson(response, 400, { error: 'INPUT_INVALID' });
          return;
        }
        if (
          body.selectedObjectId !== undefined && body.selectedObjectId !== null &&
          (typeof body.selectedObjectId !== 'string' || body.selectedObjectId.length > 128)
        ) {
          sendJson(response, 400, { error: 'SELECTED_OBJECT_INVALID' });
          return;
        }
        for (const key of ['eventId', 'projectId', 'spaceId', 'versionId', 'expectedVersionId']) {
          if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > 128)) {
            sendJson(response, 400, { error: `${key.toUpperCase()}_INVALID` });
            return;
          }
        }

        const eventId = typeof body.eventId === 'string' && body.eventId ? body.eventId : `evt-n1-${id()}`;
        const project = projectStore?.getProject();
        if (project && body.projectId && body.projectId !== project.id) {
          sendJson(response, 404, { error: 'PROJECT_NOT_FOUND' });
          return;
        }
        if (body.scene !== undefined && typeof body.scene !== 'string') {
          sendJson(response, 400, { error: 'SCENE_INVALID' });
          return;
        }
        if (body.versionHistory !== undefined && typeof body.versionHistory !== 'string') {
          sendJson(response, 400, { error: 'VERSION_HISTORY_INVALID' });
          return;
        }
        let designBrief;
        try {
          designBrief = normalizeDesignBrief(body.designBrief ?? projectStore?.getDesignBrief());
        } catch {
          sendJson(response, 400, { error: 'DESIGN_BRIEF_INVALID' });
          return;
        }
        const clientSceneMode = typeof body.scene === 'string';
        if (clientSceneMode) {
          const clientStore = createSceneStore(deserializeScene(body.scene));
          const clientHistory = body.versionHistory ? deserializeVersionHistory(body.versionHistory) : null;
          const result = await runAgentTurn({
            store: clientStore,
            input: body.input,
            selectedObjectId: body.selectedObjectId ?? null,
            provider: agentProvider,
            catalogPlugin,
            versionHistory: clientHistory,
            designBrief,
            activeRoomId: body.spaceId ?? null,
            timeoutMs: AGENT_PROVIDER_TIMEOUT_MS,
          });
          if (projectStore) projectStore.saveDesignBrief(result.trace.designBrief);
          const commands = result.store.commands.slice(clientStore.cursor);
          const event = {
            eventId,
            type: 'agent_turn',
            input: body.input,
            projectId: body.projectId ?? project?.id,
            provider: result.trace.source === 'provider' ? providerName : 'local',
            selectedObjectId: body.selectedObjectId ?? null,
            spaceId: body.spaceId,
            trace: result.trace,
            designBrief: result.trace.designBrief,
            traceId: eventId,
            versionId: body.versionId ?? clientHistory?.currentVersionId ?? 'client-scene',
          };
          if (projectStore) projectStore.enqueueBaseEvent(event);
          else pendingEvents.set(eventId, event);
          await flushPending();
          sendJson(response, 200, {
            scene: result.store.currentScene,
            commands,
            trace: result.trace,
            sync: projectStore
              ? projectStore.listPendingBaseEvents().some((pending) => pending.eventId === eventId) ? 'pending' : 'synced'
              : pendingEvents.has(eventId) ? 'pending' : 'synced',
          });
          return;
        }
        const existingEvent = projectStore?.findEventById(eventId);
        if (existingEvent && (
          existingEvent.input !== body.input ||
          (existingEvent.selectedObjectId ?? null) !== (body.selectedObjectId ?? null)
        )) {
          sendJson(response, 409, { error: 'EVENT_ID_CONFLICT' });
          return;
        }
        const existingVersion = projectStore?.findVersionByEventId(eventId);
        if (existingVersion) {
          sendJson(response, 200, {
            scene: existingVersion.scene,
            project: projectStore.getProject(),
            version: existingVersion,
            trace: { source: 'idempotent_replay', eventId },
            sync: projectStore.listPendingBaseEvents().some((pending) => pending.eventId === eventId) ? 'pending' : 'synced',
          });
          return;
        }

        if (body.expectedVersionId && body.versionId && body.expectedVersionId !== body.versionId) {
          sendJson(response, 400, { error: 'VERSION_ID_MISMATCH' });
          return;
        }
        const expectedVersionId = body.expectedVersionId ?? body.versionId;
        const baseVersionId = projectStore ? expectedVersionId ?? projectStore.currentVersionId : null;
        if (projectStore && baseVersionId !== projectStore.currentVersionId) {
          sendJson(response, 409, { error: 'VERSION_CONFLICT' });
          return;
        }

        const activeStore = projectStore ? projectStore.getSceneStore(baseVersionId) : store;
        const result = await runAgentTurn({
          store: activeStore,
          input: body.input,
          selectedObjectId: body.selectedObjectId ?? null,
          provider: agentProvider,
          catalogPlugin,
          designBrief,
          activeRoomId: body.spaceId ?? null,
          timeoutMs: AGENT_PROVIDER_TIMEOUT_MS,
        });
        if (projectStore) projectStore.saveDesignBrief(result.trace.designBrief);
        const event = {
          eventId,
          input: body.input,
          projectId: body.projectId ?? project?.id,
          provider: result.trace.source === 'provider' ? providerName : 'local',
          selectedObjectId: body.selectedObjectId ?? null,
          spaceId: body.spaceId,
          trace: result.trace,
          designBrief: result.trace.designBrief,
          traceId: eventId,
          versionId: body.versionId,
        };
        let version = null;
        if (projectStore) {
          version = projectStore.recordVersion({
            expectedVersionId: baseVersionId,
            store: result.store,
            event,
          });
          event.versionId = version.id;
          projectStore.enqueueBaseEvent(event);
        } else {
          store = result.store;
          pendingEvents.set(eventId, event);
        }
        await flushPending();

        sendJson(response, 200, {
          scene: result.store.currentScene,
          ...(projectStore ? { project: projectStore.getProject(), version } : {}),
          trace: result.trace,
          sync: projectStore
            ? projectStore.listPendingBaseEvents().some((pending) => pending.eventId === eventId) ? 'pending' : 'synced'
            : pendingEvents.has(eventId) ? 'pending' : 'synced',
        });
        return;
      }

      sendJson(response, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const clientError = ['REQUEST_TOO_LARGE', 'REQUEST_JSON_INVALID'].includes(error?.message) || /^CATALOG_/.test(error?.message ?? '');
      if (error?.message === 'EVENT_ID_CONFLICT') {
        sendJson(response, 409, { error: 'EVENT_ID_CONFLICT' });
        return;
      }
      if (error?.message === 'VERSION_CONFLICT') {
        sendJson(response, 409, { error: 'VERSION_CONFLICT' });
        return;
      }
      if (['VERSION_NOT_FOUND', 'VERSION_NOT_CURRENT', 'VERSION_NOT_CONFIRMED', 'EVENT_ID_INVALID', 'REVIEW_ACTION_INVALID', 'HANDOFF_SNAPSHOT_NOT_FOUND', 'VERSION_HISTORY_INVALID'].includes(error?.message)) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      sendJson(response, clientError ? 400 : 500, { error: clientError ? error.message : 'INTERNAL_ERROR' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8791);
  const projectStore = createPersistentProjectStore({
    filePath: process.env.PROJECT_STORE_PATH ?? DEFAULT_PROJECT_STORE_PATH,
  });
  createAppServer({ projectStore }).listen(port, '127.0.0.1', () => {
    console.log(`OP backend listening on http://127.0.0.1:${port}`);
  });
}
