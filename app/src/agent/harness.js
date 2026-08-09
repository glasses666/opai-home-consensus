import { dispatchSceneCommand } from '../domain/scene.js';
import { demoCatalogPlugin } from '../catalog/demo-catalog.js';

const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|password|secret|token)/i;
const NO_WRITE_INTENT_PATTERN = /(?:先(?:看(?:看|一下)?|给.{0,8}(?:方向|方案|建议))|(?:给|提供).{0,8}(?:方向|方案|建议)|(?:不要|别|先不|暂不|暂时不)(?:直接)?(?:改|修改|调整|动))/;

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

const SURFACE_NOUNS = [
  ['开放客餐厅南墙', 'surface-wall-living-south'],
  ['客餐厅南墙', 'surface-wall-living-south'],
  ['客厅南墙', 'surface-wall-living-south'],
  ['客厅西墙', 'surface-wall-living-west'],
];

const ROOM_NOUNS = [
  [/(主卧)/, 'room-primary-bedroom'],
  [/(卫生间|浴室)/, 'room-bathroom'],
  [/(儿童房|次卧|书房)/, 'room-flex'],
  [/(过厅|走廊)/, 'room-hall'],
  [/(客厅|餐厅|客餐厅)/, 'room-living-dining'],
  [/(厨房)/, 'room-kitchen'],
  [/(玄关|入户)/, 'room-entry'],
];

export const TOOL_REGISTRY = [
  { name: 'inspect_room', writes: false, requiredArgs: ['roomId'], description: '读取房间、对象和表面。' },
  { name: 'inspect_object', writes: false, requiredArgs: ['objectId'], description: '读取一个场景对象。' },
  { name: 'search_catalog', writes: false, requiredArgs: [], optionalArgs: ['query', 'category', 'kind', 'appliesTo', 'limit'], description: '搜索合成组件目录；价格和工期均为 estimate。' },
  { name: 'inspect_catalog_item', writes: false, requiredArgs: ['catalogItemId'], description: '读取目录项、约束、来源与 sceneReady 状态。' },
  { name: 'request_clarification', writes: false, requiredArgs: ['question'], optionalArgs: ['reason', 'options'], description: '信息不足时只追问一个关键问题。' },
  { name: 'move_object', writes: true, requiredArgs: ['objectId'], optionalArgs: ['x', 'z', 'dx', 'dz'], description: '移动已有可移动对象，单位为整数毫米。' },
  { name: 'rotate_object', writes: true, requiredArgs: ['objectId', 'degrees'], optionalArgs: ['mode'], description: '旋转已有可旋转对象。' },
  { name: 'set_object_material', writes: true, requiredArgs: ['objectId', 'materialId'], description: '修改已有对象材质。' },
  { name: 'set_surface_material', writes: true, requiredArgs: ['surfaceId', 'materialId'], description: '直接修改已有表面材质。' },
  { name: 'apply_catalog_item', writes: true, requiredArgs: ['catalogItemId', 'surfaceId'], description: '只把 sceneReady 的目录表面系统应用到兼容表面。' },
];
const TOOL_NAMES = new Set(TOOL_REGISTRY.map((tool) => tool.name));

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

function hasNoWriteIntent(input) {
  return NO_WRITE_INTENT_PATTERN.test(input);
}

