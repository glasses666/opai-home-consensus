import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { createPersistentProjectStore } from '../server/project-store.mjs';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createVersionHistory, saveSceneVersion, serializeVersionHistory } from '../src/domain/design-version.js';
import { createDemoHouseholdConsensus, serializeHouseholdConsensus } from '../src/domain/household-consensus.js';
import { createSceneStore, dispatchSceneCommand, serializeScene } from '../src/domain/scene.js';

const tmpStorePath = () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-project-store-'));
  return { dir, file: join(dir, 'project.json') };
};

test('project store persists versions, commands, and pending Base events across restart', () => {
  const { dir, file } = tmpStorePath();
  try {
    const first = createPersistentProjectStore({ filePath: file, id: () => 'one' });
    const changed = dispatchSceneCommand(
      first.getSceneStore(),
      { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } },
    );
    const version = first.recordVersion({
      expectedVersionId: first.currentVersionId,
      store: changed,
      event: { eventId: 'evt-one', input: '沙发向右移动20厘米', provider: 'local', trace: { toolCalls: [] } },
    });
    first.enqueueBaseEvent({ eventId: 'evt-one', input: '沙发向右移动20厘米', trace: { toolCalls: [] } });

    const restarted = createPersistentProjectStore({ filePath: file });
    assert.equal(restarted.currentVersionId, version.id);
    const replayed = restarted.getSceneStore();
    assert.equal(replayed.currentScene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);
    assert.equal(serializeScene(replayed.currentScene), serializeScene(restarted.snapshot().versions.at(-1).scene));
    assert.equal(restarted.snapshot().commandLog.length, 1);
    assert.equal(restarted.listPendingBaseEvents().length, 1);
    assert.doesNotThrow(() => JSON.parse(readFileSync(file, 'utf8')));
    assert.equal(readdirSync(dir).some((name) => name.includes('.tmp-')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no-write turns are logged against the current version without creating a scene version', () => {
  const { dir, file } = tmpStorePath();
  try {
    const store = createPersistentProjectStore({ filePath: file });
    const version = store.recordVersion({
      expectedVersionId: store.currentVersionId,
      store: store.getSceneStore(),
      event: { eventId: 'evt-readonly', input: '先看看客厅', provider: 'local', trace: { toolCalls: [] } },
    });
    assert.equal(version.id, 'version-demo-initial');
    assert.equal(store.snapshot().versions.length, 1);
    assert.equal(store.findVersionByEventId('evt-readonly').id, 'version-demo-initial');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('event IDs are idempotent and expectedVersionId blocks stale writes', () => {
  const { dir, file } = tmpStorePath();
  try {
    const store = createPersistentProjectStore({ filePath: file, id: () => 'same' });
    const initialVersionId = store.currentVersionId;
    const changed = dispatchSceneCommand(
      store.getSceneStore(),
      { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } },
    );
    const first = store.recordVersion({
      expectedVersionId: initialVersionId,
      store: changed,
      event: { eventId: 'evt-same', input: 'move', provider: 'local', trace: { toolCalls: [] } },
    });
    const duplicate = store.recordVersion({
      expectedVersionId: store.currentVersionId,
      store: changed,
      event: { eventId: 'evt-same', input: 'move', provider: 'local', trace: { toolCalls: [] } },
    });
    assert.equal(duplicate.id, first.id);
    assert.equal(store.snapshot().versions.length, 2);

    assert.throws(
      () => store.recordVersion({ expectedVersionId: initialVersionId, store: changed }),
      /VERSION_CONFLICT/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validated browser version history can become the durable current version', () => {
  const { dir, file } = tmpStorePath();
  try {
    const store = createPersistentProjectStore({ filePath: file });
    const initial = store.getSceneStore();
    const moved = dispatchSceneCommand(initial, {
      type: 'object.setTransform',
      objectId: 'object-sofa',
      transform: { x: 2400 },
    });
    const history = saveSceneVersion(createVersionHistory(initial), moved, {
      id: 'version-client-v2',
      now: '2026-08-11T00:00:00.000Z',
      source: 'manual',
    });

    const published = store.publishVersionHistory(history);
    assert.equal(published.id, 'version-client-v2');
    assert.equal(store.currentVersionId, 'version-client-v2');
    assert.equal(store.getSceneStore().currentScene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);

    const unrelated = createPersistentProjectStore({ filePath: join(dir, 'other.json'), initialScene: { ...createDemoScene(), id: 'other-scene' } });
    assert.throws(() => unrelated.publishVersionHistory(history), /VERSION_CONFLICT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a pristine demo store accepts the same canonical scene after schema evolution', () => {
  const { dir, file } = tmpStorePath();
  try {
    const previousScene = createDemoScene();
    previousScene.objects = previousScene.objects.filter((object) => object.id !== 'object-primary-feature-wall');
    const store = createPersistentProjectStore({ filePath: file, initialScene: previousScene });
    const current = createSceneStore(createDemoScene());
    const history = createVersionHistory(current);

    assert.equal(store.publishVersionHistory(history).id, 'version-demo-initial');
    assert.ok(store.getSceneStore().currentScene.objects.some((object) => object.id === 'object-primary-feature-wall'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a browser branch can publish without deleting a durable sibling branch', () => {
  const { dir, file } = tmpStorePath();
  try {
    const store = createPersistentProjectStore({ filePath: file, id: () => 'server' });
    const initial = store.getSceneStore('version-demo-initial');
    const serverStore = dispatchSceneCommand(initial, {
      type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 },
    });
    const serverVersion = store.recordVersion({ expectedVersionId: store.currentVersionId, store: serverStore });

    const browserStore = dispatchSceneCommand(initial, {
      type: 'object.setTransform', objectId: 'object-dining-table', transform: { x: 6400 },
    });
    const browserHistory = saveSceneVersion(createVersionHistory(initial), browserStore, { id: 'version-browser-v2' });
    store.publishVersionHistory(browserHistory);

    assert.equal(store.currentVersionId, 'version-browser-v2');
    assert.equal(store.snapshot().versions.some((version) => version.id === serverVersion.id), true);
    assert.equal(store.snapshot().versions.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('confirm and review mutate version status idempotently without deleting scene', () => {
  const { dir, file } = tmpStorePath();
  try {
    const store = createPersistentProjectStore({ filePath: file, id: () => 'review' });
    const changed = dispatchSceneCommand(
      store.getSceneStore(),
      { type: 'object.setTransform', objectId: 'object-sofa', transform: { x: 2400 } },
    );
    const version = store.recordVersion({
      expectedVersionId: store.currentVersionId,
      store: changed,
      event: { eventId: 'evt-version', input: 'move', provider: 'local', trace: { toolCalls: [] } },
    });

    const confirmed = store.confirmVersion({ versionId: version.id, eventId: 'evt-confirm', actor: 'resident' });
    const repeated = store.confirmVersion({ versionId: version.id, eventId: 'evt-confirm', actor: 'resident' });
    assert.equal(confirmed.status, 'customer_confirmed');
    assert.equal(repeated.status, 'customer_confirmed');

    const reviewed = store.reviewVersion({ versionId: version.id, eventId: 'evt-review', action: 'approve', note: 'ok' });
    assert.equal(reviewed.status, 'designer_verified');
    assert.equal(store.getSceneStore(version.id).currentScene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);
    assert.throws(() => store.reviewVersion({ versionId: version.id, eventId: 'evt-review', action: 'return', note: 'changed' }), /EVENT_ID_CONFLICT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('corrupt project file is preserved and replaced with a valid initial store', () => {
  const { dir, file } = tmpStorePath();
  try {
    writeFileSync(file, '{not-json');
    const store = createPersistentProjectStore({ filePath: file });
    assert.equal(store.getProject().currentVersionId, 'version-demo-initial');
    assert.equal(store.getSceneStore().currentScene.id, createDemoScene().id);
    assert.equal(readdirSync(dir).some((name) => name.startsWith('project.json.corrupt-')), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('logically corrupt version references are quarantined instead of partially loaded', () => {
  const { dir, file } = tmpStorePath();
  try {
    const store = createPersistentProjectStore({ filePath: file });
    const state = store.snapshot();
    state.project.currentVersionId = 'version-missing';
    writeFileSync(file, JSON.stringify(state));

    const recovered = createPersistentProjectStore({ filePath: file });
    assert.equal(recovered.currentVersionId, 'version-demo-initial');
    assert.equal(readdirSync(dir).some((name) => name.startsWith('project.json.corrupt-')), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('handoff snapshots are idempotent for the same event ID and reject conflicting replay', () => {
  const { dir, file } = tmpStorePath();
  try {
    const store = createPersistentProjectStore({ filePath: file });
    const history = createVersionHistory(store.getSceneStore());
    const payload = {
      eventId: 'evt-handoff-one',
      versionId: history.currentVersionId,
      versionHistory: serializeVersionHistory(history),
      householdConsensus: serializeHouseholdConsensus(createDemoHouseholdConsensus(history.currentVersionId)),
    };

    const first = store.saveHandoffSnapshot(payload);
    const duplicate = store.saveHandoffSnapshot(payload);
    assert.equal(first.eventId, duplicate.eventId);
    assert.equal(store.snapshot().handoffSnapshots.length, 1);

    assert.throws(
      () => store.saveHandoffSnapshot({ ...payload, versionId: 'version-other' }),
      /EVENT_ID_CONFLICT/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('handoff snapshot review updates the latest snapshot for a version', () => {
  const { dir, file } = tmpStorePath();
  try {
    const store = createPersistentProjectStore({ filePath: file });
    const history = createVersionHistory(store.getSceneStore());
    const payload = {
      versionId: history.currentVersionId,
      versionHistory: serializeVersionHistory(history),
      householdConsensus: serializeHouseholdConsensus(createDemoHouseholdConsensus(history.currentVersionId)),
    };
    store.saveHandoffSnapshot({ ...payload, eventId: 'evt-handoff-first' });
    store.saveHandoffSnapshot({ ...payload, eventId: 'evt-handoff-second' });

    const reviewed = store.updateHandoffSnapshot(history.currentVersionId, (snapshot) => ({
      ...snapshot,
      review: { decision: 'approved', source: 'demo' },
    }));

    assert.equal(reviewed.eventId, 'evt-handoff-second');
    assert.equal(store.getHandoffSnapshotForVersion(history.currentVersionId).review.decision, 'approved');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
