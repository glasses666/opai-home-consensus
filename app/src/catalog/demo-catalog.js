const MANIFEST = Object.freeze({
  id: 'catalog-oppein-demo-v1',
  name: '欧派式合成组件目录',
  schemaVersion: 1,
  source: 'demo',
  provider: 'local-demo',
  capabilities: ['search', 'get', 'apply_surface_finish'],
  disclaimer: '合成演示数据，不代表欧派真实 SKU、价格、工期或施工规则。',
});

const estimate = (min, max, unit) => ({ min, max, unit, currency: 'CNY', source: 'estimate' });
const leadTime = (min, max) => ({ min, max, unit: 'day', source: 'estimate' });

const ITEMS = [
  {
    id: 'demo-wall-paint-warm-white', externalId: 'DEMO-WALL-001', name: '暖白哑光墙面系统',
    kind: 'surface_finish', category: 'wall_finish', appliesTo: ['wall'], tags: ['墙面', '乳胶漆', '暖白', '哑光'],
    sceneReady: true, operation: { type: 'surface.setMaterial', materialId: 'mat-wall-warm-white' },
    commercial: { price: estimate(65, 110, 'm2'), leadTime: leadTime(3, 6) }, constraints: [], source: 'demo',
  },
  {
    id: 'demo-wall-panel-light-oak', externalId: 'DEMO-WALL-002', name: '浅橡木木饰面墙板',
    kind: 'wall_system', category: 'wall_finish', appliesTo: ['wall'], tags: ['墙面', '护墙板', '木饰面', '浅橡木'],
    sceneReady: true, operation: { type: 'surface.setMaterial', materialId: 'mat-wall-oak-panel' },
    commercial: { price: estimate(580, 920, 'm2'), leadTime: leadTime(18, 28) },
    constraints: [{ code: 'DEMO_WALL_FLATNESS', message: '基层平整度与收口方式需由设计师复核。', source: 'demo' }], source: 'demo',
  },
  {
    id: 'demo-wall-microcement-greige', externalId: 'DEMO-WALL-003', name: '暖灰微水泥墙面',
    kind: 'surface_finish', category: 'wall_finish', appliesTo: ['wall'], tags: ['墙面', '微水泥', '暖灰', '无缝'],
    sceneReady: true, operation: { type: 'surface.setMaterial', materialId: 'mat-wall-greige' },
    commercial: { price: estimate(260, 420, 'm2'), leadTime: leadTime(8, 14) },
    constraints: [{ code: 'DEMO_WET_AREA_REVIEW', message: '潮湿区域需复核基层与防水系统。', source: 'demo' }], source: 'demo',
  },
  {
    id: 'demo-floor-light-oak', externalId: 'DEMO-FLOOR-001', name: '浅橡木复合地板',
    kind: 'surface_finish', category: 'floor_finish', appliesTo: ['floor'], tags: ['地面', '木地板', '浅橡木'],
    sceneReady: true, operation: { type: 'surface.setMaterial', materialId: 'mat-floor-light-oak' },
    commercial: { price: estimate(280, 480, 'm2'), leadTime: leadTime(10, 18) }, constraints: [], source: 'demo',
  },
  {
    id: 'demo-floor-warm-tile', externalId: 'DEMO-FLOOR-002', name: '暖灰哑光砖',
    kind: 'surface_finish', category: 'floor_finish', appliesTo: ['floor'], tags: ['地面', '瓷砖', '暖灰', '哑光'],
    sceneReady: true, operation: { type: 'surface.setMaterial', materialId: 'mat-floor-tile-warm' },
    commercial: { price: estimate(220, 380, 'm2'), leadTime: leadTime(10, 20) }, constraints: [], source: 'demo',
  },
  {
    id: 'demo-shelf-floating-900', externalId: 'DEMO-SHELF-001', name: '900 悬浮层板',
    kind: 'mounted_component', category: 'shelving', appliesTo: ['wall'], tags: ['架子', '层板', '置物架', '悬浮', '墙装'],
    sceneReady: false, dimensions: { width: 900, depth: 260, height: 45 },
    commercial: { price: estimate(680, 980, 'piece'), leadTime: leadTime(14, 24) },
    constraints: [{ code: 'DEMO_WALL_MOUNT_REQUIRED', message: '需校验墙体基层、固定点、标高与承重。', source: 'demo' }], source: 'demo',
  },
  {
    id: 'demo-shelf-open-1800', externalId: 'DEMO-SHELF-002', name: '1800 开放架体',
    kind: 'built_in_component', category: 'shelving', appliesTo: ['floor', 'wall'], tags: ['架子', '开放格', '书架', '展示架', '收纳'],
    sceneReady: false, dimensions: { width: 1800, depth: 360, height: 2200 },
    commercial: { price: estimate(6800, 9800, 'set'), leadTime: leadTime(20, 32) },
    constraints: [{ code: 'DEMO_TIP_OVER_REVIEW', message: '高柜需复核防倾倒固定与前方净距。', source: 'demo' }], source: 'demo',
  },
  {
    id: 'demo-partition-oak-slat-1200', externalId: 'DEMO-PART-001', name: '浅橡木格栅隔断',
    kind: 'built_in_component', category: 'partition', appliesTo: ['floor', 'ceiling'], tags: ['隔断', '格栅', '半通透', '浅橡木'],
    sceneReady: false, dimensions: { width: 1200, depth: 120, height: 2600 },
    commercial: { price: estimate(5200, 7600, 'set'), leadTime: leadTime(20, 32) },
    constraints: [{ code: 'DEMO_EGRESS_REVIEW', message: '不得侵占主通道、门扇与消防疏散范围。', source: 'demo' }], source: 'demo',
  },
  {
    id: 'demo-media-base-2200', externalId: 'DEMO-CAB-001', name: '2200 电视地柜组合',
    kind: 'built_in_component', category: 'cabinetry', appliesTo: ['floor', 'wall'], tags: ['电视柜', '地柜', '收纳', '客厅'],
    sceneReady: false, dimensions: { width: 2200, depth: 450, height: 520 },
    commercial: { price: estimate(7800, 11600, 'set'), leadTime: leadTime(22, 35) },
    constraints: [{ code: 'DEMO_CABINET_FRONT_900', message: '柜前建议保留 900 mm 操作净距。', source: 'demo' }], source: 'demo',
  },
  {
    id: 'demo-wardrobe-2400', externalId: 'DEMO-CAB-002', name: '2400 平板门衣柜',
    kind: 'built_in_component', category: 'cabinetry', appliesTo: ['floor', 'wall'], tags: ['衣柜', '收纳', '卧室', '到顶柜'],
    sceneReady: false, dimensions: { width: 2400, depth: 600, height: 2400 },
    commercial: { price: estimate(16800, 23800, 'set'), leadTime: leadTime(24, 38) },
    constraints: [{ code: 'DEMO_CABINET_FRONT_900', message: '柜前建议保留 900 mm 操作净距。', source: 'demo' }], source: 'demo',
  },
  {
    id: 'demo-sofa-2200', externalId: 'DEMO-FURN-001', name: '2200 三人位模块沙发',
    kind: 'movable_component', category: 'furniture', appliesTo: ['floor'], tags: ['沙发', '家具', '模块', '客厅'],
    sceneReady: false, dimensions: { width: 2200, depth: 900, height: 820 },
    commercial: { price: estimate(8200, 12800, 'piece'), leadTime: leadTime(14, 28) }, constraints: [], source: 'demo',
  },
  {
    id: 'demo-door-flat-warm-white', externalId: 'DEMO-DOOR-001', name: '暖白平板室内门',
    kind: 'opening_component', category: 'door', appliesTo: ['wall'], tags: ['门', '室内门', '暖白', '平板门'],
    sceneReady: false, dimensions: { width: 800, depth: 45, height: 2100 },
    commercial: { price: estimate(2600, 4200, 'set'), leadTime: leadTime(20, 32) },
    constraints: [{ code: 'DEMO_OPENING_REVIEW', message: '门洞、墙厚、开启方向与五金需复核。', source: 'demo' }], source: 'demo',
  },
  {
    id: 'demo-worktop-quartz-20', externalId: 'DEMO-TOP-001', name: '20 mm 暖白石英石台面',
    kind: 'finish_component', category: 'worktop', appliesTo: ['cabinet'], tags: ['台面', '石英石', '厨房', '暖白'],
    sceneReady: false, dimensions: { depth: 650, height: 20 },
    commercial: { price: estimate(980, 1480, 'm'), leadTime: leadTime(18, 28) },
    constraints: [{ code: 'DEMO_CUTOUT_REVIEW', message: '水槽、灶具开孔和现场复尺后才能下单。', source: 'demo' }], source: 'demo',
  },
  {
    id: 'demo-ceiling-paint-warm-white', externalId: 'DEMO-CEIL-FIN-001', name: '暖白哑光顶面饰面',
    kind: 'surface_finish', category: 'ceiling_finish', appliesTo: ['ceiling'], tags: ['顶面', '天花', '暖白', '哑光'],
    sceneReady: true, operation: { type: 'surface.setMaterial', materialId: 'mat-ceiling-warm-white' },
    commercial: { price: estimate(55, 95, 'm2'), leadTime: leadTime(3, 6) }, constraints: [], source: 'demo',
  },
  {
    id: 'demo-ceiling-paint-greige', externalId: 'DEMO-CEIL-FIN-002', name: '暖灰哑光顶面饰面',
    kind: 'surface_finish', category: 'ceiling_finish', appliesTo: ['ceiling'], tags: ['顶面', '天花', '暖灰', '哑光'],
    sceneReady: true, operation: { type: 'surface.setMaterial', materialId: 'mat-ceiling-greige' },
    commercial: { price: estimate(65, 110, 'm2'), leadTime: leadTime(3, 6) }, constraints: [], source: 'demo',
  },
  {
    id: 'demo-ceiling-cove', externalId: 'DEMO-CEIL-001', name: '无主灯边吊系统',
    kind: 'architectural_component', category: 'ceiling', appliesTo: ['ceiling', 'wall'], tags: ['吊顶', '无主灯', '灯槽', '顶面'],
    sceneReady: false, dimensions: { depth: 320, height: 180 },
    commercial: { price: estimate(360, 560, 'm'), leadTime: leadTime(10, 18) },
    constraints: [{ code: 'DEMO_CEILING_HEIGHT_REVIEW', message: '需结合梁位、机电与净高复核。', source: 'demo' }], source: 'demo',
  },
  {
    id: 'demo-hardware-handle-black', externalId: 'DEMO-HW-001', name: '石墨黑短拉手',
    kind: 'hardware_component', category: 'hardware', appliesTo: ['cabinet'], tags: ['五金', '拉手', '柜门', '石墨黑'],
    sceneReady: false, dimensions: { width: 160, depth: 28, height: 18 },
    commercial: { price: estimate(45, 90, 'piece'), leadTime: leadTime(7, 14) }, constraints: [], source: 'demo',
  },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateItem(item) {
  if (!item?.id || !item?.externalId || !item?.name || !item?.kind || !item?.category) throw new Error('CATALOG_ITEM_INVALID');
  if (item.source !== 'demo') throw new Error('CATALOG_SOURCE_INVALID');
  if (!Array.isArray(item.appliesTo) || !Array.isArray(item.tags) || typeof item.sceneReady !== 'boolean') throw new Error('CATALOG_ITEM_INVALID');
  if (item.commercial?.price?.source !== 'estimate' || item.commercial?.leadTime?.source !== 'estimate') throw new Error('CATALOG_ESTIMATE_SOURCE_INVALID');
}

for (const item of ITEMS) validateItem(item);
const ITEM_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));
const CATEGORY_HINTS = [
  [/(墙|墙面|护墙板|木饰面|微水泥)/, 'wall_finish'],
  [/(地面|地板|瓷砖)/, 'floor_finish'],
  [/(架子|层板|置物架|书架|开放架)/, 'shelving'],
  [/(隔断|格栅)/, 'partition'],
  [/(柜|收纳)/, 'cabinetry'],
  [/(沙发|家具|餐桌|床)/, 'furniture'],
  [/(门|门洞)/, 'door'],
  [/(台面|石英石)/, 'worktop'],
  [/(吊顶|灯槽)/, 'ceiling'],
  [/(顶面|天花)/, 'ceiling_finish'],
  [/(五金|拉手)/, 'hardware'],
];

