import { evaluateDesignRules } from './design-rules.js';

const round2 = (value) => Math.round(value * 100) / 100;
const byId = (records) => new Map((records ?? []).map((record) => [record.id, record]));
const storageCategories = new Set(['fixed-cabinet', 'wardrobe']);
const objectDisplayNames = {
  'object-primary-bed': '双人床',
  'object-primary-wardrobe': '衣柜',
  'object-flex-bed': '单人床',
  'object-flex-desk': '书桌',
  'object-sofa': '沙发',
  'object-tv-console': '电视柜',
  'object-dining-table': '餐桌',
  'object-kitchen-counter': '橱柜',
  'object-shoe-cabinet': '鞋柜',
};
const objectDisplayName = (object) => objectDisplayNames[object.id] ?? object.name;

const objectVolumeM3 = (object) => {
  if (!storageCategories.has(object.category)) return null;
  const { width, depth, height } = object.dimensions ?? {};
  if (![width, depth, height].every(Number.isFinite)) return null;
  return round2((width * depth * height) / 1_000_000_000);
};

const totalStorageM3 = (scene) => round2((scene?.objects ?? []).reduce((sum, object) => sum + (objectVolumeM3(object) ?? 0), 0));

const clearanceStatus = (evaluation, clearanceZoneId) => {
  const checks = evaluation.checks.filter((check) => check.clearanceZoneId === clearanceZoneId);
  if (checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  return 'passed';
};

const clearanceAvailableMm = (evaluation, zone) => (
  clearanceStatus(evaluation, zone.id) === 'passed' ? zone.valueMm : 0
);

const changedObjects = (beforeScene, afterScene) => {
  const before = byId(beforeScene?.objects);
  return (afterScene?.objects ?? [])
    .filter((object) => JSON.stringify(before.get(object.id)) !== JSON.stringify(object))
    .map((object) => ({ before: before.get(object.id), after: object }));
};

/**
 * @param {unknown} beforeScene
 * @param {unknown} afterScene
 */
export function compareDesignImpact(beforeScene, afterScene) {
  const beforeRules = evaluateDesignRules(beforeScene);
  const afterRules = evaluateDesignRules(afterScene);
  if (JSON.stringify(beforeScene) === JSON.stringify(afterScene)) {
    return {
      status: afterRules.status,
      rules: { before: beforeRules, after: afterRules },
      impacts: [],
      unresolved: [],
    };
  }
  const beforeZones = byId(beforeScene?.clearanceZones);
  const afterZones = byId(afterScene?.clearanceZones);
  const impacts = [];
  const unresolved = [];

  for (const [id, afterZone] of afterZones) {
    const beforeZone = beforeZones.get(id);
    if (!beforeZone) continue;
    const beforeStatus = clearanceStatus(beforeRules, id);
    const afterStatus = clearanceStatus(afterRules, id);
    const beforeAvailableMm = clearanceAvailableMm(beforeRules, beforeZone);
    const afterAvailableMm = clearanceAvailableMm(afterRules, afterZone);
    if (beforeStatus !== afterStatus || afterStatus !== 'passed') {
      impacts.push({
        kind: 'clearance',
        clearanceZoneId: id,
        label: afterZone.label,
        beforeStatus,
        afterStatus,
        beforeAvailableMm,
        afterAvailableMm,
        deltaAvailableMm: afterAvailableMm - beforeAvailableMm,
        minimumMm: afterZone.minimumMm,
        valueMm: afterZone.valueMm,
        method: 'protected_zone_occupancy',
      });
    }
  }

  const beforeStorageM3 = totalStorageM3(beforeScene);
  const afterStorageM3 = totalStorageM3(afterScene);
  impacts.push({
    kind: 'storage_capacity',
    beforeM3: beforeStorageM3,
    afterM3: afterStorageM3,
    deltaM3: round2(afterStorageM3 - beforeStorageM3),
    source: 'estimate',
    basis: 'cabinet object dimensions',
  });

  for (const change of changedObjects(beforeScene, afterScene)) {
    if (objectVolumeM3(change.after) !== null) continue;
    unresolved.push({
      code: 'STORAGE_CAPACITY_UNSUPPORTED',
      objectId: change.after.id,
      reason: `${objectDisplayName(change.after)} 不是柜类对象，当前 demo 没有可估算的收纳容量字段。`,
    });
  }

  return {
    status: afterRules.status,
    rules: { before: beforeRules, after: afterRules },
    impacts,
    unresolved,
  };
}
