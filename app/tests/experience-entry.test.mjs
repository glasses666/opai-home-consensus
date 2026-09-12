import test from 'node:test';
import assert from 'node:assert/strict';

import { experienceEntryFailureMessage } from '../src/domain/experience-entry.js';

test('experience entry never exposes a bare route NOT_FOUND to a new visitor', () => {
  assert.equal(
    experienceEntryFailureMessage(new Error('NOT_FOUND')),
    '项目服务尚未接入当前页面，请重试。',
  );
});

test('experience entry distinguishes an unavailable saved project', () => {
  assert.equal(
    experienceEntryFailureMessage(new Error('NOT_FOUND'), { requestedProject: true }),
    '这个项目不在当前体验服务中。请从项目入口重新打开，或新建独立体验。',
  );
});

test('experience entry turns transport failures into a recoverable message', () => {
  assert.equal(
    experienceEntryFailureMessage(new TypeError('Failed to fetch')),
    '项目服务暂时没有响应，请稍后重试。',
  );
});
