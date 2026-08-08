import { convexPolygonsOverlap, rotatedFootprint } from './geometry.js';

const levelForRule = (rule) => {
  if (rule?.severity === 'warning') return 'warning';
  if (rule?.severity === 'recommendation') return 'recommendation';
  return 'hard_block';
};

const footprintFor = (object) => rotatedFootprint(object.transform, object.dimensions);

/**
 * Deterministic geometry rules shared by manual edits and Agent tools.
 * Structural/schema checks stay in validateScene; this function evaluates
 * relationships that can change after a legal SceneCommand.
 *
 * @param {unknown} scene
 * @returns {{ok:boolean,violations:Array<{code:string,level:string,ruleId:string,objectIds:string[],message:string}>}}
 */
export function evaluateDesignRules(scene) {
  const violations = [];
  const objects = Array.isArray(scene?.objects) ? scene.objects : [];
  const rules = new Map((scene?.rules ?? []).map((rule) => [rule.id, rule]));

  for (let first = 0; first < objects.length; first += 1) {
    for (let second = first + 1; second < objects.length; second += 1) {
      const a = objects[first];
      const b = objects[second];
      if (a.roomId !== b.roomId || !convexPolygonsOverlap(footprintFor(a), footprintFor(b))) continue;
      violations.push({
        code: 'OBJECT_COLLISION',
        level: 'hard_block',
        ruleId: 'deterministic:object-collision',
        objectIds: [a.id, b.id].sort(),
        message: `${a.name} 与 ${b.name} 发生碰撞，请留出实际占用空间。`,
      });
    }
  }

  for (const zone of scene?.clearanceZones ?? []) {
    const rule = rules.get(zone.ruleIds?.[0]);
    const level = levelForRule(rule);
    for (const object of objects) {
      if (object.roomId !== zone.roomId || !convexPolygonsOverlap(footprintFor(object), zone.polygon)) continue;
      violations.push({
        code: 'CLEARANCE_OCCUPIED',
        level,
        ruleId: rule?.id ?? 'deterministic:clearance',
        objectIds: [object.id],
        message: `${object.name} 侵占“${zone.label}”，要求至少保留 ${zone.minimumMm} mm。`,
      });
    }
  }

  violations.sort((a, b) => `${a.code}:${a.ruleId}:${a.objectIds.join(',')}`.localeCompare(`${b.code}:${b.ruleId}:${b.objectIds.join(',')}`));
  return {
    ok: violations.every((violation) => violation.level !== 'hard_block'),
    violations,
  };
}

/** @param {unknown} scene */
export function assertDesignRules(scene) {
  const result = evaluateDesignRules(scene);
  if (!result.ok) {
    const blocked = result.violations.filter((violation) => violation.level === 'hard_block');
    throw new Error(`DESIGN_RULE_BLOCKED: ${blocked.map((violation) => `${violation.code}: ${violation.message}`).join('; ')}`);
  }
}
