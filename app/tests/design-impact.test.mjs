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
const assertContract = (check, status) => {
  assert.ok(check);
  assert.equal(check.status, status);
  assert.equal(check.source, 'demo');
  assert.equal(typeof check.applicability, 'string');
  assert.ok(check.applicability.length > 6);
  assert.equal(typeof check.suggestion, 'string');
  assert.ok(check.suggestion.length > 8);
};
const violation = (scene, code, status) => evaluateDesignRules(scene).violations.find((check) => (
  check.code === code && (!status || check.status === status)
));

test('design rules return normalized passed warning and blocked checks', () => {
  const result = evaluateDesignRules(createDemoScene());

  assert.equal(result.ok, true);
  assert.equal(result.checks.every((check) => ['passed', 'recommendation', 'warning', 'blocked'].includes(check.status)), true);
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

test('Gate 6 deterministic rules cover eight household-facing cases', () => {
  const base = createDemoScene();
  const pass = evaluateDesignRules(base);
  assert.equal(pass.checks.some((check) => check.code === 'TV_VIEWING_DISTANCE' && check.status === 'passed'), true);
  assert.equal(pass.checks.some((check) => check.code === 'TALL_STORAGE_ANCHORED' && check.status === 'passed'), true);
  assert.equal(pass.checks.some((check) => check.code === 'FIXED_EQUIPMENT_RELATION' && check.status === 'passed'), true);

  const blocked = [
    ['ROOM_BOUNDARY', moveObject(base, 'object-sofa', { x: 100 })],
    ['OBJECT_COLLISION', moveObject(base, 'object-sofa', { x: 6200, z: 5700 })],
    ['CLEARANCE_OCCUPIED', moveObject(base, 'object-sofa', { x: 4600, z: 5200 })],
  ];
  for (const [code, scene] of blocked) {
    assertContract(violation(scene, code, 'blocked'), 'blocked');
  }

  const doorHard = clone(base);
  doorHard.rules.find((rule) => rule.id === 'rule-opening-clearance').severity = 'error';
  assertContract(violation(doorHard, 'DOOR_SWING_OCCUPIED', 'blocked'), 'blocked');

  const tvTooClose = moveObject(base, 'object-sofa', { z: 7000 });
  assertContract(violation(tvTooClose, 'TV_VIEWING_DISTANCE', 'recommendation'), 'recommendation');

  const childSafety = clone(base);
  childSafety.objects.find((object) => object.id === 'object-shoe-cabinet').capabilities.movable = true;
  assertContract(violation(childSafety, 'TALL_STORAGE_ANCHORED', 'warning'), 'warning');

  const fixedEquipment = moveObject(base, 'object-kitchen-counter', { x: 8500, z: 4500 });
  assertContract(violation(fixedEquipment, 'FIXED_EQUIPMENT_RELATION', 'blocked'), 'blocked');

  const allMessages = [
    violation(moveObject(base, 'object-primary-bed', { x: 1100 }), 'CLEARANCE_OCCUPIED').message,
    violation(moveObject(base, 'object-sofa', { x: 6200, z: 5700 }), 'OBJECT_COLLISION').message,
  ].join('\n');
  assert.doesNotMatch(allMessages, /Double Bed|Sofa|Dining Table|Kitchen Run/);
  assert.match(allMessages, /双人床|沙发|餐桌/);
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
      beforeAvailableMm: 600,
      afterAvailableMm: 0,
      deltaAvailableMm: -600,
      minimumMm: 600,
      valueMm: 600,
      method: 'protected_zone_occupancy',
    },
  );
  assert.equal(impact.impacts.find((item) => item.kind === 'storage_capacity').source, 'estimate');
  assert.equal(impact.impacts.find((item) => item.kind === 'storage_capacity').deltaM3, 0);
  assert.equal(impact.unresolved.some((item) => item.code === 'STORAGE_CAPACITY_UNSUPPORTED' && item.objectId === 'object-primary-bed'), true);
  assert.doesNotMatch(impact.unresolved.map((item) => item.reason).join('\n'), /Double Bed|Sofa/);
});

test('impact report is empty when comparing the same version scene', () => {
  const scene = createDemoScene();
  const impact = compareDesignImpact(scene, scene);

  assert.equal(impact.impacts.length, 0);
  assert.equal(impact.unresolved.length, 0);
});
