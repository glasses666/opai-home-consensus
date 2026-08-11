import { compareDesignImpact } from './design-impact.js';
import { createSceneStore, deepFreeze, replaySceneCommands, serializeScene } from './scene.js';

const INITIAL_VERSION_ID = 'version-demo-initial';
const VERSION_STATUSES = new Set([
  'drafting',
  'impact_review',
  'customer_confirmed',
  'changed_after_confirm',
  'designer_verified',
  'designer_returned',
]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const byId = (records) => new Map((records ?? []).map((record) => [record.id, record]));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const nowIso = () => new Date().toISOString();

const hash = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let result = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
};

const timestamp = (value) => typeof value === 'function' ? value() : value;
const versionById = (history, versionId = history.currentVersionId) => {
  const version = history.versions.find((candidate) => candidate.id === versionId);
  if (!version) throw new Error('VERSION_NOT_FOUND');
  return version;
};

const versionSummary = (scene, commands, cursor) => {
  const snapshot = serializeScene(scene);
  return {
    snapshotHash: hash(snapshot),
    snapshotBytes: new TextEncoder().encode(snapshot).length,
    commandHash: hash(commands.slice(0, cursor)),
    commandCount: cursor,
    objectCount: scene.objects.length,
  };
};

const makeVersion = ({ id, label, parentVersionId, source, status, scene, commands, cursor, createdAt }) => deepFreeze({
  id,
  label,
  parentVersionId,
  createdAt,
  source,
  status,
  scene,
  commands: clone(commands.slice(0, cursor)),
  cursor,
  summary: versionSummary(scene, commands, cursor),
});

const replayVersionScene = (initialScene, version) => {
  const scene = replaySceneCommands(initialScene, version.commands.slice(0, version.cursor));
  if (serializeScene(scene) !== serializeScene(version.scene)) throw new Error('VERSION_REPLAY_MISMATCH');
  return scene;
};

const freezeHistory = (history) => deepFreeze({
  ...history,
  versions: history.versions.map((version) => deepFreeze(version)),
});

export function createVersionHistory(initialStore, { id = 'history-project-demo', now = nowIso } = {}) {
  const version = makeVersion({
    id: INITIAL_VERSION_ID,
    label: 'V1',
    parentVersionId: null,
    createdAt: timestamp(now),
    source: 'demo',
    status: 'drafting',
    scene: initialStore.initialScene,
    commands: [],
    cursor: 0,
  });
  return freezeHistory({
    schemaVersion: 1,
    id,
    initialScene: initialStore.initialScene,
    currentVersionId: version.id,
    confirmedVersionId: null,
    versions: [version],
  });
}

export function saveSceneVersion(history, store, { source = 'manual', id, now = nowIso } = {}) {
  const current = versionById(history);
  if (serializeScene(current.scene) === serializeScene(store.currentScene)) return history;
  const nextNumber = history.versions.length + 1;
  const version = makeVersion({
    id: id ?? `version-${hash(`${history.id}:${current.id}:${nextNumber}:${serializeScene(store.currentScene)}`)}`,
    label: `V${nextNumber}`,
    parentVersionId: current.id,
    createdAt: timestamp(now),
    source,
    status: history.confirmedVersionId ? 'changed_after_confirm' : 'impact_review',
    scene: store.currentScene,
    commands: store.commands,
    cursor: store.cursor,
  });
  if (history.versions.some((candidate) => candidate.id === version.id)) throw new Error('VERSION_ID_DUPLICATE');
  return freezeHistory({ ...history, currentVersionId: version.id, versions: [...history.versions, version] });
}

export function confirmSceneVersion(history, versionId = history.currentVersionId, { actor = 'customer', now = nowIso } = {}) {
  if (versionId !== history.currentVersionId) throw new Error('VERSION_NOT_CURRENT');
  versionById(history, versionId);
  const versions = history.versions.map((version) => version.id === versionId
    ? deepFreeze({ ...version, status: 'customer_confirmed', confirmation: { actor, confirmedAt: timestamp(now), source: 'demo' } })
    : version);
  return freezeHistory({ ...history, confirmedVersionId: versionId, versions });
}