function optionalText(value, name) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 128) throw new Error(`CATALOG_${name.toUpperCase()}_INVALID`);
  return value.trim().toLowerCase();
}

function searchableText(item) {
  return [item.id, item.externalId, item.name, item.kind, item.category, ...item.appliesTo, ...item.tags].join(' ').toLowerCase();
}

export const demoCatalogPlugin = Object.freeze({
  describe() {
    return clone({ ...MANIFEST, itemCount: ITEMS.length, categories: [...new Set(ITEMS.map((item) => item.category))].sort() });
  },

  summary({ input = '' } = {}) {
    if (typeof input !== 'string' || input.length > 4000) throw new Error('CATALOG_INPUT_INVALID');
    const hinted = new Set(CATEGORY_HINTS.filter(([pattern]) => pattern.test(input)).map(([, category]) => category));
    const relevantItems = hinted.size ? ITEMS.filter((item) => hinted.has(item.category)) : [];
    return clone({
      id: MANIFEST.id,
      source: MANIFEST.source,
      disclaimer: MANIFEST.disclaimer,
      items: relevantItems.map(({ id, name, kind, category, appliesTo, sceneReady, constraints, source }) => ({
        id, name, kind, category, appliesTo, sceneReady,
        constraints: constraints.map(({ message }) => message),
        source,
      })),
    });
  },

  search({ query, category, kind, appliesTo, limit = 8 } = {}) {
    const normalizedQuery = optionalText(query, 'query');
    const normalizedCategory = optionalText(category, 'category');
    const normalizedKind = optionalText(kind, 'kind');
    const normalizedAppliesTo = optionalText(appliesTo, 'applies_to');
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('CATALOG_LIMIT_INVALID');
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const matches = ITEMS.filter((item) => {
      if (normalizedCategory && item.category.toLowerCase() !== normalizedCategory) return false;
      if (normalizedKind && item.kind.toLowerCase() !== normalizedKind) return false;
      if (normalizedAppliesTo && !item.appliesTo.some((value) => value.toLowerCase() === normalizedAppliesTo)) return false;
      const text = searchableText(item);
      return tokens.every((token) => text.includes(token));
    });
    return clone(matches.slice(0, limit));
  },

  get(itemId) {
    if (typeof itemId !== 'string' || itemId.length > 128) throw new Error('CATALOG_ITEM_ID_INVALID');
    const item = ITEM_BY_ID.get(itemId);
    return item ? clone(item) : null;
  },
});
