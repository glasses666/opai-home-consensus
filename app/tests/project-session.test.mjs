import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore, dispatchSceneCommand, serializeScene, undoSceneCommand } from '../src/domain/scene.js';
import { createVersionHistory, saveSceneVersion, confirmSceneVersion, serializeVersionHistory } from '../src/domain/design-version.js';
import { createDemoHouseholdConsensus, addHouseholdOpinion, serializeHouseholdConsensus } from '../src/domain/household-consensus.js';
import { createDesignBrief, evolveDesignBrief, serializeDesignBrief } from '../src/domain/design-brief.js';
import { restoreProjectSession } from '../src/domain/project-session.js';

function savedProject() {
  const initial = createSceneStore(createDemoScene('japandi'));
  const store = dispatchSceneCommand(initial, { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } });
  const history = confirmSceneVersion(saveSceneVersion(createVersionHistory(initial), store, { id: 'version-resident-saved' }));
  const household = addHouseholdOpinion(createDemoHouseholdConsensus(history.currentVersionId), {
    memberId: 'member-owner', stance: 'support', target: { type: 'object', id: 'object-sofa' }, note: '保留这个布局',
  });
  const brief = evolveDesignBrief(createDesignBrief(), { input: '收纳不能少，控制预算', activeRoomId: 'room-living-dining' });
  return { initial, store, history, household, brief };
}

test('restores the saved scene, version confirmation, household and brief after a fixture changes', () => {
  const saved = savedProject();
  const currentFixture = createDemoScene('scandinavian');
  assert.notEqual(serializeScene(currentFixture), serializeScene(saved.initial.initialScene));
  const restored = restoreProjectSession({
    initialScene: currentFixture,
    serializedVersionHistory: serializeVersionHistory(saved.history),
    serializedHouseholdConsensus: serializeHouseholdConsensus(saved.household),
    serializedDesignBrief: serializeDesignBrief(saved.brief),
  });
  assert.deepEqual(restored.restoration, { versions: 'restored', household: 'restored', designBrief: 'restored' });
  assert.equal(restored.history.currentVersionId, 'version-resident-saved');
  assert.equal(restored.history.confirmedVersionId, 'version-resident-saved');
  assert.equal(serializeScene(restored.store.currentScene), serializeScene(saved.store.currentScene));
  assert.equal(serializeScene(restored.store.initialScene), serializeScene(saved.initial.initialScene));
  assert.deepEqual(restored.householdConsensus, saved.household);
  assert.deepEqual(restored.designBrief, saved.brief);
  assert.equal(serializeScene(undoSceneCommand(restored.store).currentScene), serializeScene(saved.initial.initialScene));
});

test('a missing session starts a current-style scene with explicit missing status', () => {
  const initialScene = createDemoScene('quiet-luxury');
  const restored = restoreProjectSession({ initialScene });
  assert.deepEqual(restored.restoration, { versions: 'missing', household: 'missing', designBrief: 'missing' });
  assert.equal(serializeScene(restored.store.currentScene), serializeScene(initialScene));
  assert.equal(restored.householdConsensus.currentVersionId, restored.history.currentVersionId);
});

test('invalid cached history is reported without mutating cache inputs or attaching old V1 opinions', () => {
  const oldHousehold = addHouseholdOpinion(createDemoHouseholdConsensus(), {
    memberId: 'member-owner', stance: 'support', target: { type: 'object', id: 'object-sofa' }, note: '旧方案意见',
  });
  const input = Object.freeze({ initialScene: createDemoScene(), serializedVersionHistory: '{broken', serializedHouseholdConsensus: serializeHouseholdConsensus(oldHousehold), serializedDesignBrief: '{broken' });
  const restored = restoreProjectSession(input);
  assert.deepEqual(restored.restoration, { versions: 'invalid', household: 'invalid', designBrief: 'invalid' });
  assert.equal(input.serializedVersionHistory, '{broken');
  assert.equal(restored.householdConsensus.opinions.length, 0);
});

test('replay-corrupt history falls back instead of trusting the serialized snapshot', () => {
  const saved = savedProject();
  const corrupted = JSON.parse(serializeVersionHistory(saved.history));
  corrupted.versions.at(-1).scene.objects.find(({ id }) => id === 'object-sofa').transform.x = 3000;
  const restored = restoreProjectSession({ initialScene: createDemoScene(), serializedVersionHistory: JSON.stringify(corrupted) });
  assert.equal(restored.restoration.versions, 'invalid');
  assert.equal(restored.store.commands.length, 0);
});

test('dangling household version references cannot discard an otherwise valid saved design', () => {
  const saved = savedProject();
  const dangling = createDemoHouseholdConsensus('version-not-in-history');
  const restored = restoreProjectSession({
    initialScene: createDemoScene(), serializedVersionHistory: serializeVersionHistory(saved.history),
    serializedHouseholdConsensus: serializeHouseholdConsensus(dangling), serializedDesignBrief: serializeDesignBrief(saved.brief),
  });
  assert.deepEqual(restored.restoration, { versions: 'restored', household: 'invalid', designBrief: 'restored' });
  assert.equal(restored.history.currentVersionId, saved.history.currentVersionId);
  assert.equal(restored.householdConsensus.currentVersionId, saved.history.currentVersionId);
  assert.deepEqual(restored.designBrief, saved.brief);
});
