import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addHouseholdOpinion,
  confirmConsensusVersion,
  createDemoHouseholdConsensus,
  deserializeHouseholdConsensus,
  detectHouseholdConflicts,
  serializeHouseholdConsensus,
  setConflictDirections,
  chooseConsensusDirection,
} from '../src/domain/household-consensus.js';

const version = { id: 'version-two' };
const baseVersion = { id: 'version-one' };
const outcomeVersionId = 'version-two';
const clone = (value) => JSON.parse(JSON.stringify(value));

const buildFinalizedConsensus = () => {
  let state = createDemoHouseholdConsensus(baseVersion);
  state = addHouseholdOpinion(state, { memberId: 'member-owner', stance: 'support', target: { type: 'object', id: 'object-sofa' } });
  state = addHouseholdOpinion(state, { memberId: 'member-partner', stance: 'non_negotiable', target: { type: 'object', id: 'object-sofa' } });
  const [conflict] = detectHouseholdConflicts(state);

  state = setConflictDirections(state, {
    conflictId: conflict.id,
    versionId: 'version-one',
    directions: [
      { id: 'direction-keep-sofa', title: '保留沙发', summary: '保留当前布局，补充过道说明。' },
      { id: 'direction-shift-sofa', title: '移动沙发', summary: '沙发后移，释放通行距离。' },
    ],
  });
  state = chooseConsensusDirection(state, {
    directionId: 'direction-shift-sofa',
    versionId: outcomeVersionId,
    memberId: 'member-owner',
  });
  for (const memberId of ['member-owner', 'member-partner', 'member-parent']) {
    state = confirmConsensusVersion(state, { memberId, versionId: outcomeVersionId });
  }
  return { state, conflict };
};

test('demo household consensus is deterministic frozen and JSON-safe', () => {
  const state = createDemoHouseholdConsensus(version);

  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.members[0]), true);
  assert.deepEqual(state.members.map((member) => member.id), ['member-owner', 'member-partner', 'member-parent']);
  assert.deepEqual(state.members.map((member) => member.preferences), [['会客', '简洁'], ['通道', '预算'], ['夜间安全', '易用']]);
  assert.equal(serializeHouseholdConsensus(deserializeHouseholdConsensus(serializeHouseholdConsensus(state))), serializeHouseholdConsensus(state));
});

test('opinions are bound to member target and scene version', () => {
  let state = createDemoHouseholdConsensus(version);
  const input = {
    memberId: 'member-owner',
    stance: 'support',
    target: { type: 'object', id: 'object-sofa' },
  };
  const duplicate = addHouseholdOpinion(createDemoHouseholdConsensus(version), input);
  state = addHouseholdOpinion(state, input);

  assert.equal(state.opinions[0].id, duplicate.opinions[0].id);
  assert.deepEqual(state.opinions[0], {
    id: state.opinions[0].id,
    memberId: 'member-owner',
    stance: 'support',
    target: { type: 'object', id: 'object-sofa' },
    versionId: 'version-two',
    note: '',
  });
  assert.throws(() => addHouseholdOpinion(state, {
    memberId: 'member-owner',
    stance: 'maybe',
    target: { type: 'object', id: 'object-sofa' },
  }), /OPINION_STANCE_INVALID/);
  assert.throws(() => addHouseholdOpinion(state, {
    memberId: 'member-owner',
    stance: 'support',
    target: { type: 'version', id: 'version-old' },
    versionId: 'version-two',
  }), /OPINION_TARGET_VERSION_MISMATCH/);
});

