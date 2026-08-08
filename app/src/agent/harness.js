import { dispatchSceneCommand } from '../domain/scene.js';

const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|password|secret|token)/i;
const TOOL_NAMES = new Set([
  'inspect_room',
  'inspect_object',
  'move_object',
  'rotate_object',
  'set_object_material',
  'set_surface_material',
]);

const OBJECT_NOUNS = [
  ['沙发', 'object-sofa'],
  ['餐桌', 'object-dining-table'],
  ['餐台', 'object-dining-table'],
  ['电视柜', 'object-tv-console'],
  ['床', 'object-primary-bed'],
  ['书桌', 'object-flex-desk'],
  ['衣柜', 'object-primary-wardrobe'],
  ['鞋柜', 'object-shoe-cabinet'],
  ['橱柜', 'object-kitchen-counter'],
];

const MATERIAL_NOUNS = [
  ['橡木色', 'mat-oak-veneer'],
  ['橡木', 'mat-oak-veneer'],
  ['浅橡木', 'mat-floor-light-oak'],
  ['灰色', 'mat-fabric-warm-gray'],
  ['暖灰', 'mat-fabric-warm-gray'],
  ['白色', 'mat-wall-warm-white'],
  ['暖白', 'mat-wall-warm-white'],
  ['瓷砖', 'mat-floor-tile-warm'],
];

export const TOOL_REGISTRY = [
  { name: 'inspect_room', writes: false, requiredArgs: ['roomId'] },
  { name: 'inspect_object', writes: false, requiredArgs: ['objectId'] },
  { name: 'move_object', writes: true, requiredArgs: ['objectId'], optionalArgs: ['x', 'z', 'dx', 'dz'] },
  { name: 'rotate_object', writes: true, requiredArgs: ['objectId', 'degrees'], optionalArgs: ['mode'] },
  { name: 'set_object_material', writes: true, requiredArgs: ['objectId', 'materialId'] },
  { name: 'set_surface_material', writes: true, requiredArgs: ['surfaceId', 'materialId'] },
];

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isInteger = (value) => Number.isInteger(value);

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!isRecord(value)) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (['string', 'boolean'].includes(typeof value) || value === null) return value;
    return null;
  }

  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !SECRET_KEY_PATTERN.test(key))
      .sort()
      .map((key) => [key, stableJsonValue(value[key])]),
  );
}

function findById(records, id) {
  return records?.find((record) => record.id === id) ?? null;
}

function summarizeScene(scene) {
  return stableJsonValue({
    rooms: scene.rooms?.map((room) => ({
      id: room.id,
      name: room.name,
      kind: room.kind,
      objectIds: scene.objects?.filter((object) => object.roomId === room.id).map((object) => object.id).sort() ?? [],
    })),
    objects: scene.objects?.map((object) => ({
      id: object.id,
      name: object.name,
      category: object.category,
      roomId: object.roomId,
      materialId: object.materialId,
      transform: object.transform,
      capabilities: object.capabilities,
    })),
    surfaces: scene.surfaces?.map((surface) => ({
      id: surface.id,
      kind: surface.kind,
      roomId: surface.roomId,
      materialId: surface.materialId,
      capabilities: surface.capabilities ?? {},
    })),
    materials: scene.materials?.map((material) => ({
      id: material.id,
      kind: material.kind,
      color: material.color,
    })),
  });
}

function selectedOrNamedObjectId(input, selectedObjectId) {
  return OBJECT_NOUNS.find(([noun]) => input.includes(noun))?.[1] ?? selectedObjectId ?? null;
}

function namedMaterialId(input) {
  return MATERIAL_NOUNS.find(([noun]) => input.includes(noun))?.[1] ?? null;
}

function amountMm(input) {
  const match = input.match(/(-?\d+(?:\.\d+)?)\s*(毫米|厘米|cm|mm|米)?/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] ?? '毫米';
  if (!Number.isFinite(amount)) return null;
  if (unit === '厘米' || unit.toLowerCase() === 'cm') return Math.round(amount * 10);
  if (unit === '米') return Math.round(amount * 1000);
  return Math.round(amount);
}

