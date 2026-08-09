import { compareDesignImpact } from './design-impact.js';
import { createSceneStore, deepFreeze, replaySceneCommands, serializeScene } from './scene.js';

const INITIAL_VERSION_ID = 'version-demo-initial';
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

const versionSummary = (scene, commands, cursor) => {
  const snapshot = serializeScene(scene);
  return {
    snapshotHash: hash(snapshot),
    snapshotBytes: snapshot.length,
    commandHash: hash(commands.slice(0, cursor)),
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

const currentVersion = (history) => {
  const version = history.versions.find((candidate) => candidate.id === history.currentVersionId);
  if (!version) throw new Error('VERSION_NOT_FOUND');
  return version;
};

const replayVersionScene = (initialScene, version) => {
  const scene = replaySceneCommands(initialScene, version.commands.slice(0, version.cursor));
  if (serializeScene(scene) !== serializeScene(version.scene)) throw new Error('VERSION_REPLAY_MISMATCH');
  return scene;
};

const freezeHistory = (history) => deepFreeze({
  ...history,
  versions: history.versions.map((version) => deepFreeze(version)),
});

export function createVersionHistory(initialStore, { id = 'history-demo', now = nowIso() } = {}) {
  const version = makeVersion({
    id: INITIAL_VERSION_ID,
    label: 'V1',
    parentVersionId: null,
    createdAt: now,
    source: 'demo',
    status: 'drafting',
    scene: initialStore.initialScene,
    commands: [],
    cursor: 0,
  });
  return freezeHistory({ id, initialScene: initialStore.initialScene, currentVersionId: version.id, confirmedVersionId: null, versions: [version] });
}

export function saveSceneVersion(history, store, { source = 'local', id = `version-${hash(`${store.cursor}:${Date.now()}`)}`, now = nowIso() } = {}) {
  const current = currentVersion(history);
  if (serializeScene(current.scene) === serializeScene(store.currentScene)) return history;
  const afterConfirmed = Boolean(history.confirmedVersionId);
  const version = makeVersion({
    id,
    label: `V${history.versions.length + 1}`,
    parentVersionId: current.id,
    createdAt: now,
    source,
    status: afterConfirmed ? 'changed_after_confirm' : 'impact_review',
    scene: store.currentScene,
    commands: store.commands,
    cursor: store.cursor,
  });
  return freezeHistory({ ...history, currentVersionId: version.id, versions: [...history.versions, version] });
}

export function confirmSceneVersion(history, versionId = history.currentVersionId, { actor = 'customer', now = nowIso() } = {}) {
  const versions = history.versions.map((version) => version.id === versionId
    ? deepFreeze({ ...version, status: 'customer_confirmed', confirmation: { actor, confirmedAt: now, source: 'demo' } })
    : version);
  if (!versions.some((version) => version.id === versionId)) throw new Error('VERSION_NOT_FOUND');
  return freezeHistory({ ...history, confirmedVersionId: versionId, versions });
}

export function sceneStoreForVersion(history, versionId = history.currentVersionId) {
  const version = history.versions.find((candidate) => candidate.id === versionId);
  if (!version) throw new Error('VERSION_NOT_FOUND');
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
  const targetId = typeof versionOrId === 'string' ? versionOrId : versionOrId.id;
  const store = sceneStoreForVersion(history, targetId);
  return { history: saveSceneVersion(history, store, { ...options, source: options.source ?? 'restore' }), store };
}

export function buildSceneVersions(store) {
  let history = createVersionHistory(createSceneStore(store.initialScene), { now: '2026-01-01T00:00:00.000Z' });
  for (let cursor = 1; cursor <= store.cursor; cursor += 1) {
    history = saveSceneVersion(history, {
      initialScene: store.initialScene,
      currentScene: replaySceneCommands(store.initialScene, store.commands.slice(0, cursor)),
      commands: store.commands,
      cursor,
    }, { id: `version-v${cursor + 1}`, now: '2026-01-01T00:00:00.000Z', source: store.commands[cursor - 1]?.provider ?? 'local' });
  }
  return history.versions;
}

export function versionLifecycle(version, currentVersionId, confirmedVersionId) {
  if (version.status === 'customer_confirmed' || version.id === confirmedVersionId) return 'customer_confirmed';
  if (version.status === 'changed_after_confirm' || (confirmedVersionId && version.id === currentVersionId)) return 'changed_after_confirm';
  return version.id === currentVersionId ? 'draft_current' : 'draft_previous';
}

const diffValue = (kind, objectId, before, after) => ({ kind, objectId, before, after });

export function compareSceneVersions(beforeVersion, afterVersion) {
  const beforeObjects = byId(beforeVersion.scene.objects);
  const afterObjects = byId(afterVersion.scene.objects);
  const objectDiffs = [];

  for (const [id, before] of beforeObjects) {
    const after = afterObjects.get(id);
    if (!after) objectDiffs.push(diffValue('deleted', id, before, null));
    else {
      if (!same(before.transform, after.transform)) objectDiffs.push(diffValue('transform', id, before.transform, after.transform));
      if (!same(before.dimensions, after.dimensions)) objectDiffs.push(diffValue('dimensions', id, before.dimensions, after.dimensions));
      if (before.materialId !== after.materialId) objectDiffs.push(diffValue('material', id, before.materialId, after.materialId));
    }
  }
  for (const [id, after] of afterObjects) {
    if (!beforeObjects.has(id)) objectDiffs.push(diffValue('added', id, null, after));
  }

  const impact = compareDesignImpact(beforeVersion.scene, afterVersion.scene);
  const beforeRules = byId(impact.rules.before.checks.map((check) => ({ ...check, id: `${check.code}:${check.objectIds.join(',')}:${check.clearanceZoneId ?? ''}` })));
  const ruleDiffs = impact.rules.after.checks
    .map((check) => ({ ...check, id: `${check.code}:${check.objectIds.join(',')}:${check.clearanceZoneId ?? ''}` }))
    .filter((check) => check.status !== beforeRules.get(check.id)?.status)
    .map(({ id, ...check }) => ({ ...check, beforeStatus: beforeRules.get(id)?.status ?? 'missing', source: check.source ?? 'demo' }));
  const commercialUnresolved = serializeScene(beforeVersion.scene) === serializeScene(afterVersion.scene)
    ? []
    : [{ code: 'COMMERCIAL_DATA_UNRESOLVED', reason: '报价、工期和 BOM 需要欧派企业 API，当前 V1 不伪造精确商业数据。', source: 'estimate' }];

  return deepFreeze({
    fromVersionId: beforeVersion.id,
    toVersionId: afterVersion.id,
    sceneChanged: serializeScene(beforeVersion.scene) !== serializeScene(afterVersion.scene),
    objectDiffs,
    ruleDiffs,
    impact: { ...impact, unresolved: [...impact.unresolved, ...commercialUnresolved] },
  });
}

export const compareVersionHistory = (history, beforeId, afterId = history.currentVersionId) => compareSceneVersions(
  history.versions.find((version) => version.id === beforeId),
  history.versions.find((version) => version.id === afterId),
);

export const compareSceneVersionsInHistory = compareVersionHistory;

export function serializeVersionHistory(history) {
  return JSON.stringify(clone(history));
}

export function deserializeVersionHistory(serialized) {
  const history = JSON.parse(serialized);
  if (!history || !Array.isArray(history.versions) || !history.versions.length) throw new Error('VERSION_HISTORY_INVALID');
  const ids = new Set(history.versions.map((version) => version.id));
  if (ids.size !== history.versions.length || !ids.has(history.currentVersionId)) throw new Error('VERSION_HISTORY_INVALID');
  for (const version of history.versions) {
    if (version.parentVersionId !== null && !ids.has(version.parentVersionId)) throw new Error('VERSION_PARENT_INVALID');
    replayVersionScene(history.initialScene, version);
    if (!same(version.summary, versionSummary(version.scene, version.commands, version.cursor))) throw new Error('VERSION_SUMMARY_MISMATCH');
  }
  return freezeHistory(history);
}
