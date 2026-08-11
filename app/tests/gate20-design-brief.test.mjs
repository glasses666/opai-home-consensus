import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentTurn } from '../src/agent/harness.js';
import { createDesignBrief, deserializeDesignBrief, evolveDesignBrief, serializeDesignBrief } from '../src/domain/design-brief.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore, serializeScene } from '../src/domain/scene.js';

const freshStore = () => createSceneStore(createDemoScene());
const objectById = (store, id) => store.currentScene.objects.find((object) => object.id === id);

test('creates an empty design brief when an older project has none', () => {
  const brief = createDesignBrief();

  assert.deepEqual(brief, {
    schemaVersion: 1,
    goals: [],
    hardConstraints: [],
    softPreferences: [],
    confirmedObjects: [],
    unresolvedIssues: [],
  });
});

test('captures primary bedroom goals and hard constraints while creating a legal preview', async () => {
  const before = freshStore();
  const result = await runAgentTurn({
    store: before,
    input: '主卧太满但收纳别少',
    activeRoomId: 'room-primary-bedroom',
    designBrief: createDesignBrief(),
  });

  assert.notEqual(serializeScene(result.store.currentScene), serializeScene(before.currentScene));
  assert.equal(result.trace.rolledBack, false);
  assert.equal(result.trace.steps.every((step) => step.ok), true);
  assert.equal(result.trace.designBrief.goals.some((goal) => goal.includes('主卧') && goal.includes('不太满')), true);
  assert.equal(result.trace.designBrief.hardConstraints.some((constraint) => constraint.includes('收纳')), true);
  assert.ok(objectById(result.store, 'object-primary-wardrobe'));
  assert.ok(objectById(result.store, 'object-primary-wardrobe').dimensions.width >= objectById(before, 'object-primary-wardrobe').dimensions.width);
});

test('asks one question and leaves the scene unchanged when the design intent lacks context', async () => {
  const before = freshStore();
  const result = await runAgentTurn({
    store: before,
    input: '我想更舒服一点',
    designBrief: createDesignBrief(),
  });
  const questions = (result.trace.assistantReply.match(/[？?]/g) ?? []).length;

  assert.equal(serializeScene(result.store.currentScene), serializeScene(before.currentScene));
  assert.equal(result.trace.toolCalls.every((call) => call.tool !== 'move_object' && call.tool !== 'rotate_object'), true);
  assert.equal(questions, 1);
  assert.equal(result.trace.designBrief.unresolvedIssues.length, 1);
});

test('round-trips design brief JSON and evolves without mutating the previous brief', () => {
  const brief = createDesignBrief();
  const evolved = evolveDesignBrief(brief, {
    goals: ['主卧减少拥挤感'],
    hardConstraints: ['保留不少于当前衣柜收纳'],
    softPreferences: ['通道更轻松'],
    confirmedObjects: ['object-primary-wardrobe'],
    unresolvedIssues: ['床左移后是否接受床侧变化'],
  });

  assert.deepEqual(brief.goals, []);
  assert.deepEqual(deserializeDesignBrief(serializeDesignBrief(evolved)), evolved);
});

test('rejects malformed design brief payloads', () => {
  for (const payload of [
    '',
    '{not-json',
    JSON.stringify({ schemaVersion: 2, goals: [], hardConstraints: [], softPreferences: [], confirmedObjects: [], unresolvedIssues: [] }),
    JSON.stringify({ schemaVersion: 1, goals: '主卧', hardConstraints: [], softPreferences: [], confirmedObjects: [], unresolvedIssues: [] }),
    JSON.stringify({ schemaVersion: 1, goals: [], hardConstraints: [2], softPreferences: [], confirmedObjects: [], unresolvedIssues: [] }),
    JSON.stringify({ schemaVersion: 1, goals: [], hardConstraints: [], softPreferences: [], confirmedObjects: [2], unresolvedIssues: [] }),
  ]) {
    assert.throws(() => deserializeDesignBrief(payload), /DESIGN_BRIEF_/);
  }
});
