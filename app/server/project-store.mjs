import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import { createDemoScene } from '../src/domain/demo-scene.js';
import {
  createSceneStore,
  deepFreeze,
  deserializeScene,
  dispatchSceneCommand,
  serializeScene,
} from '../src/domain/scene.js';

const INITIAL_VERSION_ID = 'version-demo-initial';
const VERSION_STATUSES = new Set(['drafting', 'impact_review', 'customer_confirmed', 'changed_after_confirm', 'designer_verified', 'designer_returned']);

const clone = (value) => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();
const shortId = (id) => String(id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);

function makeInitialState({ projectId, scene, now }) {
  return {
    schemaVersion: 1,
    project: {
      id: projectId,
      name: '欧派 AI 家装共识 Demo',
      currentVersionId: INITIAL_VERSION_ID,
      confirmedVersionId: null,
      createdAt: now,
      updatedAt: now,
    },
    versions: [{
      id: INITIAL_VERSION_ID,
      parentVersionId: null,
      createdAt: now,
      source: 'demo',
      status: 'drafting',
      scene,
      commands: [],
      cursor: 0,
    }],
    commandLog: [],
    pendingBaseEvents: [],
    syncedBaseEventIds: [],
    handoffSnapshots: [],
  };
}

function normalizeState(value, fallback) {
  if (
    value?.schemaVersion !== 1 ||
    value?.project?.id !== fallback.project.id ||
    typeof value?.project?.currentVersionId !== 'string' ||
    !Array.isArray(value?.versions)
  ) {
    throw new Error('PROJECT_STORE_INVALID');
  }
  const versionIds = new Set(value.versions.map((version) => version?.id));
  if (
    versionIds.size !== value.versions.length ||
    !versionIds.has(INITIAL_VERSION_ID) ||
    !versionIds.has(value.project.currentVersionId)
  ) throw new Error('PROJECT_STORE_INVALID');
  const initialScene = value.versions.find((version) => version.id === INITIAL_VERSION_ID)?.scene;
  for (const version of value.versions) {
    deserializeScene(serializeScene(version.scene));
    if (
      !Array.isArray(version.commands) ||
      !Number.isInteger(version.cursor) ||
      version.cursor < 0 ||
      version.cursor > version.commands.length ||
      (version.parentVersionId !== null && !versionIds.has(version.parentVersionId)) ||
      (version.status !== undefined && !VERSION_STATUSES.has(version.status))
    ) throw new Error('PROJECT_STORE_INVALID');
    let replay = createSceneStore(initialScene);
    for (const command of version.commands.slice(0, version.cursor)) replay = dispatchSceneCommand(replay, command);
    if (serializeScene(replay.currentScene) !== serializeScene(version.scene)) throw new Error('VERSION_REPLAY_MISMATCH');
  }
  const commandLog = Array.isArray(value.commandLog) ? value.commandLog : [];
  const eventIds = commandLog.map((event) => event?.eventId);
  if (
    eventIds.some((eventId) => typeof eventId !== 'string' || !eventId) ||
    new Set(eventIds).size !== eventIds.length ||
    commandLog.some((event) => !versionIds.has(event.versionId))
  ) throw new Error('PROJECT_STORE_INVALID');
  return {
    ...fallback,
    ...value,
    commandLog,
    pendingBaseEvents: Array.isArray(value.pendingBaseEvents) ? value.pendingBaseEvents : [],
    syncedBaseEventIds: Array.isArray(value.syncedBaseEventIds) ? value.syncedBaseEventIds : [],
    handoffSnapshots: Array.isArray(value.handoffSnapshots) ? value.handoffSnapshots : [],
  };
}