function summarizeScene(scene, input, selectedObjectId) {
  const roomIds = new Set(ROOM_NOUNS.filter(([pattern]) => pattern.test(input)).map(([, roomId]) => roomId));
  const namedObjectId = OBJECT_NOUNS.find(([noun]) => input.includes(noun))?.[1] ?? null;
  const namedSurfaceId = SURFACE_NOUNS.find(([noun]) => input.includes(noun))?.[1] ?? null;
  const selectedEntityId = namedObjectId ?? namedSurfaceId ?? selectedObjectId;
  const selectedEntity = [...(scene.objects ?? []), ...(scene.surfaces ?? [])].find((entity) => entity.id === selectedEntityId);
  const selectedSurfaceId = selectedEntityId?.startsWith('surface-') ? selectedEntityId : null;
  if (selectedEntity?.roomId) roomIds.add(selectedEntity.roomId);
  const includeWholeHome = /(整屋|全屋)/.test(input);
  const inScope = (entity) => includeWholeHome || roomIds.has(entity.roomId);
  const needsObjects = includeWholeHome || namedObjectId || /(家具|柜|收纳|餐桌|床|书桌)/.test(input);
  const needsSurfaces = includeWholeHome || namedSurfaceId || selectedSurfaceId || /(墙面|地面|地板|瓷砖).*(改|换|设|刷|铺)|(?:改|换|设|刷|铺).*(墙面|地面|地板|瓷砖)/.test(input);
  const objectInScope = (object) => namedObjectId ? object.id === namedObjectId : needsObjects && inScope(object);
  const surfaceInScope = (surface) => (namedSurfaceId ?? selectedSurfaceId) ? surface.id === (namedSurfaceId ?? selectedSurfaceId) : needsSurfaces && inScope(surface);

  const objects = scene.objects?.filter(objectInScope).map((object) => ({
    id: object.id,
    name: object.name,
    category: object.category,
    roomId: object.roomId,
    materialId: object.materialId,
    dimensions: object.dimensions,
    transform: object.transform,
    editable: Object.entries(object.capabilities ?? {}).filter(([, enabled]) => enabled).map(([name]) => name),
  })) ?? [];
  const surfaces = scene.surfaces?.filter(surfaceInScope).map((surface) => ({
    id: surface.id,
    kind: surface.kind,
    roomId: surface.roomId,
    materialId: surface.materialId,
    materialEditable: surface.capabilities?.materialEditable === true,
  })) ?? [];
  const materialIds = new Set([...objects, ...surfaces].map((entity) => entity.materialId).filter(Boolean));

  return stableJsonValue({
    units: scene.floorPlan?.units,
    rooms: scene.rooms?.filter((room) => includeWholeHome || roomIds.size === 0 || roomIds.has(room.id)).map((room) => ({
      id: room.id,
      name: room.name,
      kind: room.kind,
    })),
    objects,
    surfaces,
    materials: scene.materials?.filter((material) => materialIds.has(material.id)).map((material) => ({
      id: material.id,
      kind: material.kind,
      source: material.source,
    })),
  });
}

function toolsForInput(input) {
  const names = new Set(['request_clarification']);
  const catalogIntent = /(墙|墙面|地面|地板|瓷砖|层板|架子|隔断|门|吊顶|顶面|柜|五金|台面)/.test(input);
  const objectIntent = OBJECT_NOUNS.some(([noun]) => input.includes(noun));
  if (ROOM_NOUNS.some(([pattern]) => pattern.test(input))) names.add('inspect_room');
  if (catalogIntent) {
    names.add('search_catalog');
    names.add('inspect_catalog_item');
  }
  if (/(墙|墙面|地面|地板|瓷砖)/.test(input)) names.add('apply_catalog_item');
  if (/(墙|墙面|地面|地板|瓷砖)/.test(input) && /(改成|换成|设为|设置为)/.test(input)) names.add('set_surface_material');
  if (objectIntent) names.add('inspect_object');
  if (/(移动|挪|移)/.test(input)) names.add('move_object');
  if (input.includes('旋转')) names.add('rotate_object');
  if (objectIntent && /(改成|换成|设为|设置为)/.test(input)) names.add('set_object_material');
  if (names.size === 1) {
    names.add('inspect_room');
    names.add('search_catalog');
  }
  return TOOL_REGISTRY.filter((tool) => names.has(tool.name) && (!hasNoWriteIntent(input) || !tool.writes));
}

function selectedOrNamedObjectId(input, selectedObjectId) {
  const selected = typeof selectedObjectId === 'string' && selectedObjectId.startsWith('object-') ? selectedObjectId : null;
  return OBJECT_NOUNS.find(([noun]) => input.includes(noun))?.[1] ?? selected;
}

