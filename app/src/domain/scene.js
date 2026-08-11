import {
  distance,
  isSimplePolygon,
  polygonArea,
  polygonEdges,
  polygonInsidePolygon,
  objectCollisionFootprint,
  segmentOnSegment,
} from './geometry.js';
import { assertDesignRules } from './design-rules.js';

const ADDRESSABLE_ARRAY_KEYS = new Set([
  'rooms',
  'surfaces',
  'openings',
  'objects',
  'materials',
  'rules',
  'cameraPresets',
  'clearanceZones',
]);

const OBJECT_CAPABILITIES = [
  'selectable',
  'movable',
  'rotatable',
  'replaceable',
  'deletable',
  'duplicable',
  'materialEditable',
  'parameterEditable',
];

const OBJECT_LAYERS = new Set(['furniture', 'fixed_installation', 'equipment', 'service']);
const MODEL_SOURCES = new Set(['generated', 'ai-generated', 'enterprise']);
const REVIEW_STATUSES = new Set(['not_required', 'required', 'approved', 'returned']);
const SURFACE_KINDS = new Set(['wall', 'floor', 'ceiling']);
const MATERIAL_TARGETS = new Set(['object', 'opening', ...SURFACE_KINDS]);

/**
 * @typedef {{code:string,path:string,message:string}} SceneValidationError
 * @typedef {{ok:boolean,errors:SceneValidationError[]}} SceneValidationResult
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isInteger(value) {
  return Number.isInteger(value);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPoint(value) {
  return isObject(value) && isInteger(value.x) && isInteger(value.z);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPolygon(value) {
  return Array.isArray(value) && value.length >= 3 && value.every(isPoint);
}

/**
 * @param {SceneValidationError[]} errors
 * @param {string} code
 * @param {string} path
 * @param {string} message
 */
function addError(errors, code, path, message) {
  errors.push({ code, path, message });
}

/**
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
export function deepFreeze(value) {
  if (!isObject(value) && !Array.isArray(value)) return value;
  for (const property of Object.getOwnPropertyNames(value)) {
    deepFreeze(value[property]);
  }
  return Object.freeze(value);
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function stableClone(value) {
  if (Array.isArray(value)) {
    return value.map(stableClone);
  }
  if (!isObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => {
        const child = value[key];
        const cloned =
          ADDRESSABLE_ARRAY_KEYS.has(key) && Array.isArray(child)
            ? [...child].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(stableClone)
            : stableClone(child);
        return [key, cloned];
      }),
  );
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {unknown} scene
 * @returns {string}
 */
export function serializeScene(scene) {
  return JSON.stringify(stableClone(scene));
}

/**
 * @param {string} serialized
 * @returns {Readonly<unknown>}
 */
export function deserializeScene(serialized) {
  const scene = JSON.parse(serialized);
  assertValidScene(scene);
  return deepFreeze(stableClone(scene));
}

/**
 * @param {unknown[]} records
 * @returns {Map<string, unknown>}
 */
function mapById(records) {
  return new Map(records.filter((record) => isObject(record)).map((record) => [record.id, record]));
}

function materialAppliesTo(material, target) {
  return Array.isArray(material?.appliesTo) && material.appliesTo.includes(target);
}

/**
 * @param {unknown} scene
 * @returns {SceneValidationResult}
 */