export function reviewSceneVersion(history, versionId = history.currentVersionId, { action, actor = 'designer', note = '', now = nowIso } = {}) {
  if (!['approve', 'return'].includes(action)) throw new Error('REVIEW_ACTION_INVALID');
  versionById(history, versionId);
  const status = action === 'approve' ? 'designer_verified' : 'designer_returned';
  const versions = history.versions.map((version) => version.id === versionId
    ? deepFreeze({ ...version, status, review: { action, actor, note, reviewedAt: timestamp(now), source: 'demo' } })
    : version);
  return freezeHistory({ ...history, currentVersionId: versionId, versions });
}

export function sceneStoreForVersion(history, versionId = history.currentVersionId) {
  const version = versionById(history, versionId);
  const scene = replayVersionScene(history.initialScene, version);
  return deepFreeze({
    ...createSceneStore(history.initialScene),
    currentScene: scene,
    commands: clone(version.commands),
    cursor: version.cursor,
  });
}

export function restoreSceneVersion(historyOrStore, versionOrId, options = {}) {
  if (!historyOrStore.versions) {
    const version = versionOrId;
    return deepFreeze({
      initialScene: historyOrStore.initialScene,
      currentScene: version.scene,
      commands: clone(historyOrStore.commands),
      cursor: version.cursor,
    });
  }
  const history = historyOrStore;
  const versionId = typeof versionOrId === 'string' ? versionOrId : versionOrId.id;
  const store = sceneStoreForVersion(history, versionId);
  return {
    history: saveSceneVersion(history, store, { ...options, source: options.source ?? 'revert' }),
    store,
  };
}

export function buildSceneVersions(store) {
  let history = createVersionHistory(createSceneStore(store.initialScene), { now: '2026-01-01T00:00:00.000Z' });
  for (let cursor = 1; cursor <= store.commands.length; cursor += 1) {
    history = saveSceneVersion(history, {
      initialScene: store.initialScene,
      currentScene: replaySceneCommands(store.initialScene, store.commands.slice(0, cursor)),
      commands: store.commands,
      cursor,
    }, { id: `version-v${cursor + 1}`, now: '2026-01-01T00:00:00.000Z', source: store.commands[cursor - 1]?.provider ?? 'manual' });
  }
  return history.versions;
}

export function versionLifecycle(version, currentVersionId, confirmedVersionId) {
  if (version.status === 'customer_confirmed' || version.id === confirmedVersionId) return 'customer_confirmed';
  if (version.status === 'changed_after_confirm' || (confirmedVersionId && version.id === currentVersionId)) return 'changed_after_confirm';
  return version.id === currentVersionId ? 'draft_current' : 'draft_previous';
}

const diffValue = (kind, objectId, before, after) => ({ kind, objectId, before, after });
const surfaceDiffValue = (kind, surfaceId, before, after) => ({ kind, surfaceId, before, after });

