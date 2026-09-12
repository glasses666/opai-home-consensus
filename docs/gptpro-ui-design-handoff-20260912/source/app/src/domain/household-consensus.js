import { deepFreeze } from './scene.js';

export const OPINION_STANCES = deepFreeze(['support', 'oppose', 'supplement', 'non_negotiable']);
export const DEMO_HOUSEHOLD_MEMBERS = deepFreeze([
  { id: 'member-owner', name: '业主', role: 'owner', preferences: ['会客', '简洁'] },
  { id: 'member-partner', name: '伴侣', role: 'co_decider', preferences: ['通道', '预算'] },
  { id: 'member-parent', name: '长辈', role: 'resident', preferences: ['夜间安全', '易用'] },
]);

const TARGET_TYPES = new Set(['room', 'object', 'version']);
const BLOCKING_STANCES = new Set(['oppose', 'non_negotiable']);
const SUPPORTING_STANCES = new Set(['support', 'supplement']);
const clone = (value) => JSON.parse(JSON.stringify(value));
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const asId = (value, code) => {
  const id = typeof value === 'string' ? value : value?.id;
  if (typeof id !== 'string' || !id) throw new Error(code);
  return id;
};
const sceneVersionId = (value = 'version-demo-initial') => asId(value, 'VERSION_ID_INVALID');
const memberIds = (state) => new Set(state.members.map((member) => member.id));
const opinionById = (state) => new Map(state.opinions.map((opinion) => [opinion.id, opinion]));
const hash = (value) => {
  const text = typeof value === 'string' ? value : stableSerialize(value);
  let result = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
};
const stableClone = (value) => {
  if (Array.isArray(value)) return value.map(stableClone);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableClone(value[key])]));
};
const stableSerialize = (value) => JSON.stringify(stableClone(value));
const freezeState = (state) => deepFreeze(clone(state));
const sameArray = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
const sameMember = (member, canonical) => (
  member.id === canonical.id &&
  member.name === canonical.name &&
  member.role === canonical.role &&
  Array.isArray(member.preferences) &&
  sameArray(member.preferences, canonical.preferences)
);

const normalizeTarget = (target, versionId) => {
  if (!isRecord(target) || !TARGET_TYPES.has(target.type) || typeof target.id !== 'string' || !target.id) {
    throw new Error('OPINION_TARGET_INVALID');
  }
  if (target.type === 'version' && target.id !== versionId) throw new Error('OPINION_TARGET_VERSION_MISMATCH');
  return { type: target.type, id: target.id };
};

const assertMember = (state, memberId) => {
  if (!memberIds(state).has(memberId)) throw new Error('MEMBER_NOT_FOUND');
};

const assertState = (state) => {
  if (!isRecord(state) || state.schemaVersion !== 1 || typeof state.id !== 'string' || !state.id) {
    throw new Error('CONSENSUS_STATE_INVALID');
  }
  if (typeof state.currentVersionId !== 'string' || !state.currentVersionId) throw new Error('CONSENSUS_STATE_INVALID');
  if (!Array.isArray(state.members) || !Array.isArray(state.opinions) || !Array.isArray(state.directions) || !Array.isArray(state.confirmations)) {
    throw new Error('CONSENSUS_STATE_INVALID');
  }
  if (state.members.length !== DEMO_HOUSEHOLD_MEMBERS.length || state.members.some((member, index) => !sameMember(member, DEMO_HOUSEHOLD_MEMBERS[index]))) {
    throw new Error('CONSENSUS_STATE_INVALID');
  }
  const opinionIds = new Set();
  for (const opinion of state.opinions) {
    assertMember(state, opinion.memberId);
    if (
      typeof opinion.id !== 'string' || !opinion.id || opinionIds.has(opinion.id) ||
      !OPINION_STANCES.includes(opinion.stance) ||
      typeof opinion.versionId !== 'string' || !opinion.versionId ||
      typeof opinion.note !== 'string'
    ) throw new Error('OPINION_INVALID');
    opinionIds.add(opinion.id);
    normalizeTarget(opinion.target, opinion.versionId);
  }
};