function degrees(input) {
  const match = input.match(/(-?\d+(?:\.\d+)?)\s*度/);
  return match ? Number(match[1]) : null;
}

export function parseLocalToolCalls({ input, selectedObjectId = null }) {
  const text = String(input ?? '').trim();
  const objectId = selectedOrNamedObjectId(text, selectedObjectId);
  if (!text || !objectId) return [];

  if (/(移动|挪|移)/.test(text)) {
    const mm = amountMm(text);
    if (!mm) return [];
    if (text.includes('向右')) return [{ tool: 'move_object', args: { objectId, dx: mm } }];
    if (text.includes('向左')) return [{ tool: 'move_object', args: { objectId, dx: -mm } }];
    if (text.includes('向下') || text.includes('向南')) return [{ tool: 'move_object', args: { objectId, dz: mm } }];
    if (text.includes('向上') || text.includes('向北')) return [{ tool: 'move_object', args: { objectId, dz: -mm } }];
  }

  if (text.includes('旋转')) {
    const value = degrees(text);
    if (Number.isFinite(value)) return [{ tool: 'rotate_object', args: { objectId, degrees: value, mode: 'delta' } }];
  }

  if (/(改成|换成|设为|设置为)/.test(text)) {
    const materialId = namedMaterialId(text);
    if (materialId) return [{ tool: 'set_object_material', args: { objectId, materialId } }];
  }

  return [];
}

function normalizeToolCall(call) {
  if (!isRecord(call)) throw new Error('TOOL_CALL_INVALID');
  const tool = call.tool ?? call.name;
  const args = call.args ?? call.arguments ?? {};
  if (typeof tool !== 'string' || !TOOL_NAMES.has(tool) || !isRecord(args)) {
    throw new Error('TOOL_CALL_INVALID');
  }
  return { tool, args: stableJsonValue(args) };
}

function normalizeProviderToolCalls(result) {
  const calls = Array.isArray(result) ? result : result?.toolCalls ?? result?.tool_calls;
  if (!Array.isArray(calls)) throw new Error('PROVIDER_SHAPE_INVALID');
  return calls.map(normalizeToolCall);
}

function withTimeout(promise, timeoutMs) {
  if (!timeoutMs || timeoutMs < 1) return promise;
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error('PROVIDER_TIMEOUT')), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function providerFailureCode(error) {
  const message = error?.message;
  if (message === 'PROVIDER_TIMEOUT') return message;
  if (message === 'PROVIDER_SHAPE_INVALID') return message;
  if (message === 'TOOL_CALL_INVALID') return message;
  return 'PROVIDER_FAILED';
}

function requireString(args, key) {
  if (typeof args[key] !== 'string' || args[key].length === 0) {
    throw new Error(`ARG_INVALID: ${key}`);
  }
  return args[key];
}

function requireNumber(args, key) {
  if (typeof args[key] !== 'number' || !Number.isFinite(args[key])) {
    throw new Error(`ARG_INVALID: ${key}`);
  }
  return args[key];
}

function optionalInteger(args, key) {
  if (args[key] !== undefined && !isInteger(args[key])) {
    throw new Error(`ARG_INVALID: ${key} must be integer millimeters`);
  }
}

function inspectRoom(scene, roomId) {
  const room = findById(scene.rooms, roomId);
  if (!room) throw new Error(`ROOM_NOT_FOUND: ${roomId}`);
  return stableJsonValue({
    room,
    objects: scene.objects?.filter((object) => object.roomId === roomId).map((object) => object.id).sort() ?? [],
    surfaces: scene.surfaces?.filter((surface) => surface.roomId === roomId).map((surface) => surface.id).sort() ?? [],
  });
}

function inspectObject(scene, objectId) {
  const object = findById(scene.objects, objectId);
  if (!object) throw new Error(`OBJECT_NOT_FOUND: ${objectId}`);
  return stableJsonValue(object);
}