function selectedOrNamedSurfaceId(input, selectedObjectId) {
  const selected = typeof selectedObjectId === 'string' && selectedObjectId.startsWith('surface-') ? selectedObjectId : null;
  return SURFACE_NOUNS.find(([noun]) => input.includes(noun))?.[1] ?? selected;
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
  if (!text) return [];
  const objectId = selectedOrNamedObjectId(text, selectedObjectId);
  const surfaceId = selectedOrNamedSurfaceId(text, selectedObjectId);

  if (/(墙|墙面)/.test(text) && /(木饰面|护墙板|木墙板)/.test(text)) {
    if (surfaceId) return [{ tool: 'apply_catalog_item', args: { catalogItemId: 'demo-wall-panel-light-oak', surfaceId } }];
    return [{ tool: 'request_clarification', args: { question: '你想把木饰面应用到哪一个房间的哪面墙？', reason: '目标墙面不明确' } }];
  }

  if (/(架子|层板|置物架|书架|开放架)/.test(text)) {
    return [
      { tool: 'search_catalog', args: { query: text.includes('层板') ? '层板' : '架子', category: 'shelving', limit: 4 } },
      { tool: 'request_clarification', args: { question: '架体准备放在哪个房间、靠哪面墙，主要收纳什么？', reason: '墙装位置与承重条件尚未确认' } },
    ];
  }

  if (!objectId) return [];

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

function validateAssistantReply(reply, context) {
  if (reply.length > 250 || (reply.match(/[？?]/g)?.length ?? 0) > 1) throw new Error('PROVIDER_SHAPE_INVALID');
  const grounding = JSON.stringify(context);
  const knownNumbers = new Set(grounding.match(/\d+(?:\.\d+)?/g) ?? []);
  if ((reply.match(/\d+(?:\.\d+)?/g) ?? []).some((number) => !knownNumbers.has(number))) {
    throw new Error('PROVIDER_REPLY_UNGROUNDED');
  }
  // ponytail: block common invented installation prescriptions; replace with a policy service if the enterprise rule set grows.
  const constructionClaims = ['膨胀螺栓', '自攻螺丝', '结构胶', '龙骨', '混凝土', '砖墙', '石膏板'];
  if (constructionClaims.some((term) => reply.includes(term) && !grounding.includes(term))) {
    throw new Error('PROVIDER_REPLY_UNGROUNDED');
  }
}

function normalizeProviderResult(result, context) {
  const calls = Array.isArray(result) ? result : result?.toolCalls ?? result?.tool_calls;
  if (!Array.isArray(calls)) throw new Error('PROVIDER_SHAPE_INVALID');
  const assistantReply = result?.assistantReply ?? result?.assistant_reply ?? '';
  if (typeof assistantReply !== 'string' || assistantReply.length > 2000) throw new Error('PROVIDER_SHAPE_INVALID');
  const toolCalls = calls.map(normalizeToolCall);
  const allowedToolNames = new Set(context.tools.map((tool) => tool.name));
  if (toolCalls.some((call) => !allowedToolNames.has(call.tool))) throw new Error('TOOL_NOT_ALLOWED');
  validateAssistantReply(assistantReply, { ...context, toolCalls });
  return { assistantReply: assistantReply.trim(), toolCalls };
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
  if (message === 'PROVIDER_REPLY_UNGROUNDED') return message;
  if (message === 'TOOL_CALL_INVALID') return message;
  if (message === 'TOOL_NOT_ALLOWED') return message;
  return 'PROVIDER_FAILED';
}

function localFallbackReply(input) {
  if (/(架子|层板|置物架|书架|开放架)/.test(input)) {
    return '演示目录里有悬浮层板和开放架体，但安装规则尚未接入。你想放在哪个房间的哪面墙？';
  }
  if (hasNoWriteIntent(input)) return '先只提供方向，不修改当前场景。';
  if (/(墙|墙面)/.test(input) && /(木饰面|护墙板|木墙板)/.test(input)) {
    return '已按演示目录提交浅橡木木饰面变更，实际材料、报价与施工条件仍需复核。';
  }
  return 'Aily 暂时不可用，已由本地规则引擎处理。';
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

function optionalString(args, key) {
  if (args[key] === undefined || args[key] === null) return undefined;
  if (typeof args[key] !== 'string' || args[key].length > 128) throw new Error(`ARG_INVALID: ${key}`);
  return args[key];
}

function optionalStringArray(args, key) {
  if (args[key] === undefined || args[key] === null) return undefined;
  if (!Array.isArray(args[key]) || args[key].length > 4 || args[key].some((value) => typeof value !== 'string' || value.length > 128)) {
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

async function executeTool(store, call, catalogPlugin) {
  const { args, tool } = call;
  if (tool === 'inspect_room') {
    return { store, result: inspectRoom(store.currentScene, requireString(args, 'roomId')) };
  }
  if (tool === 'inspect_object') {
    return { store, result: inspectObject(store.currentScene, requireString(args, 'objectId')) };
  }
  if (tool === 'search_catalog') {
    const limit = args.limit === undefined ? undefined : requireNumber(args, 'limit');
    const items = await Promise.resolve(catalogPlugin.search({
      query: optionalString(args, 'query'),
      category: optionalString(args, 'category'),
      kind: optionalString(args, 'kind'),
      appliesTo: optionalString(args, 'appliesTo'),
      ...(limit === undefined ? {} : { limit }),
    }));
    return { store, result: { items: stableJsonValue(items) } };
  }
  if (tool === 'inspect_catalog_item') {
    const catalogItemId = requireString(args, 'catalogItemId');
    const item = await Promise.resolve(catalogPlugin.get(catalogItemId));
    if (!item) throw new Error(`CATALOG_ITEM_NOT_FOUND: ${catalogItemId}`);
    return { store, result: stableJsonValue(item) };
  }
  if (tool === 'request_clarification') {
    return {
      store,
      result: stableJsonValue({
        question: requireString(args, 'question'),
        reason: optionalString(args, 'reason') ?? null,
        options: optionalStringArray(args, 'options') ?? [],
      }),
    };
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
  if (tool === 'apply_catalog_item') {
    const catalogItemId = requireString(args, 'catalogItemId');
    const surfaceId = requireString(args, 'surfaceId');
    const item = await Promise.resolve(catalogPlugin.get(catalogItemId));
    if (!item) throw new Error(`CATALOG_ITEM_NOT_FOUND: ${catalogItemId}`);
    if (item.sceneReady !== true) throw new Error(`CATALOG_ITEM_NOT_SCENE_READY: ${catalogItemId}`);
    if (item.operation?.type !== 'surface.setMaterial') throw new Error(`CATALOG_OPERATION_UNSUPPORTED: ${catalogItemId}`);
    const surface = findById(store.currentScene.surfaces, surfaceId);
    if (!surface) throw new Error(`SURFACE_NOT_FOUND: ${surfaceId}`);
    if (!item.appliesTo?.includes(surface.kind)) throw new Error(`CATALOG_TARGET_INCOMPATIBLE: ${catalogItemId}`);
    return {
      store: dispatchSceneCommand(store, { type: 'surface.setMaterial', surfaceId, materialId: item.operation.materialId }),
      result: stableJsonValue({ catalogItemId, surfaceId, materialId: item.operation.materialId, source: item.source, commercial: item.commercial }),
    };
  }
  throw new Error(`TOOL_UNSUPPORTED: ${tool}`);
}

export async function runAgentTurn({
  store,
  input,
  selectedObjectId = null,
  provider = null,
  catalogPlugin = demoCatalogPlugin,
  timeoutMs = 1500,
} = {}) {
  if (!isRecord(store) || !isRecord(store.currentScene)) throw new Error('STORE_INVALID');
  if (!catalogPlugin || ['describe', 'summary', 'search', 'get'].some((method) => typeof catalogPlugin[method] !== 'function')) {
    throw new Error('CATALOG_PLUGIN_INVALID');
  }

  let source = 'local';
  let fallbackReason = null;
  let toolCalls = [];
  let assistantReply = '';
  const inputText = String(input ?? '');
  const turnTools = toolsForInput(inputText);
  const allowedToolNames = new Set(turnTools.map((tool) => tool.name));
  const localToolCalls = () => parseLocalToolCalls({ input: inputText, selectedObjectId })
    .filter((call) => allowedToolNames.has(call.tool));
  const catalogSummary = stableJsonValue(await Promise.resolve(catalogPlugin.summary({ input: inputText })));
  const catalogDescription = stableJsonValue(await Promise.resolve(catalogPlugin.describe()));
  if (provider) {
    const providerContext = {
      input: inputText,
      selectedObjectId,
      scene: summarizeScene(store.currentScene, String(input ?? ''), selectedObjectId),
      catalog: catalogSummary,
      tools: stableJsonValue(turnTools),
    };
    try {
      const providerResult = await withTimeout(
        Promise.resolve(provider(providerContext)),
        timeoutMs,
      );
      ({ assistantReply, toolCalls } = normalizeProviderResult(providerResult, providerContext));
      source = 'provider';
    } catch (error) {
      fallbackReason = providerFailureCode(error);
      toolCalls = localToolCalls();
      assistantReply = localFallbackReply(inputText);
    }
  } else {
    toolCalls = localToolCalls();
  }

  let nextStore = store;
  const steps = [];
  let rolledBack = false;
  for (const call of toolCalls) {
    try {
      const executed = await executeTool(nextStore, call, catalogPlugin);
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
    assistantReply,
    catalog: catalogDescription,
    fallbackReason,
    input: inputText,
    selectedObjectId,
    source,
    steps,
    toolCalls,
    rolledBack,
  });

  return { store: nextStore, trace };
}
