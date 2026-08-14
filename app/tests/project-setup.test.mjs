import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProjectSetup,
  deserializeProjectSetup,
  normalizeProjectSetup,
  projectSetupFingerprint,
  serializeProjectSetup,
} from '../src/domain/project-setup.js';

test('new-project setup resumes the same validated question without trusting localStorage', () => {
  const setup = normalizeProjectSetup({
    ...createProjectSetup(),
    step: 'style',
    sourceType: 'upload',
    fileName: 'home.pdf',
    budget: '20–35 万',
    members: ['self', 'child', 'child'],
    memberDetails: { child: '学龄', unsafe: 42 },
    styles: ['scandinavian', 'japandi', 'quiet-luxury', 'ignored'],
  });

  assert.deepEqual(deserializeProjectSetup(serializeProjectSetup(setup)), setup);
  assert.deepEqual(setup.members, ['self', 'child']);
  assert.deepEqual(setup.styles, ['scandinavian', 'japandi', 'quiet-luxury']);
  assert.equal(normalizeProjectSetup({ step: 'tampered', sourceType: 'fake' }).step, 'source');
  assert.throws(() => deserializeProjectSetup('{broken'), /PROJECT_SETUP_INVALID_JSON/);
});

test('forward processing repeats only when the current step input changes', () => {
  const first = normalizeProjectSetup({ ...createProjectSetup(), step: 'source', sourceType: 'demo', fileName: 'ignored' });
  const same = normalizeProjectSetup({ ...first, fileName: 'another ignored demo label' });
  const changed = normalizeProjectSetup({ ...first, sourceType: 'upload', fileName: 'home.pdf' });

  assert.equal(projectSetupFingerprint(first), projectSetupFingerprint(same));
  assert.notEqual(projectSetupFingerprint(first), projectSetupFingerprint(changed));
  assert.equal(
    projectSetupFingerprint({ ...first, step: 'style', styles: ['japandi', 'scandinavian'] }),
    projectSetupFingerprint({ ...first, step: 'style', styles: ['scandinavian', 'japandi'] }),
  );
});
