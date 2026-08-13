import { dispatchSceneCommand } from '../domain/scene.js';
import { demoCatalogPlugin } from '../catalog/demo-catalog.js';
import { createDesignBrief, evolveDesignBrief, normalizeDesignBrief } from '../domain/design-brief.js';
import { retrieveStyleCases, shouldRetrieveStyleCases } from '../catalog/style-retrieval.js';
import { compareVersionHistory } from '../domain/design-version.js';
import { evaluateDesignRules, filterDesignRuleChecksForRoom } from '../domain/design-rules.js';

const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|password|secret|token)/i;
const NO_WRITE_INTENT_PATTERN = /(?:先(?:看(?:看|一下)?|给.{0,8}(?:方向|方案|建议))|只?(?:给|提供).{0,8}(?:方向|方案|建议)|(?:不要|别|不许|不能|不想|先不|暂不|暂时不).{0,16}(?:改|修改|调整|动|移动|挪|旋转|删|删除|移除|应用|安装|换|执行|实施|落地|保存)|(?:只|仅)(?:看|预览))/;
const SCOPED_PRESERVE_PATTERN = /(?:其他|其它|其余|别的|剩下|除.+?外|除了.+?之外).{0,12}(?:不要|别|先不|暂不|暂时不)|(?:不要|别|先不|暂不|暂时不).{0,8}(?:其他|其它|其余|别的|剩下)/;
const CONDITIONAL_NO_WRITE_PATTERN = /(?:如果|若|要是|一旦|越界|不合法|不合适|有问题).{0,12}(?:就|则)?.{0,8}(?:不要|别|先不|暂不|暂时不)(?:直接)?(?:改|修改|调整|动)/;
const POSITIVE_WRITE_PATTERN = /(?:改成|换成|设为|设置为|应用|铺成|刷成|移动|挪|右移|左移|上移|下移|南移|北移|旋转|删除|移除)/;
const ENTITY_SCOPE_PATTERN = /(?:沙发|床|餐桌|餐台|电视柜|书桌|衣柜|鞋柜|橱柜|层板|架子|隔断|背景墙|墙面|地面|地板|顶面|天花)/;
const CONSTRUCTION_CLAIMS = ['膨胀螺栓', '自攻螺丝', '结构胶', '龙骨', '混凝土', '砖墙', '石膏板'];
const BEDROOM_OPEN_STORAGE_PATTERN = /主卧.*(?:太满|拥挤|开阔|动线).*(?:收纳)|主卧.*收纳.*(?:太满|拥挤|开阔|动线)/;

const OBJECT_NOUNS = [
  ['双人床', 'object-primary-bed'],
  ['主卧床', 'object-primary-bed'],
  ['大床', 'object-primary-bed'],
  ['单人床', 'object-flex-bed'],
  ['儿童床', 'object-flex-bed'],
  ['儿童房床', 'object-flex-bed'],
  ['次卧床', 'object-flex-bed'],
  ['书房床', 'object-flex-bed'],
  ['成长床', 'object-flex-bed'],
  ['沙发', 'object-sofa'],
  ['餐桌', 'object-dining-table'],
  ['餐台', 'object-dining-table'],
  ['电视柜', 'object-tv-console'],
  ['书桌', 'object-flex-desk'],
  ['衣柜', 'object-primary-wardrobe'],
  ['鞋柜', 'object-shoe-cabinet'],
  ['橱柜', 'object-kitchen-counter'],
  ['悬浮层板', 'object-flex-floating-shelf'],
  ['层板', 'object-flex-floating-shelf'],
  ['格栅隔断', 'object-living-slat-partition'],
  ['隔断', 'object-living-slat-partition'],
  ['主卧背景墙', 'object-primary-feature-wall'],
  ['背景墙', 'object-primary-feature-wall'],
];

const MATERIAL_NOUNS = [
  ['橡木色', 'mat-oak-veneer'],
  ['橡木', 'mat-oak-veneer'],
  ['浅橡木', 'mat-floor-light-oak'],
  ['灰色', 'mat-fabric-warm-gray'],
  ['暖灰', 'mat-fabric-warm-gray'],
  ['白色', 'mat-object-warm-white'],
  ['暖白', 'mat-object-warm-white'],
  ['瓷砖', 'mat-floor-tile-warm'],
];

const SURFACE_NOUNS = [
  ['开放客餐厅南墙', 'surface-wall-living-south'],
  ['客餐厅南墙', 'surface-wall-living-south'],
  ['客厅南墙', 'surface-wall-living-south'],
  ['客厅西墙', 'surface-wall-living-west'],
];

