import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

// Compile the actual JSX module with the project's existing build dependency;
// this exercises the exact controller used by the component without a browser.
const bundle = await rolldown({ input: fileURLToPath(new URL('../src/ExperienceDiscussion.jsx', import.meta.url)) });
const output = await bundle.generate({ format: 'esm' });
const { createDiscussionActionState, summarySources, opinionPresentation, summaryItemPresentation } = await import(`data:text/javascript;base64,${Buffer.from(output.output[0].code).toString('base64')}`);
await bundle.close();

test('failed or successful retry keeps event ID until payload or version changes', () => {
  let ids = 0;
  const state = createDiscussionActionState(() => `event-${++ids}`);
  state.activate('project/version-1');
  const first = state.begin('project/version-1', 'opinion', { versionId: 'v1', text: '保留桌子' });
  state.finish(first); // Includes uncertain network failure after a server write.
  const retry = state.begin('project/version-1', 'opinion', { text: '保留桌子', versionId: 'v1' });
  assert.equal(retry.eventId, first.eventId);
  state.finish(retry);
  const changed = state.begin('project/version-1', 'opinion', { versionId: 'v1', text: '改成圆桌' });
  assert.notEqual(changed.eventId, first.eventId);
  state.finish(changed);
  state.activate('project/version-2');
  const nextVersion = state.begin('project/version-2', 'opinion', { versionId: 'v1', text: '保留桌子' });
  assert.notEqual(nextVersion.eventId, first.eventId);
});

test('same-tick repeated clicks and competing actions cannot obtain a second write lock', () => {
  const state = createDiscussionActionState(() => 'event');
  state.activate('scope');
  const first = state.begin('scope', 'create', { version: 1 });
  assert.equal(state.begin('scope', 'create', { version: 1 }), null);
  assert.equal(state.begin('scope', 'adopt', { version: 1 }), null);
  assert.equal(state.isCurrent(first), true);
});

test('version change or unmount invalidates late success/failure and cannot unlock a newer action', async () => {
  const state = createDiscussionActionState(() => 'event');
  state.activate('v1');
  const stale = state.begin('v1', 'summarize', {});
  state.invalidate();
  assert.equal(stale.controller.signal.aborted, true);
  state.activate('v2');
  const current = state.begin('v2', 'load', {});
  let observed = 'v2';
  await Promise.resolve().then(() => { if (state.isCurrent(stale)) observed = 'stale-result'; });
  assert.equal(observed, 'v2');
  assert.equal(state.finish(stale), false);
  assert.equal(state.isCurrent(current), true);
  state.invalidate();
  assert.equal(state.isCurrent(current), false);
});

test('summaries resolve only exact current opinion IDs, and editor identity never becomes opinion authorship', () => {
  const source = { kind: 'feishu_base', invitedLabel: '父母', identityStatus: 'verified_record_editor', recordLastEditor: { name: '编辑者甲' }, author: { name: '不应显示的作者' } };
  const opinion = { id: 'opinion-1', text: '保留书桌', source };
  assert.deepEqual(summarySources({ sourceOpinionIds: ['opinion-1', 'other-project-opinion'] }, [opinion]), [{ id: 'opinion-1', opinion }, { id: 'other-project-opinion', opinion: null }]);
  assert.deepEqual(opinionPresentation(source), { label: '填写者未核验', invitedLabel: '父母', lastEditor: '编辑者甲' });
  assert.equal(opinionPresentation({ ...source, identityStatus: 'verified_platform' }).lastEditor, null);
  assert.equal(opinionPresentation({ kind: 'product_form', memberLabel: '我' }).label, '我');
});

test('record comparisons and legacy summaries never imply household consensus or user adoption', () => {
  for (const comparisonBasis of [undefined, 'record_comparison', 'aily_record_comparison', 'verified_members']) {
    for (const [group, expected] of [['agreed', '多条意见共同主题'], ['conflicts', '意见记录差异']]) {
      const presentation = summaryItemPresentation({ group, comparisonBasis });
      assert.equal(presentation.label, expected);
      assert.match(presentation.boundary, /不代表成员共同确认/);
      assert.match(presentation.boundary, /由你选择/);
    }
  }
  assert.equal(summaryItemPresentation({ group: 'agreed', origin: 'aily_record_comparison' }).attribution, '按意见记录比较');
  assert.equal(summaryItemPresentation({ group: 'conflicts' }, { comparisonBasis: 'record_comparison' }).attribution, '按意见记录比较');
  assert.equal(summaryItemPresentation({ group: 'intents', origin: 'source_opinion', comparisonBasis: 'record_comparison' }).attribution, '原意见直接引用');
  assert.equal(summaryItemPresentation({ group: 'questions' }).label, '待明确');
  assert.equal(summaryItemPresentation({ group: 'future_group' }).label, '意见');
});
