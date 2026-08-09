import { convexPolygonsOverlap, polygonInsidePolygon, rotatedFootprint, segmentAtOffset } from './geometry.js';

const levelForRule = (rule) => {
  if (rule?.severity === 'warning') return 'warning';
  if (rule?.severity === 'recommendation') return 'recommendation';
  return 'hard_block';
};

const footprintFor = (object) => rotatedFootprint(object.transform, object.dimensions);
const statusForLevel = (level) => (level === 'hard_block' ? 'blocked' : 'warning');
const roomById = (scene) => new Map((scene?.rooms ?? []).map((room) => [room.id, room]));
const surfaceById = (scene) => new Map((scene?.surfaces ?? []).map((surface) => [surface.id, surface]));

const passed = (code, ruleId, message, extra = {}) => ({
  code,
  status: 'passed',
  level: 'passed',
  ruleId,
  objectIds: [],
  message,
  ...extra,
});

const failed = (code, level, ruleId, objectIds, message, extra = {}) => ({
  code,
  status: statusForLevel(level),
  level,
  ruleId,
  objectIds,
  message,
  ...extra,
});

const doorSwingPolygon = (opening, host) => {
  if (!opening.swing || !host?.edge) return null;
  const closed = segmentAtOffset(host.edge, opening.offset, opening.width);
  const hinge = opening.swing.hinge === 'start' ? closed.start : closed.end;
  const leaf = opening.swing.hinge === 'start' ? closed.end : closed.start;
  const dx = leaf.x - hinge.x;
  const dz = leaf.z - hinge.z;
  const length = Math.hypot(dx, dz);
  if (!length) return null;
  const startAngle = Math.atan2(dz, dx);
  const steps = 8;
  const arc = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = startAngle + opening.swing.side * (Math.PI / 2) * (index / steps);
    return { x: hinge.x + Math.cos(angle) * length, z: hinge.z + Math.sin(angle) * length };
  });
  return [hinge, ...arc];
};

const overallStatus = (checks) => {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  return 'passed';
};

/**
 * Deterministic geometry rules shared by manual edits and Agent tools.
 * Structural/schema checks stay in validateScene; this function evaluates
 * relationships that can change after a legal SceneCommand.
 *
 * @param {unknown} scene
 * @returns {{ok:boolean,status:'passed'|'warning'|'blocked',checks:Array<{code:string,status:string,level:string,ruleId:string,objectIds:string[],message:string}>,violations:Array<{code:string,status:string,level:string,ruleId:string,objectIds:string[],message:string}>}}
 */
export function evaluateDesignRules(scene) {
  const checks = [];
  const objects = Array.isArray(scene?.objects) ? scene.objects : [];
  const rules = new Map((scene?.rules ?? []).map((rule) => [rule.id, rule]));
  const rooms = roomById(scene);
  const surfaces = surfaceById(scene);

  for (const object of objects) {
    const room = rooms.get(object.roomId);
    if (room?.polygon && !polygonInsidePolygon(footprintFor(object), room.polygon)) {
      checks.push(failed(
        'ROOM_BOUNDARY',
        'hard_block',
        'rule-room-boundary',
        [object.id],
        `${object.name} 超出所属房间边界。`,
      ));
    } else {
      checks.push(passed('ROOM_BOUNDARY', 'rule-room-boundary', `${object.name} 位于所属房间内。`, { objectIds: [object.id] }));
    }
  }

  let collisionCount = 0;
  for (let first = 0; first < objects.length; first += 1) {
    for (let second = first + 1; second < objects.length; second += 1) {
      const a = objects[first];
      const b = objects[second];
      if (a.roomId !== b.roomId || !convexPolygonsOverlap(footprintFor(a), footprintFor(b))) continue;
      collisionCount += 1;
      checks.push(failed(
        'OBJECT_COLLISION',
        'hard_block',
        'deterministic:object-collision',
        [a.id, b.id].sort(),
        `${a.name} 与 ${b.name} 发生碰撞，请留出实际占用空间。`,
      ));
    }
  }
  if (collisionCount === 0) checks.push(passed('OBJECT_COLLISION', 'deterministic:object-collision', '家具占用空间无碰撞。'));

  for (const zone of scene?.clearanceZones ?? []) {
    const rule = rules.get(zone.ruleIds?.[0]);
    const level = levelForRule(rule);
    let occupied = false;
    for (const object of objects) {
      if (object.roomId !== zone.roomId || !convexPolygonsOverlap(footprintFor(object), zone.polygon)) continue;
      occupied = true;
      checks.push(failed(
        'CLEARANCE_OCCUPIED',
        level,
        rule?.id ?? 'deterministic:clearance',
        [object.id],
        `${object.name} 侵占“${zone.label}”，要求至少保留 ${zone.minimumMm} mm。`,
        {
          clearanceZoneId: zone.id,
          minimumMm: zone.minimumMm,
          valueMm: zone.valueMm,
        },
      ));
    }
    if (!occupied) {
      checks.push(passed('CLEARANCE_OCCUPIED', rule?.id ?? 'deterministic:clearance', `“${zone.label}”未被占用。`, {
        clearanceZoneId: zone.id,
        minimumMm: zone.minimumMm,
        valueMm: zone.valueMm,
      }));
    }
  }

  for (const opening of scene?.openings ?? []) {
    if (!['exterior-door', 'interior-door'].includes(opening.kind)) continue;
    const host = surfaces.get(opening.hostSurfaceId);
    const swing = doorSwingPolygon(opening, host);
    if (!swing) continue;
    const rule = rules.get(opening.ruleIds?.[0]);
    const level = levelForRule(rule);
    let occupied = false;
    for (const object of objects) {
      if (object.roomId !== host.roomId || !convexPolygonsOverlap(footprintFor(object), swing)) continue;
      occupied = true;
      checks.push(failed(
        'DOOR_SWING_OCCUPIED',
        level,
        rule?.id ?? 'rule-opening-clearance',
        [object.id],
        `${object.name} 侵占门扇开启范围。`,
        { openingId: opening.id },
      ));
    }
    if (!occupied) {
      checks.push(passed('DOOR_SWING_OCCUPIED', rule?.id ?? 'rule-opening-clearance', `门洞 ${opening.id} 开启范围未被占用。`, {
        openingId: opening.id,
      }));
    }
  }

  checks.sort((a, b) => `${a.code}:${a.ruleId}:${a.objectIds.join(',')}`.localeCompare(`${b.code}:${b.ruleId}:${b.objectIds.join(',')}`));
  const violations = checks.filter((check) => check.status !== 'passed');
  const status = overallStatus(checks);
  return {
    ok: status !== 'blocked',
    status,
    checks,
    violations,
  };
}

/** @param {unknown} scene */
export function assertDesignRules(scene) {
  const result = evaluateDesignRules(scene);
  if (!result.ok) {
    const blocked = result.violations.filter((violation) => violation.status === 'blocked');
    throw new Error(`DESIGN_RULE_BLOCKED: ${blocked.map((violation) => `${violation.code}: ${violation.message}`).join('; ')}`);
  }
}
