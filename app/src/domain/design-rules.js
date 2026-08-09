import { convexPolygonsOverlap, distance, polygonEdges, polygonInsidePolygon, rotatedFootprint, segmentAtOffset } from './geometry.js';

const levelForRule = (rule) => {
  if (rule?.severity === 'warning') return 'warning';
  if (rule?.severity === 'recommendation') return 'recommendation';
  return 'hard_block';
};

const footprintFor = (object) => rotatedFootprint(object.transform, object.dimensions);
const statusForLevel = (level) => {
  if (level === 'hard_block') return 'blocked';
  if (level === 'recommendation') return 'recommendation';
  return 'warning';
};
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
  if (checks.some((check) => check.status === 'recommendation')) return 'recommendation';
  return 'passed';
};

const centerFor = (object) => ({ x: object.transform.x, z: object.transform.z });

const pointSegmentDistance = (point, segment) => {
  const dx = segment.end.x - segment.start.x;
  const dz = segment.end.z - segment.start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (!lengthSquared) return distance(point, segment.start);
  const t = Math.max(0, Math.min(1, ((point.x - segment.start.x) * dx + (point.z - segment.start.z) * dz) / lengthSquared));
  return distance(point, { x: segment.start.x + dx * t, z: segment.start.z + dz * t });
};

const footprintNearRoomEdge = (object, room, maximumMm) => {
  const edges = polygonEdges(room.polygon);
  return footprintFor(object).some((point) => edges.some((edge) => pointSegmentDistance(point, edge) <= maximumMm));
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

  const sofa = objects.find((object) => object.category === 'sofa');
  const tv = objects.find((object) => object.id === 'object-tv-console');
  const tvRule = rules.get('rule-tv-distance-1800-3600');
  if (sofa && tv) {
    const viewingDistance = Math.round(distance(centerFor(sofa), centerFor(tv)));
    if (viewingDistance < 1800 || viewingDistance > 3600) {
      checks.push(failed(
        'TV_VIEWING_DISTANCE',
        levelForRule(tvRule),
        tvRule?.id ?? 'rule-tv-distance-1800-3600',
        [sofa.id, tv.id],
        `沙发到电视约 ${viewingDistance} mm，建议保持 1800–3600 mm，观看更舒服。`,
        { valueMm: viewingDistance, minimumMm: 1800, maximumMm: 3600 },
      ));
    } else {
      checks.push(passed('TV_VIEWING_DISTANCE', tvRule?.id ?? 'rule-tv-distance-1800-3600', `沙发到电视约 ${viewingDistance} mm，观看距离合适。`, {
        objectIds: [sofa.id, tv.id],
        valueMm: viewingDistance,
        minimumMm: 1800,
        maximumMm: 3600,
      }));
    }
  }

  const antitipRule = rules.get('rule-tall-storage-anchored');
  for (const object of objects.filter((candidate) => candidate.dimensions?.height >= 1050 && /cabinet|wardrobe/.test(candidate.category ?? ''))) {
    if (object.capabilities?.movable) {
      checks.push(failed(
        'TALL_STORAGE_ANCHORED',
        levelForRule(antitipRule),
        antitipRule?.id ?? 'rule-tall-storage-anchored',
        [object.id],
        `${object.name} 较高，儿童家庭建议固定或防倾倒，不应作为可自由移动家具。`,
      ));
    } else {
      checks.push(passed('TALL_STORAGE_ANCHORED', antitipRule?.id ?? 'rule-tall-storage-anchored', `${object.name} 为固定高柜，防倾倒风险已受控。`, { objectIds: [object.id] }));
    }
  }

  const fixedRule = rules.get('rule-fixed-equipment-wall-relation');
  for (const object of objects.filter((candidate) => candidate.ruleIds?.includes('rule-fixed-equipment-wall-relation'))) {
    const room = rooms.get(object.roomId);
    if (room && !footprintNearRoomEdge(object, room, 260)) {
      checks.push(failed(
        'FIXED_EQUIPMENT_RELATION',
        levelForRule(fixedRule),
        fixedRule?.id ?? 'rule-fixed-equipment-wall-relation',
        [object.id],
        `${object.name} 是固定设备，应贴近墙面或预留管线面，不能漂在房间中央。`,
      ));
    } else {
      checks.push(passed('FIXED_EQUIPMENT_RELATION', fixedRule?.id ?? 'rule-fixed-equipment-wall-relation', `${object.name} 与墙面 / 管线关系合理。`, { objectIds: [object.id] }));
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