export function createPersistentProjectStore({
  filePath,
  projectId = 'project-demo',
  initialScene = createDemoScene(),
  id = randomUUID,
  now = nowIso,
} = {}) {
  if (!filePath) throw new Error('PROJECT_STORE_PATH_REQUIRED');
  mkdirSync(dirname(filePath), { recursive: true });

  const fallback = makeInitialState({ projectId, scene: deserializeScene(serializeScene(initialScene)), now: now() });
  let state;
  if (existsSync(filePath)) {
    try {
      state = normalizeState(JSON.parse(readFileSync(filePath, 'utf8')), fallback);
    } catch {
      renameSync(filePath, `${filePath}.corrupt-${Date.now()}`);
      state = fallback;
    }
  } else {
    state = fallback;
  }

  const save = () => {
    state.project.updatedAt = now();
    const tmp = `${filePath}.tmp-${process.pid}-${shortId(id())}`;
    try {
      writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      renameSync(tmp, filePath);
    } catch (error) {
      rmSync(tmp, { force: true });
      throw error;
    }
  };

  save();

  const findVersion = (versionId = state.project.currentVersionId) => {
    const version = state.versions.find((candidate) => candidate.id === versionId);
    if (!version) throw new Error('VERSION_NOT_FOUND');
    return version;
  };

  const sceneStoreFor = (versionId) => {
    const version = findVersion(versionId);
    let store = createSceneStore(findVersion(INITIAL_VERSION_ID).scene);
    for (const command of version.commands.slice(0, version.cursor)) {
      store = dispatchSceneCommand(store, command);
    }
    if (serializeScene(store.currentScene) !== serializeScene(version.scene)) throw new Error('VERSION_REPLAY_MISMATCH');
    return deepFreeze({ ...store, commands: clone(version.commands), cursor: version.cursor });
  };

  const publishVersionHistory = (history) => {
    if (!history?.versions?.length || typeof history.currentVersionId !== 'string') throw new Error('VERSION_HISTORY_INVALID');
    const incoming = new Map(history.versions.map((version) => [version.id, version]));
    const persistedInitial = findVersion(INITIAL_VERSION_ID);
    if (serializeScene(history.initialScene) !== serializeScene(persistedInitial.scene)) {
      const canMigratePristineDemo = history.initialScene?.id === persistedInitial.scene?.id
        && state.versions.length === 1
        && state.project.currentVersionId === INITIAL_VERSION_ID
        && state.project.confirmedVersionId === null
        && !state.handoffSnapshots.some((snapshot) => snapshot.versionHistory);
      if (!canMigratePristineDemo) throw new Error('VERSION_CONFLICT');
      persistedInitial.scene = clone(history.initialScene);
    }
    if (state.versions.some((version) => incoming.has(version.id) && serializeScene(version.scene) !== serializeScene(incoming.get(version.id).scene))) {
      throw new Error('VERSION_CONFLICT');
    }

    const mergedVersions = [
      ...state.versions,
      ...history.versions.filter((version) => !state.versions.some((existing) => existing.id === version.id)),
    ];

    state = normalizeState({
      ...state,
      project: {
        ...state.project,
        currentVersionId: history.currentVersionId,
        confirmedVersionId: history.confirmedVersionId ?? null,
      },
      versions: clone(mergedVersions),
    }, fallback);
    save();
    return clone(findVersion());
  };

  const recordVersion = ({ expectedVersionId, store, event = {} }) => {
    if (expectedVersionId && expectedVersionId !== state.project.currentVersionId) throw new Error('VERSION_CONFLICT');
    if (event.eventId) {
      const existing = state.commandLog.find((entry) => entry.eventId === event.eventId);
      if (existing) return findVersion(existing.versionId);
    }
    const current = findVersion();
    if (serializeScene(store.currentScene) === serializeScene(current.scene)) {
      if (event.eventId) state.commandLog.push({ ...clone(event), versionId: current.id });
      save();
      return current;
    }
    const version = {
      id: `version-${shortId(id())}`,
      parentVersionId: state.project.currentVersionId,
      createdAt: now(),
      source: event.provider ?? 'local',
      status: state.project.confirmedVersionId ? 'changed_after_confirm' : 'impact_review',
      scene: store.currentScene,
      commands: clone(store.commands),
      cursor: store.cursor,
    };
    state.versions.push(version);
    state.project.currentVersionId = version.id;
    if (event.eventId) state.commandLog.push({ ...clone(event), versionId: version.id });
    save();
    return version;
  };

  const enqueueBaseEvent = (event) => {
    if (!event?.eventId) throw new Error('BASE_EVENT_INVALID');
    if (!state.pendingBaseEvents.some((candidate) => candidate.eventId === event.eventId) &&
        !state.syncedBaseEventIds.includes(event.eventId)) {
      state.pendingBaseEvents.push(clone(event));
      save();
    }
  };

  const markBaseSynced = (eventId) => {
    state.pendingBaseEvents = state.pendingBaseEvents.filter((event) => event.eventId !== eventId);
    if (!state.syncedBaseEventIds.includes(eventId)) state.syncedBaseEventIds.push(eventId);
    save();
  };

  const saveHandoffSnapshot = ({ eventId, versionId, versionHistory, householdConsensus }) => {
    if (!eventId || !versionId || typeof versionHistory !== 'string' || typeof householdConsensus !== 'string') {
      throw new Error('HANDOFF_SNAPSHOT_INVALID');
    }
    const existing = state.handoffSnapshots.find((snapshot) => snapshot.eventId === eventId);
    if (existing && (existing.versionId !== versionId || existing.versionHistory !== versionHistory || existing.householdConsensus !== householdConsensus)) {
      throw new Error('EVENT_ID_CONFLICT');
    }
    if (existing) return clone(existing);
    const snapshot = { eventId, versionId, versionHistory, householdConsensus, createdAt: now(), review: null };
    state.handoffSnapshots.push(snapshot);
    save();
    return clone(snapshot);
  };

  const confirmVersion = ({ versionId = state.project.currentVersionId, eventId, actor = 'customer' }) => {
    if (!eventId) throw new Error('EVENT_ID_INVALID');
    const version = findVersion(versionId);
    if (version.id !== state.project.currentVersionId) throw new Error('VERSION_NOT_CURRENT');
    const existing = state.handoffSnapshots.find((snapshot) => snapshot.eventId === eventId);
    if (existing && (existing.versionId !== versionId || existing.type !== 'customer_confirmed')) throw new Error('EVENT_ID_CONFLICT');
    if (!existing) {
      version.status = 'customer_confirmed';
      version.confirmation = { actor, confirmedAt: now(), source: 'demo' };
      state.project.confirmedVersionId = versionId;
      state.handoffSnapshots.push({ eventId, type: 'customer_confirmed', versionId, actor, createdAt: now() });
      save();
    }
    return clone(version);
  };

  const reviewVersion = ({ versionId, eventId, action, note = '', actor = 'designer' }) => {
    if (!eventId) throw new Error('EVENT_ID_INVALID');
    if (!['approve', 'return'].includes(action)) throw new Error('REVIEW_ACTION_INVALID');
    const version = findVersion(versionId);
    const status = action === 'approve' ? 'designer_verified' : 'designer_returned';
    const existing = state.handoffSnapshots.find((snapshot) => snapshot.eventId === eventId);
    if (existing && (existing.versionId !== versionId || existing.type !== status || existing.note !== note)) throw new Error('EVENT_ID_CONFLICT');
    if (!existing) {
      version.status = status;
      version.review = { action, actor, note, reviewedAt: now(), source: 'demo' };
      state.handoffSnapshots.push({ eventId, type: status, versionId, action, actor, note, createdAt: now() });
      save();
    }
    return clone(version);
  };

  const updateHandoffSnapshot = (versionId, updater) => {
    const reverseIndex = [...state.handoffSnapshots].reverse().findIndex((snapshot) => snapshot.versionId === versionId && snapshot.versionHistory);
    if (reverseIndex < 0) throw new Error('HANDOFF_SNAPSHOT_NOT_FOUND');
    const index = state.handoffSnapshots.length - 1 - reverseIndex;
    state.handoffSnapshots[index] = updater(clone(state.handoffSnapshots[index]));
    save();
    return clone(state.handoffSnapshots[index]);
  };

  return {
    get currentVersionId() { return state.project.currentVersionId; },
    findEventById: (eventId) => {
      const entry = state.commandLog.find((candidate) => candidate.eventId === eventId);
      return entry ? clone(entry) : null;
    },
    findVersionByEventId: (eventId) => {
      const entry = state.commandLog.find((candidate) => candidate.eventId === eventId);
      return entry ? clone(findVersion(entry.versionId)) : null;
    },
    getProject: () => clone({ ...state.project, versions: state.versions.map(({ scene, commands, ...version }) => version) }),
    getSceneStore: sceneStoreFor,
    getVersion: (versionId) => clone(findVersion(versionId)),
    listPendingBaseEvents: () => clone(state.pendingBaseEvents),
    publishVersionHistory,
    recordVersion,
    confirmVersion,
    reviewVersion,
    enqueueBaseEvent,
    markBaseSynced,
    saveHandoffSnapshot,
    updateHandoffSnapshot,
    getLatestHandoffSnapshot: () => clone([...state.handoffSnapshots].reverse().find((snapshot) => snapshot.versionHistory) ?? null),
    getHandoffSnapshotForVersion: (versionId) => clone([...state.handoffSnapshots].reverse().find((snapshot) => snapshot.versionId === versionId && snapshot.versionHistory) ?? null),
    snapshot: () => clone(state),
  };
}
