import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import { runAgentTurn } from '../src/agent/harness.js';
import { demoCatalogPlugin } from '../src/catalog/demo-catalog.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore } from '../src/domain/scene.js';
import { callAily, getFeishuHealth, syncActivity } from './feishu.mjs';

const JSON_LIMIT = 128 * 1024;

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > JSON_LIMIT) throw new Error('REQUEST_TOO_LARGE');
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new Error('REQUEST_JSON_INVALID');
  }
}

export function createAppServer({
  initialStore = createSceneStore(createDemoScene()),
  catalogPlugin = demoCatalogPlugin,
  health = getFeishuHealth,
  sync = syncActivity,
  agentProvider = process.env.AILY_AGENT_ID || process.env.AILY_APP_ID
    ? (context) => callAily(context, {
        agentId: process.env.AILY_AGENT_ID,
        appId: process.env.AILY_APP_ID,
        timeoutMs: 35_000,
        maxAttempts: 1,
      })
    : null,
  id = randomUUID,
} = {}) {
  let store = initialStore;
  const pendingEvents = new Map();

  const flushPending = async () => {
    for (const [eventId, event] of pendingEvents) {
      try {
        await sync(event);
        pendingEvents.delete(eventId);
      } catch {
        // ponytail: process-memory queue is enough for the local demo; use durable storage before deployment.
      }
    }
  };

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');

      if (request.method === 'GET' && url.pathname === '/api/health') {
        const capabilities = await health();
        sendJson(response, 200, {
          ...capabilities,
          catalog: { status: 'ready', reason: 'demo_catalog', ...(await Promise.resolve(catalogPlugin.describe())) },
          pendingBaseEvents: pendingEvents.size,
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
        for (const key of ['eventId', 'projectId', 'spaceId', 'versionId']) {
          if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > 128)) {
            sendJson(response, 400, { error: `${key.toUpperCase()}_INVALID` });
            return;
          }
        }

        const result = await runAgentTurn({
          store,
          input: body.input,
          selectedObjectId: body.selectedObjectId ?? null,
          provider: agentProvider,
          catalogPlugin,
          timeoutMs: 40_000,
        });
        store = result.store;

        const eventId = typeof body.eventId === 'string' && body.eventId ? body.eventId : `evt-n1-${id()}`;
        const event = {
          eventId,
          input: body.input,
          projectId: body.projectId,
          provider: result.trace.source === 'provider' ? 'aily' : 'local',
          spaceId: body.spaceId,
          trace: result.trace,
          traceId: eventId,
          versionId: body.versionId,
        };
        pendingEvents.set(eventId, event);
        await flushPending();

        sendJson(response, 200, {
          scene: store.currentScene,
          trace: result.trace,
          sync: pendingEvents.has(eventId) ? 'pending' : 'synced',
        });
        return;
      }

      sendJson(response, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const clientError = ['REQUEST_TOO_LARGE', 'REQUEST_JSON_INVALID'].includes(error?.message) || /^CATALOG_/.test(error?.message ?? '');
      sendJson(response, clientError ? 400 : 500, { error: clientError ? error.message : 'INTERNAL_ERROR' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8787);
  createAppServer().listen(port, '127.0.0.1', () => {
    console.log(`OP backend listening on http://127.0.0.1:${port}`);
  });
}