test('conflicts are only reported for the same target and version', () => {
  let state = createDemoHouseholdConsensus(version);
  state = addHouseholdOpinion(state, { memberId: 'member-owner', stance: 'support', target: { type: 'object', id: 'object-sofa' } });
  state = addHouseholdOpinion(state, { memberId: 'member-partner', stance: 'oppose', target: { type: 'object', id: 'object-sofa' } });
  state = addHouseholdOpinion(state, { memberId: 'member-parent', stance: 'oppose', target: { type: 'room', id: 'room-living' } });
  state = addHouseholdOpinion(state, {
    memberId: 'member-parent',
    stance: 'oppose',
    target: { type: 'object', id: 'object-sofa' },
    versionId: 'version-three',
  });

  const conflicts = detectHouseholdConflicts(state);

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].versionId, 'version-two');
  assert.deepEqual(conflicts[0].target, { type: 'object', id: 'object-sofa' });
  assert.deepEqual(conflicts[0].stances, ['oppose', 'support']);
});

test('V1 directions create a V2 decision and V2 member confirmations', () => {
  const { state, conflict } = buildFinalizedConsensus();

  assert.deepEqual(state.directions.map((direction) => direction.status), ['feasible', 'feasible']);
  assert.deepEqual(state.directions.map((direction) => direction.versionId), ['version-one', 'version-one']);
  assert.equal(state.currentVersionId, outcomeVersionId);
  assert.deepEqual(state.finalDecision, {
    directionId: 'direction-shift-sofa',
    conflictId: conflict.id,
    baseVersionId: 'version-one',
    versionId: outcomeVersionId,
    chosenBy: 'member-owner',
  });
  assert.deepEqual(state.confirmations.map((confirmation) => confirmation.memberId), ['member-owner', 'member-partner', 'member-parent']);
  assert.deepEqual(state.confirmations.map((confirmation) => confirmation.versionId), [outcomeVersionId, outcomeVersionId, outcomeVersionId]);
  assert.deepEqual(deserializeHouseholdConsensus(serializeHouseholdConsensus(state)).finalDecision, state.finalDecision);
  assert.throws(() => confirmConsensusVersion(state, { memberId: 'member-owner', versionId: 'version-one' }), /FINAL_DECISION_VERSION_MISMATCH/);
});

test('deserialize rejects tampered localStorage consensus payloads', () => {
  const { state } = buildFinalizedConsensus();
  const cases = [
    ['empty members', (payload) => { payload.members = []; }, /CONSENSUS_STATE_INVALID/],
    ['one member', (payload) => { payload.members = [payload.members[0]]; }, /CONSENSUS_STATE_INVALID/],
    ['missing currentVersionId', (payload) => { delete payload.currentVersionId; }, /CONSENSUS_STATE_INVALID/],
    ['non-string currentVersionId', (payload) => { payload.currentVersionId = 2; }, /CONSENSUS_STATE_INVALID/],
    ['malformed opinion id', (payload) => { payload.opinions[0].id = ''; }, /OPINION_INVALID/],
    ['duplicate opinion id', (payload) => { payload.opinions[1].id = payload.opinions[0].id; }, /OPINION_INVALID/],
    ['non-string opinion note', (payload) => { payload.opinions[0].note = null; }, /OPINION_INVALID/],
    ['duplicate direction id', (payload) => { payload.directions[1].id = payload.directions[0].id; }, /DIRECTION_INVALID/],
    ['missing direction opinionIds', (payload) => { delete payload.directions[0].opinionIds; }, /DIRECTION_INVALID/],
    ['cross-version direction opinionIds', (payload) => { payload.directions[0].versionId = 'version-other'; }, /DIRECTION_INVALID/],
    ['invalid chosenBy', (payload) => { payload.finalDecision.chosenBy = 'member-missing'; }, /FINAL_DECISION_INVALID/],
    ['duplicate confirmation member id', (payload) => { payload.confirmations[1].memberId = payload.confirmations[0].memberId; }, /CONFIRMATION_INVALID/],
  ];

  for (const [name, mutate, error] of cases) {
    const payload = clone(state);
    mutate(payload);
    assert.throws(() => deserializeHouseholdConsensus(JSON.stringify(payload)), error, name);
  }
});
