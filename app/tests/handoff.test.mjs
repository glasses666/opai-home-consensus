import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoHouseholdConsensus } from '../src/domain/household-consensus.js';
import { confirmSceneVersion, createVersionHistory, saveSceneVersion } from '../src/domain/design-version.js';
import { buildDesignerReview, buildHandoffPacket } from '../src/domain/handoff.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore, dispatchSceneCommand } from '../src/domain/scene.js';

const makeHistory = () => {
  let store = createSceneStore(createDemoScene());
  let history = createVersionHistory(store, { now: '2026-08-11T00:00:00.000Z' });
  store = dispatchSceneCommand(store, {
    type: 'object.setTransform',
    objectId: 'object-flex-bed',
    transform: { x: 7900 },
  });
  history = saveSceneVersion(history, store, { now: '2026-08-11T00:01:00.000Z', source: 'manual' });
  history = confirmSceneVersion(history, history.currentVersionId, { now: '2026-08-11T00:02:00.000Z' });
  return history;
};

test('designer review summarizes rules diffs and household evidence without side effects', () => {
  const history = makeHistory();
  const consensus = createDemoHouseholdConsensus(history.currentVersionId);
  const review = buildDesignerReview(history, consensus, { capability: { aily: 'missing_scope', base: 'ready' } });

  assert.equal(review.projectId, 'project-demo');
  assert.equal(review.currentVersionId, history.currentVersionId);
  assert.equal(review.capability.base, 'ready');
  assert.equal(review.objectDiffs.some((diff) => diff.objectId === 'object-flex-bed'), true);
  assert.equal(review.ruleIssues.some((issue) => issue.code === 'CLEARANCE_OCCUPIED'), true);
});

test('handoff packet keeps enterprise data pending and every object source explicit', () => {
  const history = makeHistory();
  const packet = buildHandoffPacket(history, createDemoHouseholdConsensus(history.currentVersionId));

  assert.equal(packet.version.status, 'customer_confirmed');
  assert.equal(packet.confirmedObjects.every((object) => object.source), true);
  assert.equal(packet.confirmedObjects.every((object) => object.materialSource), true);
  assert.equal(packet.unresolved.some((item) => item.code === 'OPPEIN_ENTERPRISE_API_PENDING'), true);
  assert.equal(packet.downstreamPlaceholders.production, 'not_connected_in_v1');
});

test('handoff packet can target an explicit route version', () => {
  const history = makeHistory();
  const packet = buildHandoffPacket(history, createDemoHouseholdConsensus(history.currentVersionId), {
    versionId: history.versions[0].id,
    projectId: 'project-review-demo',
  });

  assert.equal(packet.projectId, 'project-review-demo');
  assert.equal(packet.version.id, history.versions[0].id);
  assert.equal(packet.version.label, 'V1');
  assert.equal(packet.version.status, 'drafting');
});

test('designer review targets the version named by the route', () => {
  const history = makeHistory();
  const first = history.versions[0];
  const review = buildDesignerReview(history, createDemoHouseholdConsensus(history.currentVersionId), {
    versionId: first.id,
  });

  assert.equal(review.currentVersionId, first.id);
  assert.equal(review.currentVersionLabel, 'V1');
  assert.equal(review.status, 'drafting');
});
