import { createSceneStore } from './scene.js';
import { createVersionHistory, deserializeVersionHistory, sceneStoreForVersion } from './design-version.js';
import { createDemoHouseholdConsensus, deserializeHouseholdConsensus } from './household-consensus.js';
import { createDesignBrief, deserializeDesignBrief } from './design-brief.js';

function restoreValue(serialized, deserialize, fallback) {
  if (serialized == null) return { value: fallback(), status: 'missing' };
  try {
    if (typeof serialized !== 'string') throw new Error('SESSION_SERIALIZED_VALUE_INVALID');
    return { value: deserialize(serialized), status: 'restored' };
  } catch {
    return { value: fallback(), status: 'invalid' };
  }
}

function restoreHousehold(serialized, history) {
  const restored = deserializeHouseholdConsensus(serialized);
  const versionIds = new Set(history.versions.map(({ id }) => id));
  const references = [
    restored.currentVersionId,
    ...restored.opinions.map(({ versionId }) => versionId),
    ...restored.directions.map(({ versionId }) => versionId),
    restored.finalDecision?.versionId,
    restored.finalDecision?.baseVersionId,
    ...restored.confirmations.map(({ versionId }) => versionId),
  ].filter(Boolean);
  if (references.some((versionId) => !versionIds.has(versionId))) throw new Error('CONSENSUS_VERSION_NOT_FOUND');
  return restored;
}

/**
 * Restore independently validated local state without reading, deleting, or overwriting storage.
 * Saved history owns its initialScene: a changed demo palette/model fixture is not data corruption.
 * Callers must preserve an invalid cache before persisting fallback state over that same key.
 */
export function restoreProjectSession({
  initialScene,
  serializedVersionHistory = null,
  serializedHouseholdConsensus = null,
  serializedDesignBrief = null,
} = {}) {
  const versions = restoreValue(serializedVersionHistory, (serialized) => {
    const history = deserializeVersionHistory(serialized);
    return { history, store: sceneStoreForVersion(history) };
  }, () => {
    const store = createSceneStore(initialScene);
    return { history: createVersionHistory(store), store };
  });
  const { history, store } = versions.value;
  const household = restoreValue(serializedHouseholdConsensus, (serialized) => {
    // Do not accidentally attach opinions to a fresh V1 with the same ID as an unreadable history.
    if (versions.status === 'invalid') throw new Error('CONSENSUS_HISTORY_UNAVAILABLE');
    return restoreHousehold(serialized, history);
  }, () => createDemoHouseholdConsensus(history.currentVersionId));
  const brief = restoreValue(serializedDesignBrief, deserializeDesignBrief, createDesignBrief);
  return {
    history,
    store,
    householdConsensus: household.value,
    designBrief: brief.value,
    restoration: Object.freeze({ versions: versions.status, household: household.status, designBrief: brief.status }),
  };
}