const SURFACE_MATERIAL_NOUNS = {
  wall: [
    [/(木饰面|护墙板|木墙板|浅橡木|橡木)/, 'mat-wall-oak-panel'],
    [/(暖灰|微水泥|灰色)/, 'mat-wall-greige'],
    [/(暖白|白色)/, 'mat-wall-warm-white'],
  ],
  floor: [
    [/(瓷砖|暖灰|灰色)/, 'mat-floor-tile-warm'],
    [/(浅橡木|木地板|地板)/, 'mat-floor-light-oak'],
  ],
  ceiling: [
    [/(暖灰|灰色)/, 'mat-ceiling-greige'],
    [/(暖白|白色)/, 'mat-ceiling-warm-white'],
  ],
};

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
  { name: 'check_rules', writes: false, requiredArgs: [], optionalArgs: ['objectId', 'roomId'], description: '读取当前对象、房间或场景的确定性规则状态。' },
  { name: 'compare_versions', writes: false, requiredArgs: ['beforeVersionId'], optionalArgs: ['afterVersionId'], description: '比较两个已保存版本的真实对象差异与影响。' },
  { name: 'request_confirmation', writes: false, requiredArgs: [], optionalArgs: ['versionId', 'message'], description: '请求住户确认当前版本；工具不直接代替住户确认。' },
  { name: 'move_object', writes: true, requiredArgs: ['objectId'], optionalArgs: ['x', 'z', 'dx', 'dz'], description: '移动已有可移动对象，单位为整数毫米。' },
  { name: 'rotate_object', writes: true, requiredArgs: ['objectId', 'degrees'], optionalArgs: ['mode'], description: '旋转已有可旋转对象。' },
  { name: 'set_object_material', writes: true, requiredArgs: ['objectId', 'materialId'], description: '修改已有对象材质。' },
  { name: 'set_surface_material', writes: true, requiredArgs: ['surfaceId', 'materialId'], description: '直接修改已有表面材质。' },
  { name: 'apply_catalog_item', writes: true, requiredArgs: ['catalogItemId', 'surfaceId'], description: '只把 sceneReady 的目录表面系统应用到兼容表面。' },
  { name: 'delete_object', writes: true, requiredArgs: ['objectId'], description: '删除允许删除的可移动家具。' },
];
const TOOL_NAMES = new Set(TOOL_REGISTRY.map((tool) => tool.name));
const WRITE_TOOL_NAMES = new Set(TOOL_REGISTRY.filter((tool) => tool.writes).map((tool) => tool.name));
const AGENT_MODES = new Set(['clarify', 'propose', 'execute']);

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

function styleEvidenceForProvider(result) {
  if (!result) return null;
  return stableJsonValue({
    status: result.status,
    boundary: result.boundary ?? null,
    message: result.message,
    detected: result.detected ?? null,
    results: result.results.slice(0, 2).map((item) => ({
      caseId: item.caseId,
      styleId: item.styleId,
      title: item.title,
      applicability: item.evidence.applicability.slice(0, 2),
      risks: item.evidence.risks.slice(0, 2),
      unknowns: item.evidence.unknowns.slice(0, 1),
      citation: item.citation,
    })),
  });
}

function findById(records, id) {
  return records?.find((record) => record.id === id) ?? null;
}

function hasNoWriteIntent(input) {
  const text = String(input ?? '');
  const hasPositiveWrite = text.split(/[，,。；;！？!?\n]+/).some((clause) =>
    POSITIVE_WRITE_PATTERN.test(clause) && !NO_WRITE_INTENT_PATTERN.test(clause));
  return text
    .split(/[，,。；;！？!?\n]+/)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .some((clause) => NO_WRITE_INTENT_PATTERN.test(clause) &&
      !SCOPED_PRESERVE_PATTERN.test(clause) &&
      !CONDITIONAL_NO_WRITE_PATTERN.test(clause) &&
      !(hasPositiveWrite && ENTITY_SCOPE_PATTERN.test(clause)));
}

function namedObjectIds(input) {
  return [...new Set(OBJECT_NOUNS.filter(([noun]) => input.includes(noun)).map(([, id]) => id))];
}

function writeTargetObjectIds(input) {
  return [...new Set(String(input ?? '')
    .split(/[，,。；;！？!?\n：:]+/)
    .filter((clause) => POSITIVE_WRITE_PATTERN.test(clause) && !NO_WRITE_INTENT_PATTERN.test(clause))
    .flatMap(namedObjectIds))];
}

function roomIdForSelected(scene, selectedId) {
  if (typeof selectedId !== 'string') return null;
  if (findById(scene?.rooms, selectedId)) return selectedId;
  return [...(scene?.objects ?? []), ...(scene?.surfaces ?? [])].find((entity) => entity.id === selectedId)?.roomId ?? null;
}

function selectedOrNamedObjectId(input, selectedId, scene = null) {
  const selectedObject = typeof selectedId === 'string' && selectedId.startsWith('object-') ? findById(scene?.objects, selectedId) ?? { id: selectedId } : null;
  const actionIds = writeTargetObjectIds(input);
  const explicitIds = actionIds.length ? actionIds : namedObjectIds(input);
  if (explicitIds.length === 1) return explicitIds[0];
  if (explicitIds.length > 1) return null;
  if (input.includes('床')) {
    const roomId = namedRoomId(input) ?? roomIdForSelected(scene, selectedId) ?? selectedObject?.roomId;
    if (roomId === 'room-flex') return 'object-flex-bed';
    if (roomId === 'room-primary-bedroom') return 'object-primary-bed';
    if (selectedObject?.category === 'bed') return selectedObject.id;
    return 'object-primary-bed';
  }
  return selectedObject?.id ?? null;
}