export function validateScene(scene) {
  const errors = [];
  if (!isObject(scene)) {
    addError(errors, 'SCENE_INVALID', '$', 'Scene must be an object.');
    return { ok: false, errors };
  }

  const floorPlan = scene.floorPlan;
  const rooms = Array.isArray(scene.rooms) ? scene.rooms : [];
  const surfaces = Array.isArray(scene.surfaces) ? scene.surfaces : [];
  const openings = Array.isArray(scene.openings) ? scene.openings : [];
  const objects = Array.isArray(scene.objects) ? scene.objects : [];
  const materials = Array.isArray(scene.materials) ? scene.materials : [];
  const rules = Array.isArray(scene.rules) ? scene.rules : [];
  const cameraPresets = Array.isArray(scene.cameraPresets) ? scene.cameraPresets : [];
  const clearanceZones = Array.isArray(scene.clearanceZones) ? scene.clearanceZones : [];
  const allRecords = [scene, floorPlan, ...rooms, ...surfaces, ...openings, ...objects, ...materials, ...rules, ...cameraPresets, ...clearanceZones];

  for (const [index, record] of allRecords.entries()) {
    if (!isObject(record) || typeof record.id !== 'string' || record.id.length === 0) {
      addError(errors, 'ID_INVALID', `records[${index}]`, 'Every addressable record needs a non-empty string id.');
    }
  }

  for (const key of ['rooms', 'surfaces', 'openings', 'objects', 'materials', 'rules', 'cameraPresets', 'clearanceZones']) {
    if (!Array.isArray(scene[key])) {
      addError(errors, 'SCENE_ARRAY_INVALID', key, `${key} must be an array.`);
    }
  }

  if (scene.schemaVersion !== 1) {
    addError(errors, 'SCHEMA_VERSION_UNSUPPORTED', 'schemaVersion', 'schemaVersion must be 1.');
  }

  const seenIds = new Map();
  for (const record of allRecords.filter(isObject)) {
    if (typeof record.id !== 'string') continue;
    if (seenIds.has(record.id)) {
      addError(errors, 'DUPLICATE_ID', record.id, `ID "${record.id}" is reused.`);
    }
    seenIds.set(record.id, true);
  }

  if (!isObject(floorPlan)) {
    addError(errors, 'FLOORPLAN_INVALID', 'floorPlan', 'floorPlan is required.');
  } else {
    if (floorPlan.units !== 'mm') {
      addError(errors, 'FLOORPLAN_UNITS_INVALID', 'floorPlan.units', 'floorPlan units must be integer millimeters.');
    }
    if (floorPlan.origin !== 'northwest-floor') {
      addError(errors, 'FLOORPLAN_ORIGIN_INVALID', 'floorPlan.origin', 'floorPlan origin must be northwest floor.');
    }
    if (floorPlan.axes?.x !== 'east' || floorPlan.axes?.y !== 'up' || floorPlan.axes?.z !== 'south') {
      addError(errors, 'FLOORPLAN_AXES_INVALID', 'floorPlan.axes', 'Axes must be x east, y up, z south.');
    }
    if (
      !isObject(floorPlan.bounds) ||
      floorPlan.bounds.x !== 0 ||
      floorPlan.bounds.z !== 0 ||
      !isPositiveInteger(floorPlan.bounds.width) ||
      !isPositiveInteger(floorPlan.bounds.depth) ||
      !isPositiveInteger(floorPlan.bounds.height)
    ) {
      addError(errors, 'FLOORPLAN_BOUNDS_INVALID', 'floorPlan.bounds', 'Bounds must start at 0,0 with positive width/depth/height.');
    }
  }

  const roomMap = mapById(rooms);
  const surfaceMap = mapById(surfaces);
  const materialMap = mapById(materials);
  const ruleMap = mapById(rules);
  const objectMap = mapById(objects);
  const cameraPresetMap = mapById(cameraPresets);
  const modelSlotIds = new Set();

  for (const [index, material] of materials.entries()) {
    const path = `materials[${index}]`;
    if (!isObject(material)) continue;
    if (
      typeof material.name !== 'string' || !material.name ||
      typeof material.kind !== 'string' || !material.kind ||
      !['demo', 'enterprise'].includes(material.source) ||
      !Array.isArray(material.appliesTo) || !material.appliesTo.length ||
      material.appliesTo.some((target) => !MATERIAL_TARGETS.has(target))
    ) {
      addError(errors, 'MATERIAL_INVALID', path, 'Material needs a name, kind, source, and valid appliesTo targets.');
    }
  }

  for (const [index, preset] of cameraPresets.entries()) {
    if (isObject(preset) && preset.kind !== 'whole_home' && !roomMap.has(preset.roomId)) {
      addError(errors, 'ROOM_REF_DANGLING', `cameraPresets[${index}].roomId`, `Camera preset room "${preset.roomId}" does not exist.`);
    }
    if (
      isObject(preset) &&
      (!isObject(preset.position) || !isObject(preset.target) ||
        ['x', 'y', 'z'].some((axis) => !isNumber(preset.position[axis]) || !isNumber(preset.target[axis])))
    ) {
      addError(errors, 'CAMERA_PRESET_TRANSFORM_INVALID', `cameraPresets[${index}]`, 'Camera presets need numeric position and target vectors.');
    }
    if (isObject(preset) && preset.surfaceId && !surfaceMap.has(preset.surfaceId)) {
      addError(errors, 'SURFACE_REF_DANGLING', `cameraPresets[${index}].surfaceId`, `Camera preset surface "${preset.surfaceId}" does not exist.`);
    }
    if (isObject(preset) && preset.objectId && !objectMap.has(preset.objectId)) {
      addError(errors, 'OBJECT_REF_DANGLING', `cameraPresets[${index}].objectId`, `Camera preset object "${preset.objectId}" does not exist.`);
    }
  }

  for (const [index, room] of rooms.entries()) {
    const path = `rooms[${index}]`;
    if (!isObject(room)) continue;
    if (!isPolygon(room.polygon)) {
      addError(errors, 'ROOM_POLYGON_INVALID', `${path}.polygon`, 'Room polygon must have at least three plan points.');
    } else {
      if (polygonArea(room.polygon) <= 0) {
        addError(errors, 'ROOM_POLYGON_NON_POSITIVE', `${path}.polygon`, 'Room polygon must have positive clockwise plan area.');
      }
      if (!isSimplePolygon(room.polygon)) {
        addError(errors, 'ROOM_POLYGON_COMPLEX', `${path}.polygon`, 'Room polygon must not self-intersect.');
      }
    }

    for (const adjacentId of room.adjacentRoomIds ?? []) {
      const adjacentRoom = roomMap.get(adjacentId);
      if (!adjacentRoom) {
        addError(errors, 'ROOM_REF_DANGLING', `${path}.adjacentRoomIds`, `Adjacent room "${adjacentId}" does not exist.`);
      } else if (!adjacentRoom.adjacentRoomIds?.includes(room.id)) {
        addError(errors, 'ROOM_ADJACENCY_NOT_RECIPROCAL', `${path}.adjacentRoomIds`, `Adjacent room "${adjacentId}" must reference "${room.id}".`);
      }
    }

    for (const presetId of room.cameraPresetIds ?? []) {
      if (!cameraPresetMap.has(presetId)) {
        addError(errors, 'CAMERA_PRESET_REF_DANGLING', `${path}.cameraPresetIds`, `Camera preset "${presetId}" does not exist.`);
      }
    }
  }

  for (const [index, surface] of surfaces.entries()) {
    const path = `surfaces[${index}]`;
    if (!isObject(surface)) continue;
    const room = roomMap.get(surface.roomId);
    if (!room) {
      addError(errors, 'SURFACE_ROOM_REF_DANGLING', `${path}.roomId`, `Surface room "${surface.roomId}" does not exist.`);
    }
    const material = materialMap.get(surface.materialId);
    if (!material) {
      addError(errors, 'MATERIAL_REF_DANGLING', `${path}.materialId`, `Surface material "${surface.materialId}" does not exist.`);
    } else if (!materialAppliesTo(material, surface.kind)) {
      addError(errors, 'SURFACE_MATERIAL_INCOMPATIBLE', `${path}.materialId`, `Material "${surface.materialId}" does not apply to ${surface.kind}.`);
    }
    if (!SURFACE_KINDS.has(surface.kind)) {
      addError(errors, 'SURFACE_KIND_INVALID', `${path}.kind`, 'Surface kind must be wall, floor, or ceiling.');
    }
    if (!isObject(surface.capabilities) || typeof surface.capabilities.materialEditable !== 'boolean') {
      addError(errors, 'SURFACE_CAPABILITIES_INVALID', `${path}.capabilities`, 'Surface capabilities must declare materialEditable.');
    }
    if (!['demo', 'enterprise'].includes(surface.source)) {
      addError(errors, 'SURFACE_SOURCE_INVALID', `${path}.source`, 'Surface source must be demo or enterprise.');
    }
    for (const ruleId of surface.ruleIds ?? []) {
      if (!ruleMap.has(ruleId)) {
        addError(errors, 'RULE_REF_DANGLING', `${path}.ruleIds`, `Rule "${ruleId}" does not exist.`);
      }
    }
    if (surface.kind === 'wall') {
      if (!isPoint(surface.edge?.start) || !isPoint(surface.edge?.end)) {
        addError(errors, 'WALL_EDGE_INVALID', `${path}.edge`, 'Wall surface needs a start and end edge.');
      } else if (room?.polygon && !polygonEdges(room.polygon).some((edge) => segmentOnSegment(surface.edge, edge))) {
        addError(errors, 'WALL_EDGE_OFF_BOUNDARY', `${path}.edge`, `Wall "${surface.id}" must lie on its room boundary.`);
      }
      if (!isPositiveInteger(surface.height) || !isPositiveInteger(surface.thickness)) {
        addError(errors, 'WALL_DIMENSIONS_INVALID', path, 'Wall height and thickness must be positive integer millimeters.');
      }
    } else if (surface.kind === 'floor' || surface.kind === 'ceiling') {
      if (!isPolygon(surface.polygon) || polygonArea(surface.polygon) <= 0 || !isSimplePolygon(surface.polygon)) {
        addError(errors, surface.kind === 'floor' ? 'FLOOR_POLYGON_INVALID' : 'CEILING_POLYGON_INVALID', `${path}.polygon`, `${surface.kind} surface needs a simple positive polygon in integer millimeters.`);
      } else if (
        room?.polygon &&
        (!polygonInsidePolygon(surface.polygon, room.polygon) || !polygonInsidePolygon(room.polygon, surface.polygon))
      ) {
        addError(errors, surface.kind === 'floor' ? 'FLOOR_ROOM_MISMATCH' : 'CEILING_ROOM_MISMATCH', `${path}.polygon`, `${surface.kind} "${surface.id}" must match its room boundary.`);
      }
      if (surface.kind === 'ceiling' && (!isPositiveInteger(surface.elevation) || surface.elevation > floorPlan?.bounds?.height)) {
        addError(errors, 'CEILING_ELEVATION_INVALID', `${path}.elevation`, 'Ceiling elevation must be a positive integer within floor-plan height.');
      }
    }
  }

  for (const room of rooms.filter(isObject)) {
    for (const kind of ['floor', 'ceiling']) {
      if (surfaces.filter((surface) => surface?.roomId === room.id && surface.kind === kind).length !== 1) {
        addError(errors, 'ROOM_SURFACE_CARDINALITY_INVALID', `rooms.${room.id}`, `Room "${room.id}" needs exactly one ${kind} surface.`);
      }
    }
  }

  for (const [index, opening] of openings.entries()) {
    const path = `openings[${index}]`;
    if (!isObject(opening)) continue;
    const host = surfaceMap.get(opening.hostSurfaceId);
    if (!host) {
      addError(errors, 'OPENING_HOST_REF_DANGLING', `${path}.hostSurfaceId`, `Host surface "${opening.hostSurfaceId}" does not exist.`);
      continue;
    }
    if (host.kind !== 'wall') {
      addError(errors, 'OPENING_HOST_INVALID', `${path}.hostSurfaceId`, 'Opening host must be a wall surface.');
    }
    if (opening.materialId) {
      const material = materialMap.get(opening.materialId);
      if (!material) addError(errors, 'MATERIAL_REF_DANGLING', `${path}.materialId`, `Opening material "${opening.materialId}" does not exist.`);
      else if (!materialAppliesTo(material, 'opening')) addError(errors, 'OPENING_MATERIAL_INCOMPATIBLE', `${path}.materialId`, `Material "${opening.materialId}" does not apply to openings.`);
    }
    for (const ruleId of opening.ruleIds ?? []) {
      if (!ruleMap.has(ruleId)) {
        addError(errors, 'RULE_REF_DANGLING', `${path}.ruleIds`, `Rule "${ruleId}" does not exist.`);
      }
    }
    for (const roomId of opening.connectsRoomIds ?? []) {
      if (!roomMap.has(roomId)) {
        addError(errors, 'ROOM_REF_DANGLING', `${path}.connectsRoomIds`, `Opening connected room "${roomId}" does not exist.`);
      }
    }
    if (!isPositiveInteger(opening.width) || !isPositiveInteger(opening.height) || !isNonNegativeInteger(opening.offset) || !isNonNegativeInteger(opening.sillHeight)) {
      addError(errors, 'OPENING_DIMENSIONS_INVALID', path, 'Opening width/height/offset/sillHeight must be integer millimeters.');
    } else if (host?.edge) {
      const hostLength = distance(host.edge.start, host.edge.end);
      if (opening.offset < 0 || opening.offset + opening.width > hostLength) {
        addError(errors, 'OPENING_OUTSIDE_HOST', path, `Opening "${opening.id}" must fit within host wall length.`);
      }
      if (floorPlan?.bounds && (opening.sillHeight < 0 || opening.sillHeight + opening.height > floorPlan.bounds.height)) {
        addError(errors, 'OPENING_HEIGHT_INVALID', path, `Opening "${opening.id}" must fit within floor height.`);
      }
    }
    if (
      ['exterior-door', 'interior-door'].includes(opening.kind) &&
      (!isObject(opening.swing) || !['start', 'end'].includes(opening.swing.hinge) || ![-1, 1].includes(opening.swing.side))
    ) {
      addError(errors, 'OPENING_SWING_INVALID', `${path}.swing`, 'Swing doors need a start/end hinge and side -1 or 1.');
    }
  }

  for (const [index, object] of objects.entries()) {
    const path = `objects[${index}]`;
    if (!isObject(object)) continue;
    const room = roomMap.get(object.roomId);
    if (!room) {
      addError(errors, 'OBJECT_ROOM_REF_DANGLING', `${path}.roomId`, `Object room "${object.roomId}" does not exist.`);
    }
    const material = materialMap.get(object.materialId);
    if (!material) {
      addError(errors, 'MATERIAL_REF_DANGLING', `${path}.materialId`, `Object material "${object.materialId}" does not exist.`);
    } else if (!materialAppliesTo(material, 'object')) {
      addError(errors, 'OBJECT_MATERIAL_INCOMPATIBLE', `${path}.materialId`, `Material "${object.materialId}" does not apply to objects.`);
    }
    if (typeof object.externalId !== 'string' || !object.externalId || !['demo', 'enterprise'].includes(object.source)) {
      addError(errors, 'OBJECT_PROVENANCE_INVALID', path, 'Object must declare an externalId and demo or enterprise source.');
    }
    if (object.preferredCameraPresetId) {
      const preset = cameraPresetMap.get(object.preferredCameraPresetId);
      if (!preset) {
        addError(errors, 'CAMERA_PRESET_REF_DANGLING', `${path}.preferredCameraPresetId`, `Camera preset "${object.preferredCameraPresetId}" does not exist.`);
      } else if (preset.roomId !== object.roomId) {
        addError(errors, 'CAMERA_PRESET_ROOM_MISMATCH', `${path}.preferredCameraPresetId`, `Camera preset "${object.preferredCameraPresetId}" must belong to object room "${object.roomId}".`);
      }
    }
    for (const ruleId of object.ruleIds ?? []) {
      if (!ruleMap.has(ruleId)) {
        addError(errors, 'RULE_REF_DANGLING', `${path}.ruleIds`, `Rule "${ruleId}" does not exist.`);
      }
    }
    if (
      !isObject(object.dimensions) ||
      !isPositiveInteger(object.dimensions.width) ||
      !isPositiveInteger(object.dimensions.depth) ||
      !isPositiveInteger(object.dimensions.height)
    ) {
      addError(errors, 'OBJECT_DIMENSIONS_INVALID', `${path}.dimensions`, 'Object dimensions must be positive integer millimeters.');
    }
    if (
      !isObject(object.transform) ||
      !isInteger(object.transform.x) ||
      !isInteger(object.transform.y) ||
      !isInteger(object.transform.z) ||
      !isNumber(object.transform.rotationY)
    ) {
      addError(errors, 'OBJECT_TRANSFORM_INVALID', `${path}.transform`, 'Object transform must include integer x/y/z millimeters and numeric rotationY.');
    }
    if (!isObject(object.capabilities) || OBJECT_CAPABILITIES.some((capability) => typeof object.capabilities[capability] !== 'boolean')) {
      addError(errors, 'OBJECT_CAPABILITIES_INVALID', `${path}.capabilities`, 'Object capabilities must explicitly declare every editable capability.');
    }
    if (
      !isObject(object.hierarchy) ||
      object.hierarchy.parentId !== object.roomId ||
      !OBJECT_LAYERS.has(object.hierarchy.layer) ||
      (object.hierarchy.layer === 'fixed_installation' && object.capabilities?.movable)
    ) {
      addError(errors, 'OBJECT_HIERARCHY_INVALID', `${path}.hierarchy`, 'Object hierarchy must place a valid layer under its owning room; fixed installations cannot move.');
    }
    const hostSurface = surfaceMap.get(object.placement?.hostSurfaceId);
    if (
      !isObject(object.placement) ||
      object.placement.mode !== 'surface_anchored' ||
      !hostSurface ||
      hostSurface.roomId !== object.roomId ||
      !isObject(object.placement.offset) ||
      ['x', 'y', 'z'].some((axis) => !isInteger(object.placement.offset[axis]))
    ) {
      addError(errors, 'OBJECT_PLACEMENT_INVALID', `${path}.placement`, 'Object placement must reference a surface in the same room with integer millimeter offsets.');
    }
    if (
      !isObject(object.collision) ||
      object.collision.kind !== 'box' ||
      object.collision.participates !== true ||
      !['canonical', 'manual', 'enterprise'].includes(object.collision.source) ||
      !isObject(object.collision.dimensions) ||
      !isPositiveInteger(object.collision.dimensions.width) ||
      !isPositiveInteger(object.collision.dimensions.depth) ||
      !isPositiveInteger(object.collision.dimensions.height) ||
      !isObject(object.collision.offset) ||
      ['x', 'y', 'z'].some((axis) => !isInteger(object.collision.offset[axis]))
    ) {
      addError(errors, 'OBJECT_COLLISION_INVALID', `${path}.collision`, 'Object collision must be an enabled box proxy in integer millimeters.');
    }
    if (
      !isObject(object.review) ||
      typeof object.review.requiresProfessionalReview !== 'boolean' ||
      !REVIEW_STATUSES.has(object.review.status) ||
      !Array.isArray(object.review.reasons) ||
      object.review.reasons.some((reason) => typeof reason !== 'string' || !reason) ||
      !['demo', 'estimate', 'enterprise'].includes(object.review.source) ||
      (object.review.requiresProfessionalReview ? object.review.status === 'not_required' : object.review.status !== 'not_required')
    ) {
      addError(errors, 'OBJECT_REVIEW_INVALID', `${path}.review`, 'Object review must explicitly declare whether professional verification is required.');
    }
    if (
      !isObject(object.media2D) ||
      typeof object.media2D.src !== 'string' ||
      !object.media2D.src.startsWith('/assets/') ||
      object.media2D.source !== 'generated' ||
      object.media2D.view !== 'orthographic-top'
    ) {
      addError(
        errors,
        'OBJECT_MEDIA2D_INVALID',
        `${path}.media2D`,
        'Object media2D must reference a generated orthographic-top asset under /assets/.',
      );
    }
    const model = object.model3D;
    const modelBoundsValid = isObject(model?.renderBounds) &&
      isPositiveInteger(model.renderBounds.width) &&
      isPositiveInteger(model.renderBounds.depth) &&
      isPositiveInteger(model.renderBounds.height);
    const provenanceValid = isObject(model?.provenance) &&
      typeof model.provenance.provider === 'string' && Boolean(model.provenance.provider) &&
      typeof model.provenance.generationId === 'string' && Boolean(model.provenance.generationId) &&
      typeof model.provenance.humanReviewed === 'boolean';
    if (
      !isObject(model) ||
      typeof model.src !== 'string' ||
      !/^\/assets\/models\/[A-Za-z0-9][A-Za-z0-9._-]*\.glb$/.test(model.src) ||
      model.format !== 'glb' ||
      !MODEL_SOURCES.has(model.source) ||
      typeof model.slotId !== 'string' || !model.slotId ||
      !isPositiveInteger(model.revision) ||
      model.units !== 'mm' || model.upAxis !== 'y' || model.forwardAxis !== 'z' ||
      !modelBoundsValid || !provenanceValid ||
      (model.source === 'generated' && model.generator !== 'scripts/build_demo_assets.py')
    ) {
      addError(
        errors,
        'OBJECT_MODEL3D_INVALID',
        `${path}.model3D`,
        'Object model3D must use a unique local GLB slot with dimensions, axes, revision, and traceable provenance.',
      );
    }
    if (modelSlotIds.has(model?.slotId)) addError(errors, 'MODEL_SLOT_DUPLICATE', `${path}.model3D.slotId`, `Model slot "${model.slotId}" is reused.`);
    if (typeof model?.slotId === 'string') modelSlotIds.add(model.slotId);
    if (room?.polygon && object.dimensions && object.transform) {
      const footprint = objectCollisionFootprint(object);
      if (!polygonInsidePolygon(footprint, room.polygon)) {
        addError(errors, 'OBJECT_FOOTPRINT_OUTSIDE_ROOM', path, `Object "${object.id}" footprint must stay inside owning room.`);
      }
    }
  }

  for (const [index, zone] of clearanceZones.entries()) {
    const path = `clearanceZones[${index}]`;
    if (!isObject(zone)) continue;
    const room = roomMap.get(zone.roomId);
    if (!room) {
      addError(errors, 'CLEARANCE_ROOM_REF_DANGLING', `${path}.roomId`, `Clearance zone room "${zone.roomId}" does not exist.`);
    }
    for (const ruleId of zone.ruleIds ?? []) {
      if (!ruleMap.has(ruleId)) {
        addError(errors, 'RULE_REF_DANGLING', `${path}.ruleIds`, `Rule "${ruleId}" does not exist.`);
      }
    }
    if (!isPositiveInteger(zone.valueMm) || !isPositiveInteger(zone.minimumMm)) {
      addError(errors, 'CLEARANCE_DIMENSIONS_INVALID', path, 'Clearance values must be positive integer millimeters.');
    }
    if (!isPolygon(zone.polygon) || polygonArea(zone.polygon) <= 0 || !isSimplePolygon(zone.polygon)) {
      addError(errors, 'CLEARANCE_POLYGON_INVALID', `${path}.polygon`, 'Clearance zone needs a simple positive polygon in integer millimeters.');
    } else if (room?.polygon && !polygonInsidePolygon(zone.polygon, room.polygon)) {
      addError(errors, 'CLEARANCE_OUTSIDE_ROOM', `${path}.polygon`, `Clearance zone "${zone.id}" must stay inside its room.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * @param {unknown} scene
 */
export function assertValidScene(scene) {
  const result = validateScene(scene);
  if (!result.ok) {
    const detail = result.errors.map((error) => `${error.code}: ${error.message}`).join('; ');
    throw new Error(`Invalid scene: ${detail}`);
  }
}

/**
 * @param {unknown} initialScene
 * @returns {Readonly<{currentScene:unknown,commands:unknown[]}>}
 */
export function createSceneStore(initialScene) {
  const canonicalScene = deserializeScene(serializeScene(initialScene));
  assertDesignRules(canonicalScene);
  return deepFreeze({
    initialScene: canonicalScene,
    currentScene: canonicalScene,
    commands: [],
    cursor: 0,
  });
}

/**
 * @param {unknown} scene
 * @param {unknown} command
 * @returns {Readonly<unknown>}
 */
function applySceneCommand(scene, command) {
  if (!isObject(command) || typeof command.type !== 'string') {
    throw new Error('Invalid scene command.');
  }

  const nextScene = jsonClone(scene);

  if (command.type === 'object.setTransform') {
    const object = nextScene.objects?.find((candidate) => candidate.id === command.objectId);
    if (!object) throw new Error(`OBJECT_NOT_FOUND: Object "${command.objectId}" does not exist.`);
    if (!object.capabilities.movable) throw new Error(`OBJECT_NOT_MOVABLE: Object "${command.objectId}" cannot move.`);
    if (!isObject(command.transform)) throw new Error('TRANSFORM_INVALID: transform is required.');
    const rotationChanged = command.transform.rotationY !== undefined && command.transform.rotationY !== object.transform.rotationY;
    if (rotationChanged && !object.capabilities.rotatable) {
      throw new Error(`OBJECT_NOT_ROTATABLE: Object "${command.objectId}" cannot rotate.`);
    }
    object.transform = { ...object.transform, ...command.transform };
  } else if (command.type === 'object.setMaterial') {
    const object = nextScene.objects?.find((candidate) => candidate.id === command.objectId);
    if (!object) throw new Error(`OBJECT_NOT_FOUND: Object "${command.objectId}" does not exist.`);
    if (!object.capabilities.materialEditable) throw new Error(`OBJECT_MATERIAL_LOCKED: Object "${command.objectId}" material is locked.`);
    const material = nextScene.materials?.find((candidate) => candidate.id === command.materialId);
    if (!material) throw new Error(`MATERIAL_NOT_FOUND: Material "${command.materialId}" does not exist.`);
    if (!materialAppliesTo(material, 'object')) throw new Error(`OBJECT_MATERIAL_INCOMPATIBLE: Material "${command.materialId}" does not apply to objects.`);
    object.materialId = command.materialId;
  } else if (command.type === 'object.setDimensions') {
    const object = nextScene.objects?.find((candidate) => candidate.id === command.objectId);
    if (!object) throw new Error(`OBJECT_NOT_FOUND: Object "${command.objectId}" does not exist.`);
    if (!object.capabilities.parameterEditable) throw new Error(`OBJECT_PARAMETERS_LOCKED: Object "${command.objectId}" dimensions are locked.`);
    if (!isObject(command.dimensions)) throw new Error('DIMENSIONS_INVALID: dimensions are required.');
    const dimensions = { ...object.dimensions, ...command.dimensions };
    if (![dimensions.width, dimensions.depth, dimensions.height].every(isPositiveInteger)) {
      throw new Error('DIMENSIONS_INVALID: dimensions must be positive integer millimeters.');
    }
    object.dimensions = dimensions;
    if (object.collision?.source === 'canonical') object.collision.dimensions = { ...dimensions };
    if (object.model3D?.renderBounds) object.model3D.renderBounds = { ...dimensions };
  } else if (command.type === 'object.setModelAsset') {
    const object = nextScene.objects?.find((candidate) => candidate.id === command.objectId);
    if (!object) throw new Error(`OBJECT_NOT_FOUND: Object "${command.objectId}" does not exist.`);
    if (!object.capabilities.replaceable) throw new Error(`OBJECT_NOT_REPLACEABLE: Object "${command.objectId}" model is locked.`);
    if (!isObject(command.model3D)) throw new Error('MODEL_ASSET_INVALID: model3D is required.');
    if (command.model3D.source && command.model3D.source !== object.model3D.source && !isObject(command.model3D.provenance)) {
      throw new Error('MODEL_PROVENANCE_REQUIRED: a new asset source needs provider and generation metadata.');
    }
    object.model3D = {
      ...object.model3D,
      ...command.model3D,
      slotId: object.model3D.slotId,
      revision: object.model3D.revision + 1,
    };
    if (object.model3D.source !== 'generated' && command.model3D.generator === undefined) delete object.model3D.generator;
    if (object.model3D.provenance.humanReviewed === false) {
      object.review = {
        requiresProfessionalReview: true,
        status: 'required',
        reasons: [...new Set([...object.review.reasons, 'ai_model_requires_asset_review'])],
        source: 'estimate',
      };
    }
  } else if (command.type === 'object.duplicate') {
    const object = nextScene.objects?.find((candidate) => candidate.id === command.objectId);
    if (!object) throw new Error(`OBJECT_NOT_FOUND: Object "${command.objectId}" does not exist.`);
    if (!object.capabilities.duplicable) throw new Error(`OBJECT_NOT_DUPLICABLE: Object "${command.objectId}" cannot be duplicated.`);
    if (typeof command.newObjectId !== 'string' || !command.newObjectId || nextScene.objects.some((candidate) => candidate.id === command.newObjectId)) {
      throw new Error('OBJECT_ID_INVALID: duplicate needs a unique newObjectId.');
    }
    if (typeof command.externalId !== 'string' || !command.externalId) throw new Error('OBJECT_PROVENANCE_INVALID: duplicate needs an externalId.');
    if (!isObject(command.transform)) throw new Error('TRANSFORM_INVALID: duplicate needs a transform.');
    const room = nextScene.rooms.find((candidate) => candidate.id === object.roomId);
    nextScene.objects.push({
      ...object,
      id: command.newObjectId,
      externalId: command.externalId,
      name: `${object.name} Copy`,
      preferredCameraPresetId: room?.cameraPresetIds?.[0] ?? null,
      transform: { ...object.transform, ...command.transform },
      model3D: { ...object.model3D, slotId: `slot-${command.newObjectId}` },
    });
  } else if (command.type === 'object.delete') {
    const index = nextScene.objects?.findIndex((candidate) => candidate.id === command.objectId) ?? -1;
    if (index < 0) throw new Error(`OBJECT_NOT_FOUND: Object "${command.objectId}" does not exist.`);
    const object = nextScene.objects[index];
    if (!object.capabilities.deletable) throw new Error(`OBJECT_NOT_DELETABLE: Object "${command.objectId}" cannot be deleted.`);
    nextScene.objects.splice(index, 1);
    nextScene.cameraPresets = nextScene.cameraPresets.filter((preset) => preset.objectId !== object.id);
  } else if (command.type === 'surface.setMaterial') {
    const surface = nextScene.surfaces?.find((candidate) => candidate.id === command.surfaceId);
    if (!surface) throw new Error(`SURFACE_NOT_FOUND: Surface "${command.surfaceId}" does not exist.`);
    if (!surface.capabilities?.materialEditable) throw new Error(`SURFACE_MATERIAL_LOCKED: Surface "${command.surfaceId}" material is locked.`);
    const material = nextScene.materials?.find((candidate) => candidate.id === command.materialId);
    if (!material) throw new Error(`MATERIAL_NOT_FOUND: Material "${command.materialId}" does not exist.`);
    if (!materialAppliesTo(material, surface.kind)) throw new Error(`SURFACE_MATERIAL_INCOMPATIBLE: Material "${command.materialId}" does not apply to ${surface.kind}.`);
    surface.materialId = command.materialId;
  } else {
    throw new Error(`COMMAND_UNSUPPORTED: ${command.type}`);
  }

  assertValidScene(nextScene);
  assertDesignRules(nextScene);
  return deserializeScene(serializeScene(nextScene));
}

/**
 * @param {unknown} initialScene
 * @param {unknown[]} commands
 * @returns {Readonly<unknown>}
 */
export function replaySceneCommands(initialScene, commands) {
  return commands.reduce((scene, command) => applySceneCommand(scene, command), deserializeScene(serializeScene(initialScene)));
}

/**
 * @param {Readonly<{initialScene:unknown,currentScene:unknown,commands:unknown[],cursor:number}>} store
 * @param {unknown} command
 * @returns {Readonly<{initialScene:unknown,currentScene:unknown,commands:unknown[],cursor:number}>}
 */
export function dispatchSceneCommand(store, command) {
  if (!isObject(store) || !Array.isArray(store.commands) || !Number.isInteger(store.cursor)) {
    throw new Error('Invalid scene store.');
  }
  const canonicalCommand = stableClone(command);
  const commands = [...store.commands.slice(0, store.cursor), canonicalCommand];
  const currentScene = applySceneCommand(store.currentScene, canonicalCommand);
  return deepFreeze({
    initialScene: store.initialScene,
    currentScene,
    commands,
    cursor: commands.length,
  });
}

/** @param {Readonly<{initialScene:unknown,currentScene:unknown,commands:unknown[],cursor:number}>} store */
export function undoSceneCommand(store) {
  if (store.cursor <= 0) throw new Error('UNDO_UNAVAILABLE');
  const cursor = store.cursor - 1;
  return deepFreeze({
    initialScene: store.initialScene,
    currentScene: replaySceneCommands(store.initialScene, store.commands.slice(0, cursor)),
    commands: store.commands,
    cursor,
  });
}

/** @param {Readonly<{initialScene:unknown,currentScene:unknown,commands:unknown[],cursor:number}>} store */
export function redoSceneCommand(store) {
  if (store.cursor >= store.commands.length) throw new Error('REDO_UNAVAILABLE');
  const cursor = store.cursor + 1;
  return deepFreeze({
    initialScene: store.initialScene,
    currentScene: applySceneCommand(store.currentScene, store.commands[store.cursor]),
    commands: store.commands,
    cursor,
  });
}