export function compareSceneVersions(beforeVersion, afterVersion) {
  const beforeObjects = byId(beforeVersion.scene.objects);
  const afterObjects = byId(afterVersion.scene.objects);
  const objectDiffs = [];
  const beforeSurfaces = byId(beforeVersion.scene.surfaces);
  const afterSurfaces = byId(afterVersion.scene.surfaces);
  const surfaceDiffs = [];

  for (const [id, before] of beforeObjects) {
    const after = afterObjects.get(id);
    if (!after) objectDiffs.push(diffValue('deleted', id, before, null));
    else {
      if (!same(before.transform, after.transform)) objectDiffs.push(diffValue('transform', id, before.transform, after.transform));
      if (!same(before.dimensions, after.dimensions)) objectDiffs.push(diffValue('dimensions', id, before.dimensions, after.dimensions));
      if (before.materialId !== after.materialId) objectDiffs.push(diffValue('material', id, before.materialId, after.materialId));
      if (!same(before.model3D, after.model3D)) objectDiffs.push(diffValue('model', id, before.model3D, after.model3D));
      if (!same(before.placement, after.placement)) objectDiffs.push(diffValue('placement', id, before.placement, after.placement));
      if (!same(before.collision, after.collision)) objectDiffs.push(diffValue('collision', id, before.collision, after.collision));
      if (!same(before.review, after.review)) objectDiffs.push(diffValue('review', id, before.review, after.review));
    }
  }
  for (const [id, after] of afterObjects) {
    if (!beforeObjects.has(id)) objectDiffs.push(diffValue('added', id, null, after));
  }

  for (const [id, before] of beforeSurfaces) {
    const after = afterSurfaces.get(id);
    if (!after) surfaceDiffs.push(surfaceDiffValue('deleted', id, before, null));
    else if (before.materialId !== after.materialId) surfaceDiffs.push(surfaceDiffValue('material', id, before.materialId, after.materialId));
  }
  for (const [id, after] of afterSurfaces) {
    if (!beforeSurfaces.has(id)) surfaceDiffs.push(surfaceDiffValue('added', id, null, after));
  }

  const impact = compareDesignImpact(beforeVersion.scene, afterVersion.scene);
  const beforeRules = byId(impact.rules.before.checks.map((check) => ({ ...check, id: `${check.code}:${check.objectIds.join(',')}:${check.clearanceZoneId ?? ''}` })));
  const ruleDiffs = impact.rules.after.checks
    .map((check) => ({ ...check, id: `${check.code}:${check.objectIds.join(',')}:${check.clearanceZoneId ?? ''}` }))
    .filter((check) => check.status !== beforeRules.get(check.id)?.status)
    .map(({ id, ...check }) => ({ ...check, beforeStatus: beforeRules.get(id)?.status ?? 'missing', source: check.source ?? 'demo' }));
  const sceneChanged = serializeScene(beforeVersion.scene) !== serializeScene(afterVersion.scene);
  const commercialUnresolved = sceneChanged
    ? [{ code: 'COMMERCIAL_DATA_UNRESOLVED', reason: '报价、工期和 BOM 需要欧派企业 API，当前 V1 不伪造精确商业数据。', source: 'estimate' }]
    : [];

  return deepFreeze({
    fromVersionId: beforeVersion.id,
    toVersionId: afterVersion.id,
    sceneChanged,
    objectDiffs,
    surfaceDiffs,
    ruleDiffs,
    impact: { ...impact, unresolved: [...impact.unresolved, ...commercialUnresolved] },
  });
}

export function compareVersionHistory(history, beforeId, afterId = history.currentVersionId) {
  return compareSceneVersions(versionById(history, beforeId), versionById(history, afterId));
}

export function serializeVersionHistory(history) {
  return JSON.stringify(clone(history));
}

export function deserializeVersionHistory(serialized) {
  const history = JSON.parse(serialized);
  if (history?.schemaVersion !== 1 || !Array.isArray(history.versions) || !history.versions.length) throw new Error('VERSION_HISTORY_INVALID');
  createSceneStore(history.initialScene);
  const ids = new Set(history.versions.map((version) => version?.id));
  if (ids.size !== history.versions.length || !ids.has(history.currentVersionId) || (history.confirmedVersionId && !ids.has(history.confirmedVersionId))) {
    throw new Error('VERSION_HISTORY_INVALID');
  }
  const seen = new Set();
  for (const [index, version] of history.versions.entries()) {
    if (
      typeof version.id !== 'string' || typeof version.label !== 'string' || typeof version.source !== 'string' ||
      !VERSION_STATUSES.has(version.status) || !Array.isArray(version.commands) ||
      !Number.isInteger(version.cursor) || version.cursor < 0 || version.cursor > version.commands.length ||
      (index === 0 ? version.id !== INITIAL_VERSION_ID || version.parentVersionId !== null : !seen.has(version.parentVersionId))
    ) throw new Error('VERSION_HISTORY_INVALID');
    seen.add(version.id);
    replayVersionScene(history.initialScene, version);
    if (!same(version.summary, versionSummary(version.scene, version.commands, version.cursor))) throw new Error('VERSION_SUMMARY_MISMATCH');
  }
  return freezeHistory(history);
}