function summarizeScene(scene, input, selectedObjectId) {
  const roomIds = new Set(ROOM_NOUNS.filter(([pattern]) => pattern.test(input)).map(([, roomId]) => roomId));
  const namedObjectId = selectedOrNamedObjectId(input, selectedObjectId, scene);
  const namedSurfaceId = SURFACE_NOUNS.find(([noun]) => input.includes(noun))?.[1] ?? null;
  const selectedEntityId = namedObjectId ?? namedSurfaceId ?? selectedObjectId;
  const selectedEntity = [...(scene.objects ?? []), ...(scene.surfaces ?? [])].find((entity) => entity.id === selectedEntityId);
  const selectedRoomId = findById(scene.rooms, selectedEntityId)?.id ?? roomIdForSelected(scene, selectedEntityId);
  const selectedSurfaceId = selectedEntityId?.startsWith('surface-') ? selectedEntityId : null;
  if (selectedEntity?.roomId) roomIds.add(selectedEntity.roomId);
  if (selectedRoomId) roomIds.add(selectedRoomId);
  const includeWholeHome = /(整屋|全屋)/.test(input);
  const inScope = (entity) => includeWholeHome || roomIds.has(entity.roomId);
  const needsObjects = includeWholeHome || namedObjectId || /(家具|柜|收纳|餐桌|床|书桌)/.test(input);
  const needsSurfaces = includeWholeHome || namedSurfaceId || selectedSurfaceId || /(墙面|地面|地板|瓷砖|顶面|天花).*(改|换|设|刷|铺)|(?:改|换|设|刷|铺).*(墙面|地面|地板|瓷砖|顶面|天花)/.test(input);
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

function toolsForInput(input, noWrite = hasNoWriteIntent(input)) {
  const names = new Set(['request_clarification']);
  if (BEDROOM_OPEN_STORAGE_PATTERN.test(input)) {
    names.add('inspect_room');
    names.add('move_object');
    names.add('check_rules');
  }
  const catalogIntent = /(墙|墙面|地面|地板|瓷砖|层板|架子|隔断|门|吊顶|顶面|柜|五金|台面)/.test(input);
  const objectIntent = input.includes('床') || OBJECT_NOUNS.some(([noun]) => input.includes(noun));
  const namedMaterial = MATERIAL_NOUNS.some(([noun]) => input.includes(noun));
  if (ROOM_NOUNS.some(([pattern]) => pattern.test(input))) names.add('inspect_room');
  if (catalogIntent) {
    names.add('search_catalog');
    names.add('inspect_catalog_item');
  }
  if (/(墙|墙面|地面|地板|瓷砖|顶面|天花)/.test(input)) names.add('apply_catalog_item');
  if (/(墙|墙面|地面|地板|瓷砖|顶面|天花)/.test(input) && /(改成|换成|设为|设置为)/.test(input)) names.add('set_surface_material');
  if (objectIntent) names.add('inspect_object');
  if (/(移动|挪|移)/.test(input)) names.add('move_object');
  if (input.includes('旋转')) names.add('rotate_object');
  if (/(删除|移除|不要了)/.test(input)) names.add('delete_object');
  if (objectIntent && namedMaterial && /(改成|换成|设为|设置为)/.test(input)) names.add('set_object_material');
  if (/(规则|是否合法|能不能|会不会挡|检查)/.test(input)) names.add('check_rules');
  if (/(对比|上一版|版本|变化|差异|影响)/.test(input)) names.add('compare_versions');
  if (/(确认|定稿|认可|就这版)/.test(input)) names.add('request_confirmation');
  if (names.size === 1) {
    names.add('inspect_room');
    names.add('search_catalog');
  }
  return TOOL_REGISTRY.filter((tool) => names.has(tool.name) && (!noWrite || !tool.writes));
}

function selectedOrNamedSurfaceId(input, selectedObjectId, scene) {
  const explicit = SURFACE_NOUNS.find(([noun]) => input.includes(noun))?.[1] ?? null;
  if (explicit) return explicit;
  const selected = findById(scene?.surfaces, selectedObjectId);
  if (selected) return selected.id;
  const roomId = namedRoomId(input);
  const kind = /(顶面|天花)/.test(input) ? 'ceiling' : /(地面|地板|瓷砖)/.test(input) ? 'floor' : null;
  return roomId && kind ? scene?.surfaces?.find((surface) => surface.roomId === roomId && surface.kind === kind)?.id ?? null : null;
}

function namedRoomId(input) {
  return ROOM_NOUNS.find(([pattern]) => pattern.test(input))?.[1] ?? null;
}

function previousVersionId(versionHistory) {
  if (!versionHistory?.versions?.length) return null;
  const currentIndex = versionHistory.versions.findIndex((version) => version.id === versionHistory.currentVersionId);
  const index = currentIndex > 0 ? currentIndex - 1 : 0;
  return versionHistory.versions[index]?.id ?? null;
}

function namedMaterialId(input) {
  return MATERIAL_NOUNS.find(([noun]) => input.includes(noun))?.[1] ?? null;
}

function namedSurfaceMaterialId(input, kind) {
  return SURFACE_MATERIAL_NOUNS[kind]?.find(([pattern]) => pattern.test(input))?.[1] ?? null;
}

function namedCatalogItemId(input) {
  if (/(层板|悬浮层板)/.test(input)) return 'demo-shelf-floating-900';
  return null;
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

function movementMm(input, direction) {
  const directionPattern = direction === 'right' ? '(?:右|右边)'
    : direction === 'left' ? '(?:左|左边)'
      : direction === 'down' ? '(?:下|下边|南)'
        : '(?:上|上边|北)';
  const patterns = [
    new RegExp(`(?:向|往|朝)?${directionPattern}(?:移动|挪|移)?\\s*(-?\\d+(?:\\.\\d+)?)\\s*(毫米|厘米|cm|mm|米)?`, 'i'),
    new RegExp(`(?:移动|挪|移)\\s*(-?\\d+(?:\\.\\d+)?)\\s*(毫米|厘米|cm|mm|米)?\\s*(?:到|向|往|朝)?${directionPattern}`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return amountMm(`${match[1]}${match[2] ?? '毫米'}`);
  }
  return null;
}

function degrees(input) {
  const match = input.match(/(-?\d+(?:\.\d+)?)\s*度/);
  return match ? Number(match[1]) : null;
}

export function parseLocalToolCalls({ input, selectedObjectId = null, versionHistory = null, scene = null }) {
  const text = String(input ?? '').trim();
  if (!text) return [];
  if (writeTargetObjectIds(text).length > 1) {
    return [{
      tool: 'request_clarification',
      args: { question: '这次要修改哪一件家具？', reason: '同一句话包含多个家具目标' },
    }];
  }
  const objectId = selectedOrNamedObjectId(text, selectedObjectId, scene);
  const surfaceId = selectedOrNamedSurfaceId(text, selectedObjectId, scene);

  if (/(应用|安装|装一组|装上)/.test(text) && namedCatalogItemId(text) && surfaceId) {
    return [{ tool: 'apply_catalog_item', args: { catalogItemId: namedCatalogItemId(text), surfaceId } }];
  }

  if (BEDROOM_OPEN_STORAGE_PATTERN.test(text)) {
    return [
      { tool: 'inspect_room', args: { roomId: 'room-primary-bedroom' } },
      { tool: 'move_object', args: { objectId: 'object-primary-bed', dz: 100 } },
      { tool: 'check_rules', args: { roomId: 'room-primary-bedroom' } },
    ];
  }

  if (/(更舒服|舒服一点|更好住|想改善)/.test(text) && !namedRoomId(text) && !selectedObjectId) {
    return [{
      tool: 'request_clarification',
      args: { question: '你想先改善哪个房间，最困扰的是动线、收纳还是风格？', reason: '缺少空间和优先目标' },
    }];
  }

  if (/(墙|墙面)/.test(text) && /(木饰面|护墙板|木墙板)/.test(text)) {
    if (surfaceId) return [{ tool: 'apply_catalog_item', args: { catalogItemId: 'demo-wall-panel-light-oak', surfaceId } }];
    return [{ tool: 'request_clarification', args: { question: '你想把木饰面应用到哪一个房间的哪面墙？', reason: '目标墙面不明确' } }];
  }

  if (/(墙|墙面|地面|地板|瓷砖|顶面|天花)/.test(text) && /(改成|换成|设为|设置为)/.test(text)) {
    if (!surfaceId) return [{ tool: 'request_clarification', args: { question: '请先在户型图、3D 场景或装修表面列表中选择要修改的墙面、地面或顶面。', reason: '目标表面不明确' } }];
    const target = findById(scene?.surfaces, surfaceId);
    const materialId = namedSurfaceMaterialId(text, target?.kind);
    if (materialId) return [{ tool: 'set_surface_material', args: { surfaceId, materialId } }];
    return [{ tool: 'request_clarification', args: { question: '这个表面想用哪一种饰面？', reason: '饰面材质不明确' } }];
  }

  if (/(架子|层板|置物架|书架|开放架)/.test(text) && !/(改成|换成|设为|设置为)/.test(text)) {
    return [
      { tool: 'search_catalog', args: { query: text.includes('层板') ? '层板' : '架子', category: 'shelving', limit: 4 } },
      { tool: 'request_clarification', args: { question: '架体准备放在哪个房间、靠哪面墙，主要收纳什么？', reason: '墙装位置与承重条件尚未确认' } },
    ];
  }

  if (/(对比|上一版|版本|变化|差异|影响)/.test(text)) {
    const beforeVersionId = previousVersionId(versionHistory);
    return beforeVersionId ? [{ tool: 'compare_versions', args: { beforeVersionId } }] : [];
  }

  if (/(确认|定稿|认可|就这版)/.test(text)) {
    return [{ tool: 'request_confirmation', args: { message: '我已准备好把当前版本交给你确认。' } }];
  }

  if (/(规则|是否合法|能不能|会不会挡|检查)/.test(text)) {
    const roomId = namedRoomId(text);
    return [{ tool: 'check_rules', args: objectId ? { objectId } : roomId ? { roomId } : {} }];
  }

  if (!objectId) return [];

  const calls = [];
  if (/(改成|换成|设为|设置为)/.test(text)) {
    const materialId = namedMaterialId(text);
    if (materialId) calls.push({ tool: 'set_object_material', args: { objectId, materialId } });
  }

  if (/(移动|挪|移)/.test(text)) {
    const right = movementMm(text, 'right');
    const left = movementMm(text, 'left');
    const down = movementMm(text, 'down');
    const up = movementMm(text, 'up');
    if (right) calls.push({ tool: 'move_object', args: { objectId, dx: right } });
    else if (left) calls.push({ tool: 'move_object', args: { objectId, dx: -left } });
    else if (down) calls.push({ tool: 'move_object', args: { objectId, dz: down } });
    else if (up) calls.push({ tool: 'move_object', args: { objectId, dz: -up } });
  }

  if (text.includes('旋转')) {
    const value = degrees(text);
    if (Number.isFinite(value)) calls.push({ tool: 'rotate_object', args: { objectId, degrees: value, mode: 'delta' } });
  }

  if (/(删除|移除|不要了)/.test(text)) {
    return [{ tool: 'delete_object', args: { objectId } }];
  }

  return calls;
}

function normalizeToolCall(call) {
  if (!isRecord(call)) throw new Error('TOOL_CALL_INVALID');
  const tool = call.tool ?? call.name;
  const args = call.args ?? call.arguments ?? {};
  if (typeof tool !== 'string' || !TOOL_NAMES.has(tool) || !isRecord(args)) {
    throw new Error('TOOL_CALL_INVALID');
  }
  const normalizedArgs = stableJsonValue(args);
  const contract = TOOL_REGISTRY.find((entry) => entry.name === tool);
  const allowedArgs = new Set([...(contract?.requiredArgs ?? []), ...(contract?.optionalArgs ?? [])]);
  if (Object.keys(normalizedArgs).some((key) => !allowedArgs.has(key))) throw new Error('TOOL_CALL_INVALID');
  if (tool === 'request_clarification' && typeof normalizedArgs.question === 'string') {
    const body = normalizedArgs.question.replace(/[？?]+/g, '，').replace(/[，,\s]+$/, '').slice(0, 179).trim();
    normalizedArgs.question = `${body}？`;
  }
  return { tool, args: normalizedArgs };
}

function writeIntentSignature(call, scene) {
  const object = call.args.objectId ? findById(scene.objects, call.args.objectId) : null;
  if (call.tool === 'move_object') {
    return stableJsonValue({
      tool: call.tool,
      objectId: call.args.objectId,
      x: call.args.x ?? object?.transform.x + (call.args.dx ?? 0),
      z: call.args.z ?? object?.transform.z + (call.args.dz ?? 0),
    });
  }
  if (call.tool === 'rotate_object') {
    const radians = call.args.degrees * Math.PI / 180;
    return stableJsonValue({
      tool: call.tool,
      objectId: call.args.objectId,
      rotationY: call.args.mode === 'absolute' ? radians : object?.transform.rotationY + radians,
    });
  }
  return stableJsonValue(call);
}

function assertProviderWriteCallsMatchIntent(toolCalls, expectedCalls, scene) {
  const expectedWrites = expectedCalls.filter((call) => WRITE_TOOL_NAMES.has(call.tool));
  const actualWrites = toolCalls.filter((call) => WRITE_TOOL_NAMES.has(call.tool));
  if (expectedWrites.length !== actualWrites.length) throw new Error('TOOL_ARGS_NOT_ALLOWED');
  const remaining = expectedWrites.map((call) => writeIntentSignature(call, scene));
  for (const actual of actualWrites) {
    const signature = writeIntentSignature(actual, scene);
    const index = remaining.findIndex((expected) => JSON.stringify(expected) === JSON.stringify(signature));
    if (index < 0) throw new Error('TOOL_ARGS_NOT_ALLOWED');
    remaining.splice(index, 1);
  }
}

function inferAgentMode(input, localToolCalls) {
  if (hasNoWriteIntent(input)) return 'propose';
  if (localToolCalls.some((call) => WRITE_TOOL_NAMES.has(call.tool))) return 'execute';
  if (localToolCalls.some((call) => call.tool === 'request_clarification')) return 'clarify';
  return 'propose';
}

function providerStringArray(result, key, limit) {
  const value = result?.[key] ?? [];
  if (!Array.isArray(value) || value.length > limit || value.some((entry) => typeof entry !== 'string' || entry.length > 160)) {
    throw new Error('PROVIDER_SHAPE_INVALID');
  }
  return value;
}

function validateAssistantGrounding(reply, context) {
  const grounding = JSON.stringify(context);
  const knownNumbers = new Set(grounding.match(/\d+(?:\.\d+)?/g) ?? []);
  if ((reply.match(/\d+(?:\.\d+)?/g) ?? []).some((number) => !knownNumbers.has(number))) {
    throw new Error('PROVIDER_REPLY_UNGROUNDED');
  }
  // ponytail: block common invented installation prescriptions; replace with a policy service if the enterprise rule set grows.
  if (CONSTRUCTION_CLAIMS.some((term) => reply.includes(term) && !grounding.includes(term))) {
    throw new Error('PROVIDER_REPLY_UNGROUNDED');
  }
}

function compactAssistantReply(reply) {
  if (reply.length <= 180) return reply;
  const head = reply.slice(0, 179);
  const boundary = Math.max(head.lastIndexOf('。'), head.lastIndexOf('？'), head.lastIndexOf('！'), head.lastIndexOf('\n'));
  return `${head.slice(0, boundary >= 60 ? boundary + 1 : 179).trim()}…`;
}

function removeUngroundedNumberSentences(reply, context) {
  if (!context.styleEvidence) return reply;
  const knownNumbers = new Set(JSON.stringify(context).match(/\d+(?:\.\d+)?/g) ?? []);
  return (reply.match(/[^。！？!?\n]+[。！？!?]?/g) ?? [])
    .filter((sentence) => !(sentence.match(/\d+(?:\.\d+)?/g) ?? []).some((number) => !knownNumbers.has(number)))
    .join('')
    .trim();
}

function validateAssistantReply(reply) {
  if (reply.length > 180 || (reply.match(/[？?]/g)?.length ?? 0) > 1) throw new Error('PROVIDER_SHAPE_INVALID');
}

function normalizeProviderResult(result, context) {
  const calls = Array.isArray(result) ? result : result?.toolCalls ?? result?.tool_calls;
  if (!Array.isArray(calls)) throw new Error('PROVIDER_SHAPE_INVALID');
  const rawAssistantReply = result?.assistantReply ?? result?.assistant_reply ?? '';
  if (typeof rawAssistantReply !== 'string' || rawAssistantReply.length > 2000) throw new Error('PROVIDER_SHAPE_INVALID');
  const fullAssistantReply = rawAssistantReply
    .replace(/^(?:(?:您好|你好|好的|好|当然(?:可以)?|没问题)[，,。.!！\s]*)+/, '')
    .replace(/\*\*/g, '')
    .trim();
  let toolCalls = calls.map(normalizeToolCall);
  const providerModeExplicit = result?.mode !== undefined;
  const providerDeclaredMode = providerModeExplicit ? result.mode : null;
  const mode = context.mode;
  if (!AGENT_MODES.has(mode)) throw new Error('PROVIDER_MODE_INVALID');
  const reasons = providerStringArray(result, 'reasons', 2);
  const unresolved = providerStringArray(result, 'unresolved', 1);
  let clarificationRepaired = false;
  if (mode === 'clarify' && !toolCalls.some((call) => WRITE_TOOL_NAMES.has(call.tool)) && !toolCalls.some((call) => call.tool === 'request_clarification')) {
    const question = unresolved[0] ?? fullAssistantReply;
    if (!question) throw new Error('PROVIDER_MODE_INVALID');
    toolCalls = [...toolCalls, normalizeToolCall({ tool: 'request_clarification', args: { question } })];
    clarificationRepaired = true;
  }
  const groundingContext = { ...context, toolCalls };
  const clarificationQuestion = toolCalls.find((call) => call.tool === 'request_clarification')?.args?.question;
  const replyToValidate = mode === 'clarify' && typeof clarificationQuestion === 'string'
    ? clarificationQuestion
    : fullAssistantReply;
  const groundedAssistantReply = removeUngroundedNumberSentences(replyToValidate, groundingContext);
  const assistantReply = compactAssistantReply(groundedAssistantReply);
  const allowedToolNames = new Set(context.tools.map((tool) => tool.name));
  if (toolCalls.some((call) => !allowedToolNames.has(call.tool))) throw new Error('TOOL_NOT_ALLOWED');
  if (providerModeExplicit) {
    const hasWriteCall = toolCalls.some((call) => WRITE_TOOL_NAMES.has(call.tool));
    if (mode === 'clarify' && (hasWriteCall || !toolCalls.some((call) => call.tool === 'request_clarification'))) throw new Error('PROVIDER_MODE_INVALID');
    if (mode === 'propose' && hasWriteCall) throw new Error('PROVIDER_MODE_INVALID');
    if (mode === 'execute' && !hasWriteCall) throw new Error('PROVIDER_MODE_INVALID');
  }
  const providerModeIssue = providerModeExplicit && providerDeclaredMode !== mode
    ? 'PROVIDER_MODE_CORRECTED'
    : clarificationRepaired ? 'PROVIDER_CLARIFICATION_REPAIRED' : null;
  try {
    validateAssistantGrounding(groundedAssistantReply, groundingContext);
    validateAssistantReply(assistantReply);
    return { assistantReply, toolCalls, providerReplyIssue: providerModeIssue, mode, providerModeExplicit, providerDeclaredMode, reasons, unresolved };
  } catch (error) {
    const readOnlyTurn = context.tools.every((tool) => tool.writes !== true);
    const hasWriteCall = toolCalls.some((call) => context.tools.some((tool) => tool.name === call.tool && tool.writes === true));
    const inventedConstruction = CONSTRUCTION_CLAIMS.some((term) => fullAssistantReply.includes(term) && !JSON.stringify(context).includes(term));
    const safeToReplace = hasWriteCall ||
      (error?.message === 'PROVIDER_SHAPE_INVALID' && readOnlyTurn) ||
      (toolCalls.length === 0 && readOnlyTurn && !inventedConstruction);
    if (!['PROVIDER_REPLY_UNGROUNDED', 'PROVIDER_SHAPE_INVALID'].includes(error?.message) || !safeToReplace) throw error;
    return {
      assistantReply: toolCalls.length
        ? '已生成修改预览，最终结果以本地规则校验为准。'
        : '仅提供方向，不修改当前场景。请先确认具体位置和主要用途。',
      toolCalls,
      providerReplyIssue: error.message,
      mode,
      providerModeExplicit,
      providerDeclaredMode,
      reasons,
      unresolved,
    };
  }
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
  if (/^AILY_[A-Z_]+$/.test(message ?? '')) return message;
  if (message === 'PROVIDER_TIMEOUT') return message;
  if (message === 'PROVIDER_SHAPE_INVALID') return message;
  if (message === 'PROVIDER_REPLY_UNGROUNDED') return message;
  if (message === 'TOOL_CALL_INVALID') return message;
  if (message === 'TOOL_NOT_ALLOWED') return message;
  if (message === 'TOOL_ARGS_NOT_ALLOWED') return message;
  if (message === 'PROVIDER_MODE_INVALID') return message;
  return 'PROVIDER_FAILED';
}

function localFallbackReply(input) {
  if (BEDROOM_OPEN_STORAGE_PATTERN.test(input)) {
    return '保留衣柜和收纳量，先把双人床向背景墙收近 100 mm，释放房间中心；规则已检查。你更在意床侧通道还是衣柜开门？';
  }
  if (/(架子|层板|置物架|书架|开放架)/.test(input)) {
    return '演示目录里有悬浮层板和开放架体，但安装规则尚未接入。你想放在哪个房间的哪面墙？';
  }
  if (hasNoWriteIntent(input)) return '仅提供方向，不修改当前场景。';
  if (/(墙|墙面)/.test(input) && /(木饰面|护墙板|木墙板)/.test(input)) {
    return '已按演示目录提交浅橡木木饰面变更，实际材料、报价与施工条件仍需复核。';
  }
  return '';
}

function labelForToolTarget(call, scene) {
  if (call.args.objectId) return findById(scene.objects, call.args.objectId)?.name ?? call.args.objectId;
  if (call.args.surfaceId) {
    const surface = findById(scene.surfaces, call.args.surfaceId);
    const room = findById(scene.rooms, surface?.roomId);
    const kind = surface?.kind === 'wall' ? '墙面' : surface?.kind === 'floor' ? '地面' : surface?.kind === 'ceiling' ? '顶面' : '表面';
    return `${room?.name ?? ''}${kind}`;
  }
  return '当前对象';
}

function truthfulExecutionReply({ rolledBack, steps, toolCalls, scene }) {
  if (rolledBack) {
    const error = steps.find((step) => !step.ok)?.error ?? '本地规则未通过';
    const message = error.includes('OBJECT_FOOTPRINT_OUTSIDE_ROOM') || error.includes('ROOM_BOUNDARY')
      ? '会超出房间边界。'
      : error.includes('OBJECT_COLLISION')
        ? '会与其他家具发生碰撞。'
        : error.includes('CLEARANCE_OCCUPIED')
          ? '会侵占需要保留的通行空间。'
          : error.includes('NOT_MOVABLE') || error.includes('LOCKED')
            ? '该对象不允许这样修改。'
            : error.includes('NOT_SCENE_READY')
              ? '该组件尚未接入可写场景。'
              : '本地场景或规则校验未通过。';
    return `没有修改：${message}`;
  }
  const writes = toolCalls.filter((call) => WRITE_TOOL_NAMES.has(call.tool));
  if (!writes.length) return null;
  if (writes.length > 1) return `已通过本地规则校验并应用 ${writes.length} 项变更。`;
  const call = writes[0];
  const target = labelForToolTarget(call, scene);
  const action = call.tool === 'move_object' ? '移动'
    : call.tool === 'rotate_object' ? '旋转'
      : call.tool === 'delete_object' ? '删除'
        : call.tool === 'set_object_material' ? '材质修改'
          : '饰面修改';
  return `已通过本地规则校验并应用${target}的${action}。`;
}

async function normalizeCatalogToolCalls(toolCalls, catalogPlugin) {
  return Promise.all(toolCalls.map(async (call) => {
    if (call.tool !== 'set_surface_material' || typeof call.args?.materialId !== 'string') return call;
    const item = await Promise.resolve(catalogPlugin.get(call.args.materialId));
    if (!item) return call;
    return {
      tool: 'apply_catalog_item',
      args: { catalogItemId: item.id, surfaceId: call.args.surfaceId },
    };
  }));
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
  if (!Array.isArray(args[key]) || args[key].length > 8) {
    throw new Error(`ARG_INVALID: ${key}`);
  }
  const values = args[key].map((value) => typeof value === 'string' ? value : value?.label);
  if (values.some((value) => typeof value !== 'string' || value.length > 128)) throw new Error(`ARG_INVALID: ${key}`);
  return values;
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

async function executeTool(store, call, { catalogPlugin, versionHistory }) {
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
  if (tool === 'check_rules') {
    const objectId = optionalString(args, 'objectId');
    const roomId = optionalString(args, 'roomId');
    if (roomId && !findById(store.currentScene.rooms, roomId)) throw new Error(`ROOM_NOT_FOUND: ${roomId}`);
    const evaluation = evaluateDesignRules(store.currentScene);
    const checks = objectId
      ? evaluation.checks.filter((check) => check.objectIds.includes(objectId))
      : roomId
        ? filterDesignRuleChecksForRoom(store.currentScene, evaluation.checks, roomId)
        : evaluation.violations;
    const status = checks.some((check) => check.status === 'blocked')
      ? 'blocked'
      : checks.some((check) => check.status === 'warning')
        ? 'warning'
        : checks.some((check) => check.status === 'recommendation')
          ? 'recommendation'
          : 'passed';
    return {
      store,
      result: stableJsonValue({
        status,
        checks: checks.slice(0, 6),
        source: 'demo',
      }),
    };
  }
  if (tool === 'compare_versions') {
    if (!versionHistory) throw new Error('VERSION_HISTORY_REQUIRED');
    const beforeVersionId = requireString(args, 'beforeVersionId');
    const afterVersionId = optionalString(args, 'afterVersionId') ?? versionHistory.currentVersionId;
    return { store, result: stableJsonValue(compareVersionHistory(versionHistory, beforeVersionId, afterVersionId)) };
  }
  if (tool === 'request_confirmation') {
    return {
      store,
      result: stableJsonValue({
        versionId: optionalString(args, 'versionId') ?? versionHistory?.currentVersionId ?? null,
        message: optionalString(args, 'message') ?? '请确认当前版本；Agent 不会代替住户点击确认。',
        source: 'demo',
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
  if (tool === 'delete_object') {
    const objectId = requireString(args, 'objectId');
    return {
      store: dispatchSceneCommand(store, { type: 'object.delete', objectId }),
      result: { objectId, deleted: true },
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
  versionHistory = null,
  designBrief = createDesignBrief(),
  activeRoomId = null,
  timeoutMs = 1500,
} = {}) {
  if (!isRecord(store) || !isRecord(store.currentScene)) throw new Error('STORE_INVALID');
  if (!catalogPlugin || ['describe', 'summary', 'search', 'get'].some((method) => typeof catalogPlugin[method] !== 'function')) {
    throw new Error('CATALOG_PLUGIN_INVALID');
  }

  let source = 'local';
  let fallbackReason = null;
  let providerReplyIssue = null;
  let providerModeExplicit = false;
  let providerDeclaredMode = null;
  let reasons = [];
  let unresolved = [];
  let toolCalls = [];
  let assistantReply = '';
  const inputText = String(input ?? '');
  const currentBrief = normalizeDesignBrief(designBrief);
  const candidateTools = toolsForInput(inputText);
  const candidateToolNames = new Set(candidateTools.map((tool) => tool.name));
  const parsedLocalToolCalls = parseLocalToolCalls({ input: inputText, selectedObjectId, versionHistory, scene: store.currentScene })
    .filter((call) => candidateToolNames.has(call.tool));
  const mode = inferAgentMode(inputText, parsedLocalToolCalls);
  const turnTools = mode === 'execute' ? candidateTools : candidateTools.filter((tool) => !tool.writes);
  const allowedToolNames = new Set(turnTools.map((tool) => tool.name));
  const deterministicToolCalls = parsedLocalToolCalls.filter((call) => allowedToolNames.has(call.tool));
  const localToolCalls = () => deterministicToolCalls;
  const catalogSummary = stableJsonValue(await Promise.resolve(catalogPlugin.summary({ input: inputText })));
  const catalogDescription = stableJsonValue(await Promise.resolve(catalogPlugin.describe()));
  const styleEvidence = shouldRetrieveStyleCases(inputText) ? retrieveStyleCases(inputText, { limit: 3 }) : null;
  if (provider) {
    const providerContext = {
      input: inputText,
      mode,
      selectedObjectId,
      scene: summarizeScene(store.currentScene, String(input ?? ''), selectedObjectId),
      catalog: catalogSummary,
      tools: stableJsonValue(turnTools),
      versions: versionHistory ? stableJsonValue({
        currentVersionId: versionHistory.currentVersionId,
        confirmedVersionId: versionHistory.confirmedVersionId,
        versions: versionHistory.versions.map(({ id, label, status, parentVersionId, source, summary }) => ({ id, label, status, parentVersionId, source, summary })),
      }) : null,
      designBrief: stableJsonValue(currentBrief),
      styleEvidence: styleEvidenceForProvider(styleEvidence),
    };
    try {
      const providerResult = await withTimeout(
        Promise.resolve(provider(providerContext)),
        timeoutMs,
      );
      ({ assistantReply, toolCalls, providerReplyIssue, providerModeExplicit, providerDeclaredMode, reasons, unresolved } = normalizeProviderResult(providerResult, providerContext));
      toolCalls = await normalizeCatalogToolCalls(toolCalls, catalogPlugin);
      assertProviderWriteCallsMatchIntent(toolCalls, deterministicToolCalls, store.currentScene);
      source = 'provider';
    } catch (error) {
      fallbackReason = providerFailureCode(error);
      toolCalls = localToolCalls();
      assistantReply = localFallbackReply(inputText);
    }
  } else {
    toolCalls = localToolCalls();
    assistantReply = localFallbackReply(inputText);
  }

  let nextStore = store;
  const steps = [];
  let rolledBack = false;
  for (const call of toolCalls) {
    try {
      const executed = await executeTool(nextStore, call, { catalogPlugin, versionHistory });
      nextStore = executed.store;
      steps.push({ ok: true, tool: call.tool, args: call.args, result: executed.result });
    } catch (error) {
      steps.push({ ok: false, tool: call.tool, args: call.args, error: error?.message ?? 'TOOL_FAILED' });
      nextStore = store;
      rolledBack = true;
      break;
    }
  }

  const clarification = steps.find((step) => step.ok && step.tool === 'request_clarification')?.result;
  if (clarification?.question && !/[？?]/.test(assistantReply)) assistantReply = clarification.question;
  const executionReply = mode === 'execute' ? truthfulExecutionReply({ rolledBack, steps, toolCalls, scene: store.currentScene }) : null;
  if (executionReply) assistantReply = executionReply;

  const nextBrief = evolveDesignBrief(currentBrief, {
    input: inputText,
    activeRoomId: activeRoomId ?? roomIdForSelected(store.currentScene, selectedObjectId) ?? namedRoomId(inputText),
    selectedObjectId,
    steps,
  });
  const trace = stableJsonValue({
    assistantReply,
    catalog: catalogDescription,
    styleEvidence,
    fallbackReason,
    providerReplyIssue,
    mode,
    providerModeExplicit,
    providerDeclaredMode,
    reasons,
    unresolved,
    input: inputText,
    selectedObjectId,
    source,
    designBrief: nextBrief,
    steps,
    toolCalls,
    rolledBack,
  });

  return { store: nextStore, trace };
}