function executeTool(store, call) {
  const { args, tool } = call;
  if (tool === 'inspect_room') {
    return { store, result: inspectRoom(store.currentScene, requireString(args, 'roomId')) };
  }
  if (tool === 'inspect_object') {
    return { store, result: inspectObject(store.currentScene, requireString(args, 'objectId')) };
  }
  if (tool === 'move_object') {
    const objectId = requireString(args, 'objectId');
    const object = findById(store.currentScene.objects, objectId);
    if (!object) throw new Error(`OBJECT_NOT_FOUND: ${objectId}`);
    const hasAbsolute = args.x !== undefined || args.z !== undefined;
    const hasDelta = args.dx !== undefined || args.dz !== undefined;
    if (!hasAbsolute && !hasDelta) throw new Error('ARG_INVALID: move requires x/z or dx/dz');
    for (const key of ['x', 'z', 'dx', 'dz']) optionalInteger(args, key);
    const x = args.x === undefined ? object.transform.x + (args.dx ?? 0) : args.x;
    const z = args.z === undefined ? object.transform.z + (args.dz ?? 0) : args.z;
    return {
      store: dispatchSceneCommand(store, { type: 'object.setTransform', objectId, transform: { x, z } }),
      result: { objectId, transform: { x, z } },
    };
  }
  if (tool === 'rotate_object') {
    const objectId = requireString(args, 'objectId');
    const object = findById(store.currentScene.objects, objectId);
    if (!object) throw new Error(`OBJECT_NOT_FOUND: ${objectId}`);
    const value = requireNumber(args, 'degrees');
    const radians = value * Math.PI / 180;
    const rotationY = args.mode === 'absolute' ? radians : object.transform.rotationY + radians;
    return {
      store: dispatchSceneCommand(store, { type: 'object.setTransform', objectId, transform: { rotationY } }),
      result: { objectId, rotationY },
    };
  }
  if (tool === 'set_object_material') {
    const objectId = requireString(args, 'objectId');
    const materialId = requireString(args, 'materialId');
    return {
      store: dispatchSceneCommand(store, { type: 'object.setMaterial', objectId, materialId }),
      result: { objectId, materialId },
    };
  }
  if (tool === 'set_surface_material') {
    const surfaceId = requireString(args, 'surfaceId');
    const materialId = requireString(args, 'materialId');
    return {
      store: dispatchSceneCommand(store, { type: 'surface.setMaterial', surfaceId, materialId }),
      result: { surfaceId, materialId },
    };
  }
  throw new Error(`TOOL_UNSUPPORTED: ${tool}`);
}

export async function runAgentTurn({
  store,
  input,
  selectedObjectId = null,
  provider = null,
  timeoutMs = 1500,
} = {}) {
  if (!isRecord(store) || !isRecord(store.currentScene)) throw new Error('STORE_INVALID');

  let source = 'local';
  let fallbackReason = null;
  let toolCalls = [];
  if (provider) {
    try {
      const providerResult = await withTimeout(
        Promise.resolve(provider({
          input: String(input ?? ''),
          selectedObjectId,
          scene: summarizeScene(store.currentScene),
          tools: stableJsonValue(TOOL_REGISTRY),
        })),
        timeoutMs,
      );
      toolCalls = normalizeProviderToolCalls(providerResult);
      source = 'provider';
    } catch (error) {
      fallbackReason = providerFailureCode(error);
      toolCalls = parseLocalToolCalls({ input, selectedObjectId });
    }
  } else {
    toolCalls = parseLocalToolCalls({ input, selectedObjectId });
  }

  let nextStore = store;
  const steps = [];
  let rolledBack = false;
  for (const call of toolCalls) {
    try {
      const executed = executeTool(nextStore, call);
      nextStore = executed.store;
      steps.push({ ok: true, tool: call.tool, args: call.args, result: executed.result });
    } catch (error) {
      steps.push({ ok: false, tool: call.tool, args: call.args, error: error?.message ?? 'TOOL_FAILED' });
      nextStore = store;
      rolledBack = true;
      break;
    }
  }

  const trace = stableJsonValue({
    fallbackReason,
    input: String(input ?? ''),
    selectedObjectId,
    source,
    steps,
    toolCalls,
    rolledBack,
  });

  return { store: nextStore, trace };
}
