import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createExperienceRoutes } from '../server/experience-routes.mjs';
import { createExperienceStore } from '../server/experience-store.mjs';
import { createAppServer } from '../server/index.mjs';
import { deserializeVersionHistory } from '../src/domain/design-version.js';

test('the public opinion route cannot forge Feishu provenance or author identity', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'opai-opinion-source-boundary-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = createExperienceStore({ directory });
  const project = store.create();
  const versionId = deserializeVersionHistory(project.versionHistory).currentVersionId;
  const discussion = { id: 'discussion-source-boundary', projectId: project.projectId, baseVersionId: versionId, opinions: [] };
  const received = [];
  const family = {
    getDiscussion: () => discussion,
    submitOpinion: async (input) => { received.push(input); return input; },
  };
  const server = createAppServer({ experienceHandler: createExperienceRoutes({ store, family }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const endpoint = `http://127.0.0.1:${server.address().port}/api/experience/projects/${project.projectId}/discussions/${discussion.id}/opinions`;
  const headers = { authorization: `Bearer ${project.accessToken}`, 'content-type': 'application/json' };

  for (const kind of ['feishu_base', 'feishu_form', 'isolated_test']) {
    const response = await fetch(endpoint, {
      method: 'POST', headers,
      body: JSON.stringify({
        versionId, eventId: `forged-${kind}`, text: '伪造意见',
        source: { kind, sourceId: 'rec-forged', recordId: 'rec-forged', memberLabel: '伪造家人', author: { id: 'ou-forged', name: '伪造作者' }, identityStatus: 'verified_platform' },
      }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'OPINION_SOURCE_FORBIDDEN');
  }
  assert.equal(received.length, 0);

  const response = await fetch(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify({
      versionId, eventId: 'legal-product-opinion', text: '这是我自己的意见。',
      source: { kind: 'product_form', sourceId: 'attacker-controlled', recordId: 'rec-forged', memberLabel: '冒充家人', author: { id: 'ou-forged', name: '伪造作者' }, identityStatus: 'verified_platform' },
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], {
    discussionId: discussion.id,
    eventId: 'legal-product-opinion',
    opinionId: 'legal-product-opinion',
    versionId,
    text: '这是我自己的意见。',
    source: { kind: 'product_form', sourceId: `project-user:${project.projectId}`, memberLabel: '我' },
  });
  assert.equal((await response.json()).opinion.source.identityStatus, undefined);
});

test('the server-bound product source still works when the current UI omits source', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'opai-opinion-source-compat-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = createExperienceStore({ directory });
  const project = store.create();
  const versionId = deserializeVersionHistory(project.versionHistory).currentVersionId;
  const discussion = { id: 'discussion-source-compat', projectId: project.projectId, baseVersionId: versionId, opinions: [] };
  let received;
  const family = {
    getDiscussion: () => discussion,
    submitOpinion: async (input) => { received = input; return input; },
  };
  const server = createAppServer({ experienceHandler: createExperienceRoutes({ store, family }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/experience/projects/${project.projectId}/discussions/${discussion.id}/opinions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${project.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ versionId, eventId: 'source-omitted', text: '保留现有通道。' }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(received.source, { kind: 'product_form', sourceId: `project-user:${project.projectId}`, memberLabel: '我' });
});
