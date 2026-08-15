import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import { evaluateDesignRules } from '../src/domain/design-rules.js';
import { createSceneStore, serializeScene } from '../src/domain/scene.js';
import { findRecordingScenario, recordingScenarios, runRecordingScenario } from '../src/demo/recording-scenarios.js';

test('competition triggers produce deterministic, rule-safe multi-change previews', () => {
  const initial = createSceneStore(createDemoScene());
  const baselineBlocked = evaluateDesignRules(initial.currentScene).violations.filter((check) => check.status === 'blocked');
  assert.equal(baselineBlocked.length, 0);

  let sequence = initial;
  for (const scenario of recordingScenarios) {
    const result = runRecordingScenario(sequence, scenario.trigger);
    assert.equal(result.scenario.id, scenario.id);
    assert.ok(result.trace.toolCalls.length >= 4);
    assert.notEqual(serializeScene(result.store.currentScene), serializeScene(sequence.currentScene));
    assert.equal(evaluateDesignRules(result.store.currentScene).violations.some((check) => check.status === 'blocked'), false);
    sequence = result.store;
  }
});

test('competition triggers are exact and unknown input stays outside the scripted path', () => {
  assert.equal(findRecordingScenario(recordingScenarios[0].trigger)?.id, 'family-living-flow');
  assert.equal(findRecordingScenario('随便改一下'), null);
  assert.equal(runRecordingScenario(createSceneStore(createDemoScene()), '随便改一下'), null);
});