export function createDemoHouseholdConsensus(sceneVersion = 'version-demo-initial', { id = 'household-consensus-demo' } = {}) {
  return freezeState({
    schemaVersion: 1,
    id,
    currentVersionId: sceneVersionId(sceneVersion),
    members: DEMO_HOUSEHOLD_MEMBERS,
    opinions: [],
    directions: [],
    finalDecision: null,
    confirmations: [],
  });
}

export function addHouseholdOpinion(state, input) {
  assertState(state);
  const versionId = sceneVersionId(input?.versionId ?? state.currentVersionId);
  const memberId = asId(input?.memberId, 'MEMBER_ID_INVALID');
  assertMember(state, memberId);
  if (!OPINION_STANCES.includes(input?.stance)) throw new Error('OPINION_STANCE_INVALID');
  const opinion = {
    id: input.id ?? `opinion-${state.opinions.length + 1}-${hash({ memberId, stance: input.stance, target: input.target, versionId })}`,
    memberId,
    stance: input.stance,
    target: normalizeTarget(input.target, versionId),
    versionId,
    note: typeof input.note === 'string' ? input.note : '',
  };
  if (state.opinions.some((candidate) => candidate.id === opinion.id)) throw new Error('OPINION_ID_DUPLICATE');
  return freezeState({ ...state, opinions: [...state.opinions, opinion] });
}

