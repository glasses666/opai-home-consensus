import assert from 'node:assert/strict';
import test from 'node:test';

import { createDemoScene } from '../src/domain/demo-scene.js';
import { compareDesignImpact } from '../src/domain/design-impact.js';
import { evaluateDesignRules } from '../src/domain/design-rules.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const moveObject = (scene, objectId, transform) => {
  const next = clone(scene);
  const object = next.objects.find((candidate) => candidate.id === objectId);
  object.transform = { ...object.transform, ...transform };
  return next;
};

test('design rules return normalized passed warning and blocked checks', () => {
  const result = evaluateDesignRules(createDemoScene());

  assert.equal(result.ok, true);
  assert.equal(result.checks.every((check) => ['passed', 'warning', 'blocked'].includes(check.status)), true);
  assert.equal(result.checks.some((check) => check.code === 'ROOM_BOUNDARY' && check.status === 'passed'), true);
  assert.equal(result.checks.some((check) => check.code === 'DOOR_SWING_OCCUPIED' && check.status === 'warning'), true);
});

test('collision and room boundary violations are blocked deterministically', () => {
  const collision = evaluateDesignRules(moveObject(createDemoScene(), 'object-sofa', { x: 6200, z: 5700 }));
  assert.equal(collision.status, 'blocked');
  assert.equal(collision.violations.some((violation) => violation.code === 'OBJECT_COLLISION' && violation.status === 'blocked'), true);

  const boundary = evaluateDesignRules(moveObject(createDemoScene(), 'object-sofa', { x: 100 }));
  assert.equal(boundary.status, 'blocked');
  assert.equal(boundary.violations.some((violation) => violation.code === 'ROOM_BOUNDARY' && violation.status === 'blocked'), true);
});

test('door swing follows the configured rule severity', () => {
  const scene = clone(createDemoScene());
  scene.rules.find((rule) => rule.id === 'rule-opening-clearance').severity = 'error';
  const result = evaluateDesignRules(scene);

  assert.equal(result.status, 'blocked');
  assert.equal(result.violations.some((violation) => violation.code === 'DOOR_SWING_OCCUPIED' && violation.status === 'blocked'), true);
});

test('impact report compares clearance and honest storage estimates', () => {
  const before = createDemoScene();
  const after = moveObject(before, 'object-primary-bed', { x: 1100 });
  const impact = compareDesignImpact(before, after);

  assert.equal(impact.status, 'warning');
  assert.deepEqual(
    impact.impacts.find((item) => item.clearanceZoneId === 'clearance-primary-bedside'),
    {
      kind: 'clearance',
      clearanceZoneId: 'clearance-primary-bedside',
      label: '床侧净距',
      beforeStatus: 'passed',
      afterStatus: 'warning',
      beforeAvailableMm: 700,
      afterAvailableMm: 0,
      deltaAvailableMm: -700,
      minimumMm: 600,
      valueMm: 700,
      method: 'protected_zone_occupancy',
    },
  );
  assert.equal(impact.impacts.find((item) => item.kind === 'storage_capacity').source, 'estimate');
  assert.equal(impact.impacts.find((item) => item.kind === 'storage_capacity').deltaM3, 0);
  assert.equal(impact.unresolved.some((item) => item.code === 'STORAGE_CAPACITY_UNSUPPORTED' && item.objectId === 'object-primary-bed'), true);
});