export function detectHouseholdConflicts(state) {
  assertState(state);
  const groups = new Map();
  for (const opinion of state.opinions) {
    const key = `${opinion.versionId}:${opinion.target.type}:${opinion.target.id}`;
    groups.set(key, [...(groups.get(key) ?? []), opinion]);
  }
  return deepFreeze([...groups.values()]
    .filter((opinions) => (
      opinions.some((opinion) => BLOCKING_STANCES.has(opinion.stance)) &&
      opinions.some((opinion) => SUPPORTING_STANCES.has(opinion.stance))
    ))
    .map((opinions) => {
      const opinionIds = opinions.map((opinion) => opinion.id).sort();
      const target = opinions[0].target;
      const versionId = opinions[0].versionId;
      return {
        id: `conflict-${hash({ opinionIds, target, versionId })}`,
        versionId,
        target,
        opinionIds,
        memberIds: [...new Set(opinions.map((opinion) => opinion.memberId))].sort(),
        stances: [...new Set(opinions.map((opinion) => opinion.stance))].sort(),
        severity: opinions.some((opinion) => opinion.stance === 'non_negotiable') ? 'non_negotiable' : 'opposed',
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id)));
}

export function setConflictDirections(state, { conflictId, versionId, directions }) {
  assertState(state);
  const conflict = detectHouseholdConflicts(state).find((candidate) => candidate.id === conflictId && candidate.versionId === versionId);
  if (!conflict) throw new Error('CONFLICT_NOT_FOUND');
  if (!Array.isArray(directions) || directions.length === 0) throw new Error('DIRECTIONS_INVALID');
  const opinions = opinionById(state);
  const nextDirections = directions.map((direction, index) => {
    const opinionIds = direction.opinionIds ?? conflict.opinionIds;
    if (!Array.isArray(opinionIds) || opinionIds.some((id) => !opinions.has(id) || opinions.get(id).versionId !== versionId)) {
      throw new Error('DIRECTION_OPINIONS_INVALID');
    }
    if (direction.feasible === false) throw new Error('DIRECTION_NOT_FEASIBLE');
    return {
      id: direction.id ?? `direction-${hash({ conflictId, index, title: direction.title, versionId })}`,
      conflictId,
      versionId,
      target: conflict.target,
      status: 'feasible',
      title: asId(direction.title, 'DIRECTION_TITLE_INVALID'),
      summary: typeof direction.summary === 'string' ? direction.summary : '',
      opinionIds: [...opinionIds].sort(),
    };
  });
  if (new Set(nextDirections.map((direction) => direction.id)).size !== nextDirections.length) throw new Error('DIRECTION_ID_DUPLICATE');
  return freezeState({
    ...state,
    directions: [
      ...state.directions.filter((direction) => direction.conflictId !== conflictId || direction.versionId !== versionId),
      ...nextDirections,
    ],
  });
}

export function chooseConsensusDirection(state, { directionId, versionId, memberId }) {
  assertState(state);
  assertMember(state, memberId);
  const direction = state.directions.find((candidate) => candidate.id === directionId);
  if (!direction || direction.status !== 'feasible') throw new Error('DIRECTION_NOT_FOUND');
  const outcomeVersionId = sceneVersionId(versionId);
  return freezeState({
    ...state,
    currentVersionId: outcomeVersionId,
    finalDecision: {
      directionId,
      conflictId: direction.conflictId,
      baseVersionId: direction.versionId,
      versionId: outcomeVersionId,
      chosenBy: memberId,
    },
    confirmations: state.confirmations.filter((confirmation) => confirmation.versionId === outcomeVersionId && confirmation.directionId === directionId),
  });
}

export function confirmConsensusVersion(state, { memberId, versionId }) {
  assertState(state);
  assertMember(state, memberId);
  if (!state.finalDecision || state.finalDecision.versionId !== versionId) throw new Error('FINAL_DECISION_VERSION_MISMATCH');
  const confirmation = { memberId, versionId, directionId: state.finalDecision.directionId };
  const order = new Map(state.members.map((member, index) => [member.id, index]));
  return freezeState({
    ...state,
    confirmations: [
      ...state.confirmations.filter((candidate) => candidate.memberId !== memberId || candidate.versionId !== versionId),
      confirmation,
    ].sort((a, b) => (order.get(a.memberId) ?? 0) - (order.get(b.memberId) ?? 0)),
  });
}

export function serializeHouseholdConsensus(state) {
  assertState(state);
  return stableSerialize(state);
}

export function deserializeHouseholdConsensus(serialized) {
  const state = JSON.parse(serialized);
  assertState(state);
  const opinions = opinionById(state);
  const directionIds = new Set();
  for (const direction of state.directions) {
    if (
      typeof direction.id !== 'string' || !direction.id || directionIds.has(direction.id) ||
      direction.status !== 'feasible' ||
      typeof direction.versionId !== 'string' || !direction.versionId ||
      !Array.isArray(direction.opinionIds) || direction.opinionIds.length === 0 ||
      direction.opinionIds.some((id) => !opinions.has(id) || opinions.get(id).versionId !== direction.versionId)
    ) throw new Error('DIRECTION_INVALID');
    directionIds.add(direction.id);
  }
  if (state.finalDecision) {
    const direction = state.directions.find((candidate) => candidate.id === state.finalDecision.directionId);
    if (
      !direction ||
      direction.versionId !== state.finalDecision.baseVersionId ||
      typeof state.finalDecision.versionId !== 'string' || !state.finalDecision.versionId ||
      !memberIds(state).has(state.finalDecision.chosenBy)
    ) throw new Error('FINAL_DECISION_INVALID');
  }
  const confirmedMembers = new Set();
  for (const confirmation of state.confirmations) {
    assertMember(state, confirmation.memberId);
    if (
      confirmedMembers.has(confirmation.memberId) ||
      !state.finalDecision ||
      confirmation.versionId !== state.finalDecision.versionId ||
      confirmation.directionId !== state.finalDecision.directionId
    ) {
      throw new Error('CONFIRMATION_INVALID');
    }
    confirmedMembers.add(confirmation.memberId);
  }
  return freezeState(state);
}
