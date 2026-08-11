const allCapabilities = (overrides) => ({
  selectable: true,
  movable: false,
  rotatable: false,
  replaceable: false,
  deletable: false,
  duplicable: false,
  materialEditable: false,
  parameterEditable: false,
  ...overrides,
});

const rectangle = (x, z, width, depth) => [
  { x, z },
  { x: x + width, z },
  { x: x + width, z: z + depth },
  { x, z: z + depth },
];

const media2D = (filename) => ({
  src: `/assets/furniture/${filename}`,
  source: 'generated',
  view: 'orthographic-top',
});

const model3D = (filename) => ({
  src: `/assets/models/${filename}`,
  format: 'glb',
  source: 'generated',
  generator: 'scripts/build_demo_assets.py',
});

const withObjectContract = (object) => {
  const fixed = object.category === 'fixed-cabinet';
  return {
    ...object,
    hierarchy: { parentId: object.roomId, layer: fixed ? 'fixed_installation' : 'furniture' },
    placement: {
      mode: 'surface_anchored',
      hostSurfaceId: `surface-floor-${object.roomId.slice(5)}`,
      offset: { x: 0, y: 0, z: 0 },
    },
    collision: {
      kind: 'box',
      participates: true,
      source: 'canonical',
      dimensions: { ...object.dimensions },
      offset: { x: 0, y: 0, z: 0 },
    },
    review: {
      requiresProfessionalReview: fixed,
      status: fixed ? 'required' : 'not_required',
      reasons: fixed ? ['installation_anchor_requires_site_verification'] : [],
      source: 'demo',
    },
    model3D: {
      ...object.model3D,
      slotId: `slot-${object.id}`,
      revision: 1,
      units: 'mm',
      upAxis: 'y',
      forwardAxis: 'z',
      renderBounds: { ...object.dimensions },
      provenance: { provider: 'local-generator', generationId: object.model3D.src, humanReviewed: true },
    },
    capabilities: { ...object.capabilities, replaceable: !fixed && object.capabilities.selectable },
  };
};

const floor = (id, roomId, polygon, materialId = 'mat-floor-light-oak') => ({
  id,
  kind: 'floor',
  roomId,
  polygon,
  materialId,
  source: 'demo',
  capabilities: { materialEditable: true },
  ruleIds: ['rule-room-boundary'],
});

const ceiling = (id, roomId, polygon, elevation = 2800) => ({
  id,
  kind: 'ceiling',
  roomId,
  polygon,
  elevation,
  materialId: 'mat-ceiling-warm-white',
  source: 'demo',
  capabilities: { materialEditable: true },
  ruleIds: ['rule-room-boundary'],
});

const wall = (id, roomId, start, end, thickness = 120) => ({
  id,
  kind: 'wall',
  roomId,
  edge: { start, end },
  height: 2800,
  thickness,
  materialId: 'mat-wall-warm-white',
  source: 'demo',
  capabilities: { materialEditable: true },
  ruleIds: ['rule-room-boundary', 'rule-opening-clearance'],
});

const rooms = [
  {
    id: 'room-primary-bedroom',
    name: 'Primary Bedroom',
    kind: 'bedroom',
    polygon: rectangle(0, 0, 4000, 3200),
    adjacentRoomIds: ['room-hall', 'room-living-dining'],
    cameraPresetIds: ['camera-primary-overhead', 'camera-primary-entry', 'camera-primary-feature'],
  },
  {
    id: 'room-bathroom',
    name: 'Bathroom',
    kind: 'bathroom',
    polygon: rectangle(4000, 0, 2400, 2400),
    adjacentRoomIds: ['room-hall'],
    cameraPresetIds: ['camera-bathroom-overhead'],
  },
  {
    id: 'room-flex',
    name: 'Flex Bedroom Study',
    kind: 'bedroom-study',
    polygon: rectangle(6400, 0, 4600, 3200),
    adjacentRoomIds: ['room-hall', 'room-living-dining', 'room-kitchen'],
    cameraPresetIds: ['camera-flex-overhead', 'camera-flex-entry', 'camera-flex-feature'],
  },
  {
    id: 'room-hall',
    name: 'Hall',
    kind: 'circulation',
    polygon: rectangle(4000, 2400, 2400, 1600),
    adjacentRoomIds: ['room-primary-bedroom', 'room-bathroom', 'room-flex', 'room-living-dining'],
    cameraPresetIds: ['camera-hall-overhead'],
  },
  {
    id: 'room-living-dining',
    name: 'Open Living Dining',
    kind: 'living-dining',
    polygon: [
      { x: 0, z: 3200 },
      { x: 4000, z: 3200 },
      { x: 4000, z: 4000 },
      { x: 6400, z: 4000 },
      { x: 6400, z: 3200 },
      { x: 7600, z: 3200 },
      { x: 7600, z: 8000 },
      { x: 0, z: 8000 },
    ],
    adjacentRoomIds: ['room-primary-bedroom', 'room-flex', 'room-hall', 'room-kitchen', 'room-entry'],
    cameraPresetIds: ['camera-living-overhead', 'camera-living-entry', 'camera-living-feature'],
  },
  {
    id: 'room-kitchen',
    name: 'Kitchen',
    kind: 'kitchen',
    polygon: rectangle(7600, 3200, 3400, 2400),
    adjacentRoomIds: ['room-flex', 'room-living-dining', 'room-entry'],
    cameraPresetIds: ['camera-kitchen-overhead'],
  },
  {
    id: 'room-entry',
    name: 'Entry',
    kind: 'entry',
    polygon: rectangle(7600, 5600, 3400, 2400),
    adjacentRoomIds: ['room-living-dining', 'room-kitchen'],
    cameraPresetIds: ['camera-entry-overhead'],
  },
];

const roomCenter = (room) => {
  const xs = room.polygon.map((point) => point.x);
  const zs = room.polygon.map((point) => point.z);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...zs) - Math.min(...zs),
  };
};

const livingEntryCamera = {
  id: 'camera-living-entry',
  roomId: 'room-living-dining',
  kind: 'room_entry',
  label: '入口',
  position: { x: 4700, y: 1720, z: 4200 },
  target: { x: 3400, y: 720, z: 6350 },
  fov: 58,
};

const cameraPresets = [
  {
    id: 'camera-home-overview',
    roomId: null,
    kind: 'whole_home',
    label: '整屋',
    position: { x: 14700, y: 12600, z: 15100 },
    target: { x: 5500, y: 0, z: 4100 },
    fov: 34,
  },
  ...rooms.map((room) => {
    const center = roomCenter(room);
    const heading = room.id === livingEntryCamera.roomId
      ? { x: livingEntryCamera.position.x - livingEntryCamera.target.x, z: livingEntryCamera.position.z - livingEntryCamera.target.z }
      : { x: 0, z: 1 };
    const headingLength = Math.hypot(heading.x, heading.z);
    return {
      id: room.cameraPresetIds[0],
      roomId: room.id,
      kind: 'room_overhead',
      label: '俯视',
      position: {
        x: center.x + heading.x / headingLength * 60,
        y: Math.max(7200, Math.max(center.width, center.depth) * 1.8),
        z: center.z + heading.z / headingLength * 60,
      },
      target: { x: center.x, y: 0, z: center.z },
      fov: 32,
    };
  }),
  livingEntryCamera,
  {
    id: 'camera-primary-entry',
    roomId: 'room-primary-bedroom',
    kind: 'room_entry',
    label: '入口',
    position: { x: 3150, y: 2600, z: 3000 },
    target: { x: 1200, y: 300, z: 1000 },
    fov: 65,
  },
  {
    id: 'camera-primary-feature',
    roomId: 'room-primary-bedroom',
    surfaceId: 'surface-wall-primary-east',
    kind: 'surface_feature',
    label: '主功能面',
    position: { x: 800, y: 1500, z: 1600 },
    target: { x: 3300, y: 1200, z: 1600 },
    fov: 44,
  },
  {
    id: 'camera-flex-entry',
    roomId: 'room-flex',
    kind: 'room_entry',
    label: '入口',
    position: { x: 7000, y: 1650, z: 2750 },
    target: { x: 8800, y: 720, z: 1450 },
    fov: 52,
  },
  {
    id: 'camera-flex-feature',
    roomId: 'room-flex',
    surfaceId: 'surface-wall-flex-east',
    kind: 'surface_feature',
    label: '主功能面',
    position: { x: 8000, y: 1450, z: 1600 },
    target: { x: 10300, y: 850, z: 1600 },
    fov: 44,
  },
  {
    id: 'camera-living-feature',
    roomId: 'room-living-dining',
    surfaceId: 'surface-wall-living-south',
    kind: 'surface_feature',
    label: '主功能面',
    position: { x: 2200, y: 1450, z: 4750 },
    target: { x: 2200, y: 820, z: 7850 },
    fov: 43,
  },
  {
    id: 'camera-living-sofa',
    roomId: 'room-living-dining',
    objectId: 'object-sofa',
    kind: 'object_feature',
    label: '沙发入口',
    position: { x: 4700, y: 1720, z: 4200 },
    target: { x: 2200, y: 410, z: 5600 },
    fov: 52,
  },
  {
    id: 'camera-living-dining',
    roomId: 'room-living-dining',
    objectId: 'object-dining-table',
    kind: 'object_overhead',
    label: '餐桌俯视',
    position: { x: 6230, y: 4200, z: 5650 },
    target: { x: 6200, y: 370, z: 5700 },
    fov: 38,
  },
  {
    id: 'camera-primary-wardrobe',
    roomId: 'room-primary-bedroom',
    objectId: 'object-primary-wardrobe',
    kind: 'object_feature',
    label: '衣柜立面',
    position: { x: 900, y: 1500, z: 1600 },
    target: { x: 3500, y: 1200, z: 1200 },
    fov: 45,
  },
  {
    id: 'camera-flex-desk',
    roomId: 'room-flex',
    objectId: 'object-flex-desk',
    kind: 'object_feature',
    label: '书桌工作面',
    position: { x: 8100, y: 1450, z: 1600 },
    target: { x: 10450, y: 850, z: 1600 },
    fov: 44,
  },
  {
    id: 'camera-kitchen-worktop',
    roomId: 'room-kitchen',
    objectId: 'object-kitchen-counter',
    kind: 'object_feature',
    label: '厨房工作面',
    position: { x: 9300, y: 1550, z: 5250 },
    target: { x: 9300, y: 820, z: 3650 },
    fov: 47,
  },
  {
    id: 'camera-entry-storage',
    roomId: 'room-entry',
    objectId: 'object-shoe-cabinet',
    kind: 'object_feature',
    label: '玄关收纳面',
    position: { x: 8500, y: 1450, z: 6800 },
    target: { x: 10500, y: 850, z: 6800 },
    fov: 45,
  },
];

/**
 * Synthetic whole-home CAD fixture. All dimensions are integer millimeters.
 * Furniture placement is intentionally traceable to named demo design rules.
 * @returns {object}
 */
export function createDemoScene() {
  return {
    id: 'scene-demo-whole-home',
    schemaVersion: 1,
    floorPlan: {
      id: 'floor-demo-001',
      units: 'mm',
      origin: 'northwest-floor',
      axes: { x: 'east', y: 'up', z: 'south' },
      bounds: { x: 0, z: 0, width: 11000, depth: 8000, height: 2800 },
    },
    rooms,
    cameraPresets,
    materials: [
      { id: 'mat-ceiling-greige', name: '暖灰顶面', kind: 'paint', appliesTo: ['ceiling'], source: 'demo', color: '#d8d0c4' },
      { id: 'mat-ceiling-warm-white', name: '暖白顶面', kind: 'paint', appliesTo: ['ceiling'], source: 'demo', color: '#f4f0e8' },
      { id: 'mat-door-warm-white', name: '暖白门板', kind: 'painted-wood', appliesTo: ['opening'], source: 'demo', color: '#f3eee6' },
      { id: 'mat-fabric-warm-gray', name: '暖灰织物', kind: 'fabric', appliesTo: ['object'], source: 'demo', color: '#8d8a83' },
      { id: 'mat-floor-light-oak', name: '浅橡木地板', kind: 'wood', appliesTo: ['floor'], source: 'demo', color: '#d6b98c' },
      { id: 'mat-floor-tile-warm', name: '暖灰哑光砖', kind: 'porcelain-tile', appliesTo: ['floor'], source: 'demo', color: '#ddd4c5' },
      { id: 'mat-oak-veneer', name: '浅橡木饰面', kind: 'wood', appliesTo: ['object'], source: 'demo', color: '#c79f68' },
      { id: 'mat-object-warm-white', name: '暖白家具饰面', kind: 'painted-wood', appliesTo: ['object'], source: 'demo', color: '#eee8de' },
      { id: 'mat-wall-greige', name: '暖灰微水泥墙面', kind: 'microcement', appliesTo: ['wall'], source: 'demo', color: '#b9afa2' },
      { id: 'mat-wall-oak-panel', name: '浅橡木墙板', kind: 'wood-wall-panel', appliesTo: ['wall'], source: 'demo', color: '#c8a577' },
      { id: 'mat-wall-warm-white', name: '暖白哑光墙面', kind: 'paint', appliesTo: ['wall', 'opening'], source: 'demo', color: '#f6f1e8' },
    ],
    rules: [
      { id: 'rule-room-boundary', kind: 'boundary', severity: 'error', source: 'demo', applicability: '演示户型：家具不得越出所属房间' },
      { id: 'rule-opening-clearance', kind: 'opening-clearance', severity: 'warning', source: 'demo', applicability: '演示户型：门扇开启弧线需保持可用' },
      { id: 'rule-main-circulation-900', kind: 'circulation', severity: 'error', minimumMm: 900, source: 'demo', applicability: '演示户型：主通道至少保留 900 mm' },
      { id: 'rule-kitchen-aisle-1000', kind: 'work-aisle', severity: 'error', minimumMm: 1000, source: 'demo', applicability: '演示户型：厨房操作通道至少保留 1000 mm' },
      { id: 'rule-bedside-600', kind: 'bedside-clearance', severity: 'warning', minimumMm: 600, source: 'demo', applicability: '演示户型：床侧通行至少保留 600 mm' },
      { id: 'rule-child-activity-clearance', kind: 'child-activity-clearance', severity: 'warning', minimumMm: 1600, source: 'demo', applicability: '演示儿童房：床与书桌调整后保留成长活动留白' },
      { id: 'rule-cabinet-front-900', kind: 'cabinet-front-clearance', severity: 'warning', minimumMm: 900, source: 'demo', applicability: '演示户型：柜前需要保留可使用净距' },
      { id: 'rule-tv-distance-1800-3600', kind: 'tv-viewing-distance', severity: 'recommendation', minimumMm: 1800, maximumMm: 3600, source: 'demo', applicability: '演示舒适性：沙发与电视保持舒适观看距离' },
      { id: 'rule-tall-storage-anchored', kind: 'child-safety-antitip', severity: 'warning', source: 'demo', applicability: '演示儿童安全：高柜需固定或防倾倒' },
      { id: 'rule-fixed-equipment-wall-relation', kind: 'fixed-equipment-relation', severity: 'error', source: 'demo', applicability: '演示硬装构件：固定设备应贴近墙面或管线面' },
    ],
    surfaces: [
      ...rooms.map((room) => floor(
        `surface-floor-${room.id.slice(5)}`,
        room.id,
        room.polygon,
        ['bathroom', 'kitchen'].includes(room.kind) ? 'mat-floor-tile-warm' : 'mat-floor-light-oak',
      )),
      ...rooms.map((room) => ceiling(
        `surface-ceiling-${room.id.slice(5)}`,
        room.id,
        room.polygon,
      )),
      wall('surface-wall-primary-north', 'room-primary-bedroom', { x: 0, z: 0 }, { x: 4000, z: 0 }, 180),
      wall('surface-wall-bathroom-north', 'room-bathroom', { x: 4000, z: 0 }, { x: 6400, z: 0 }, 180),
      wall('surface-wall-flex-north', 'room-flex', { x: 6400, z: 0 }, { x: 11000, z: 0 }, 180),
      wall('surface-wall-primary-west', 'room-primary-bedroom', { x: 0, z: 3200 }, { x: 0, z: 0 }, 180),
      wall('surface-wall-living-west', 'room-living-dining', { x: 0, z: 8000 }, { x: 0, z: 3200 }, 180),
      wall('surface-wall-flex-east', 'room-flex', { x: 11000, z: 0 }, { x: 11000, z: 3200 }, 180),
      wall('surface-wall-kitchen-east', 'room-kitchen', { x: 11000, z: 3200 }, { x: 11000, z: 5600 }, 180),
      wall('surface-wall-entry-east', 'room-entry', { x: 11000, z: 5600 }, { x: 11000, z: 8000 }, 180),
      wall('surface-wall-living-south', 'room-living-dining', { x: 7600, z: 8000 }, { x: 0, z: 8000 }, 180),
      wall('surface-wall-entry-south', 'room-entry', { x: 11000, z: 8000 }, { x: 7600, z: 8000 }, 180),
      wall('surface-wall-primary-east', 'room-primary-bedroom', { x: 4000, z: 0 }, { x: 4000, z: 3200 }),
      wall('surface-wall-primary-south', 'room-primary-bedroom', { x: 4000, z: 3200 }, { x: 0, z: 3200 }),
      wall('surface-wall-bathroom-east', 'room-bathroom', { x: 6400, z: 0 }, { x: 6400, z: 2400 }),
      wall('surface-wall-bathroom-south', 'room-bathroom', { x: 6400, z: 2400 }, { x: 4000, z: 2400 }),
      wall('surface-wall-hall-west-south', 'room-hall', { x: 4000, z: 3200 }, { x: 4000, z: 4000 }),
      wall('surface-wall-hall-east', 'room-hall', { x: 6400, z: 2400 }, { x: 6400, z: 4000 }),
      wall('surface-wall-hall-south', 'room-hall', { x: 6400, z: 4000 }, { x: 4000, z: 4000 }),
      wall('surface-wall-flex-south', 'room-flex', { x: 6400, z: 3200 }, { x: 11000, z: 3200 }),
      wall('surface-wall-living-east-kitchen', 'room-living-dining', { x: 7600, z: 3200 }, { x: 7600, z: 5600 }),
      wall('surface-wall-living-east-entry', 'room-living-dining', { x: 7600, z: 5600 }, { x: 7600, z: 8000 }),
      wall('surface-wall-kitchen-south', 'room-kitchen', { x: 11000, z: 5600 }, { x: 7600, z: 5600 }),
    ],
    openings: [
      { id: 'opening-entry-exterior', kind: 'exterior-door', hostSurfaceId: 'surface-wall-entry-south', offset: 400, width: 900, height: 2100, sillHeight: 0, materialId: 'mat-door-warm-white', connectsExterior: true, swing: { hinge: 'start', side: 1 }, ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-primary-hall', kind: 'interior-door', hostSurfaceId: 'surface-wall-primary-east', offset: 2400, width: 800, height: 2100, sillHeight: 0, materialId: 'mat-door-warm-white', connectsRoomIds: ['room-primary-bedroom', 'room-hall'], swing: { hinge: 'start', side: 1 }, ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-bathroom-hall', kind: 'interior-door', hostSurfaceId: 'surface-wall-bathroom-south', offset: 800, width: 800, height: 2100, sillHeight: 0, materialId: 'mat-door-warm-white', connectsRoomIds: ['room-bathroom', 'room-hall'], swing: { hinge: 'start', side: 1 }, ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-flex-hall', kind: 'interior-door', hostSurfaceId: 'surface-wall-hall-east', offset: 0, width: 800, height: 2100, sillHeight: 0, materialId: 'mat-door-warm-white', connectsRoomIds: ['room-flex', 'room-hall'], swing: { hinge: 'start', side: -1 }, ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-hall-living', kind: 'shared-doorway', hostSurfaceId: 'surface-wall-hall-south', offset: 400, width: 1600, height: 2400, sillHeight: 0, materialId: 'mat-wall-warm-white', connectsRoomIds: ['room-hall', 'room-living-dining'], ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-living-kitchen', kind: 'shared-doorway', hostSurfaceId: 'surface-wall-living-east-kitchen', offset: 500, width: 1400, height: 2400, sillHeight: 0, materialId: 'mat-wall-warm-white', connectsRoomIds: ['room-living-dining', 'room-kitchen'], ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-living-entry', kind: 'shared-doorway', hostSurfaceId: 'surface-wall-living-east-entry', offset: 600, width: 1200, height: 2400, sillHeight: 0, materialId: 'mat-wall-warm-white', connectsRoomIds: ['room-living-dining', 'room-entry'], ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-kitchen-entry', kind: 'interior-door', hostSurfaceId: 'surface-wall-kitchen-south', offset: 1200, width: 900, height: 2100, sillHeight: 0, materialId: 'mat-door-warm-white', connectsRoomIds: ['room-kitchen', 'room-entry'], swing: { hinge: 'start', side: 1 }, ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-primary-window', kind: 'window', hostSurfaceId: 'surface-wall-primary-north', offset: 900, width: 2000, height: 1500, sillHeight: 900, materialId: 'mat-wall-warm-white', connectsExterior: true, ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-bathroom-window', kind: 'window', hostSurfaceId: 'surface-wall-bathroom-north', offset: 700, width: 1000, height: 900, sillHeight: 1200, materialId: 'mat-wall-warm-white', connectsExterior: true, ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-flex-window', kind: 'window', hostSurfaceId: 'surface-wall-flex-north', offset: 1200, width: 2200, height: 1500, sillHeight: 900, materialId: 'mat-wall-warm-white', connectsExterior: true, ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-living-west-window', kind: 'window', hostSurfaceId: 'surface-wall-living-west', offset: 1000, width: 2400, height: 1600, sillHeight: 700, materialId: 'mat-wall-warm-white', connectsExterior: true, ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-living-south-window', kind: 'window', hostSurfaceId: 'surface-wall-living-south', offset: 1800, width: 3000, height: 2200, sillHeight: 0, materialId: 'mat-wall-warm-white', connectsExterior: true, ruleIds: ['rule-opening-clearance'] },
      { id: 'opening-kitchen-window', kind: 'window', hostSurfaceId: 'surface-wall-kitchen-east', offset: 600, width: 1200, height: 1200, sillHeight: 1000, materialId: 'mat-wall-warm-white', connectsExterior: true, ruleIds: ['rule-opening-clearance'] },
    ],
    objects: [
      { id: 'object-primary-bed', externalId: 'DEMO-FURN-002', source: 'demo', name: 'Double Bed', category: 'bed', roomId: 'room-primary-bedroom', preferredCameraPresetId: 'camera-primary-overhead', dimensions: { width: 1800, depth: 2000, height: 1050 }, transform: { x: 1500, y: 0, z: 1800, rotationY: 0 }, media2D: media2D('double-bed-top.png'), model3D: model3D('double-bed.glb'), materialId: 'mat-fabric-warm-gray', capabilities: allCapabilities({ movable: true, rotatable: true, materialEditable: true }), ruleIds: ['rule-room-boundary', 'rule-bedside-600'] },
      { id: 'object-primary-wardrobe', externalId: 'DEMO-CAB-002', source: 'demo', name: 'Wardrobe', category: 'fixed-cabinet', roomId: 'room-primary-bedroom', preferredCameraPresetId: 'camera-primary-wardrobe', dimensions: { width: 2400, depth: 600, height: 2400 }, transform: { x: 3600, y: 0, z: 1200, rotationY: Math.PI / 2 }, media2D: media2D('wardrobe-v2-top.png'), model3D: model3D('wardrobe.glb'), materialId: 'mat-oak-veneer', capabilities: allCapabilities({ materialEditable: true, parameterEditable: true }), ruleIds: ['rule-room-boundary', 'rule-cabinet-front-900'] },
      { id: 'object-flex-bed', externalId: 'DEMO-FURN-003', source: 'demo', name: 'Single Daybed', category: 'bed', roomId: 'room-flex', preferredCameraPresetId: 'camera-flex-overhead', dimensions: { width: 1200, depth: 2000, height: 900 }, transform: { x: 7700, y: 0, z: 1500, rotationY: 0 }, media2D: media2D('single-bed-top.png'), model3D: model3D('single-bed.glb'), materialId: 'mat-fabric-warm-gray', capabilities: allCapabilities({ movable: true, rotatable: true, materialEditable: true, parameterEditable: true }), ruleIds: ['rule-room-boundary', 'rule-bedside-600', 'rule-child-activity-clearance'] },
      { id: 'object-flex-desk', externalId: 'DEMO-FURN-004', source: 'demo', name: 'Writing Desk', category: 'desk', roomId: 'room-flex', preferredCameraPresetId: 'camera-flex-desk', dimensions: { width: 1400, depth: 650, height: 740 }, transform: { x: 10500, y: 0, z: 1600, rotationY: Math.PI / 2 }, media2D: media2D('desk-top.png'), model3D: model3D('desk.glb'), materialId: 'mat-oak-veneer', capabilities: allCapabilities({ movable: true, rotatable: true, materialEditable: true }), ruleIds: ['rule-room-boundary', 'rule-cabinet-front-900'] },
      { id: 'object-sofa', externalId: 'DEMO-FURN-001', source: 'demo', name: 'Sofa', category: 'sofa', roomId: 'room-living-dining', preferredCameraPresetId: 'camera-living-sofa', dimensions: { width: 2200, depth: 900, height: 820 }, transform: { x: 2200, y: 0, z: 5600, rotationY: 0 }, media2D: media2D('sofa-top.png'), model3D: model3D('sofa.glb'), materialId: 'mat-fabric-warm-gray', capabilities: allCapabilities({ movable: true, rotatable: true, duplicable: true, deletable: true, materialEditable: true, parameterEditable: true }), ruleIds: ['rule-room-boundary', 'rule-main-circulation-900'] },
      { id: 'object-tv-console', externalId: 'DEMO-CAB-001', source: 'demo', name: 'Media Console', category: 'fixed-cabinet', roomId: 'room-living-dining', preferredCameraPresetId: 'camera-living-feature', dimensions: { width: 2200, depth: 450, height: 520 }, transform: { x: 2200, y: 0, z: 7650, rotationY: Math.PI }, media2D: media2D('tv-console-top.png'), model3D: model3D('tv-console.glb'), materialId: 'mat-oak-veneer', capabilities: allCapabilities({ materialEditable: true }), ruleIds: ['rule-room-boundary', 'rule-cabinet-front-900', 'rule-tv-distance-1800-3600', 'rule-fixed-equipment-wall-relation'] },
      { id: 'object-dining-table', externalId: 'DEMO-FURN-005', source: 'demo', name: 'Dining Table', category: 'dining-table', roomId: 'room-living-dining', preferredCameraPresetId: 'camera-living-dining', dimensions: { width: 1600, depth: 900, height: 740 }, transform: { x: 6200, y: 0, z: 5700, rotationY: Math.PI / 2 }, media2D: media2D('dining-table-top.png'), model3D: model3D('dining-table.glb'), materialId: 'mat-oak-veneer', capabilities: allCapabilities({ movable: true, rotatable: true, duplicable: true, deletable: true, materialEditable: true, parameterEditable: true }), ruleIds: ['rule-room-boundary', 'rule-main-circulation-900'] },
      { id: 'object-kitchen-counter', externalId: 'DEMO-CAB-003', source: 'demo', name: 'Kitchen Run', category: 'fixed-cabinet', roomId: 'room-kitchen', preferredCameraPresetId: 'camera-kitchen-worktop', dimensions: { width: 3000, depth: 650, height: 900 }, transform: { x: 9300, y: 0, z: 3625, rotationY: 0 }, media2D: media2D('kitchen-counter-v2-top.png'), model3D: model3D('kitchen-counter.glb'), materialId: 'mat-oak-veneer', capabilities: allCapabilities({ materialEditable: true }), ruleIds: ['rule-room-boundary', 'rule-kitchen-aisle-1000', 'rule-fixed-equipment-wall-relation'] },
      { id: 'object-shoe-cabinet', externalId: 'DEMO-CAB-004', source: 'demo', name: 'Shoe Cabinet', category: 'fixed-cabinet', roomId: 'room-entry', preferredCameraPresetId: 'camera-entry-storage', dimensions: { width: 1200, depth: 360, height: 1050 }, transform: { x: 10600, y: 0, z: 6800, rotationY: Math.PI / 2 }, media2D: media2D('shoe-cabinet-top.png'), model3D: model3D('shoe-cabinet.glb'), materialId: 'mat-oak-veneer', capabilities: allCapabilities({ materialEditable: true }), ruleIds: ['rule-room-boundary', 'rule-cabinet-front-900', 'rule-tall-storage-anchored', 'rule-fixed-equipment-wall-relation'] },
    ].map(withObjectContract),
    clearanceZones: [
      { id: 'clearance-entry-route', roomId: 'room-entry', kind: 'circulation', label: '入户主通道', valueMm: 1100, minimumMm: 900, polygon: rectangle(8200, 5750, 1100, 2050), ruleIds: ['rule-main-circulation-900'] },
      { id: 'clearance-living-route', roomId: 'room-living-dining', kind: 'circulation', label: '客餐厅主通道', valueMm: 1200, minimumMm: 900, polygon: rectangle(4000, 4300, 1200, 3300), ruleIds: ['rule-main-circulation-900'] },
      { id: 'clearance-kitchen-aisle', roomId: 'room-kitchen', kind: 'work-aisle', label: '厨房操作通道', valueMm: 1100, minimumMm: 1000, polygon: rectangle(7800, 4100, 3000, 1100), ruleIds: ['rule-kitchen-aisle-1000'] },
      { id: 'clearance-primary-bedside', roomId: 'room-primary-bedroom', kind: 'bedside-clearance', label: '床侧净距', valueMm: 600, minimumMm: 600, polygon: rectangle(0, 800, 600, 2000), ruleIds: ['rule-bedside-600'] },
      { id: 'clearance-primary-wardrobe', roomId: 'room-primary-bedroom', kind: 'cabinet-front-clearance', label: '衣柜柜前净距', valueMm: 900, minimumMm: 900, polygon: rectangle(2400, 0, 900, 2400), ruleIds: ['rule-cabinet-front-900'] },
      { id: 'clearance-flex-bedside', roomId: 'room-flex', kind: 'bedside-clearance', label: '儿童房床侧净距', valueMm: 600, minimumMm: 600, polygon: rectangle(6400, 500, 600, 2000), ruleIds: ['rule-bedside-600'] },
      { id: 'clearance-flex-activity', roomId: 'room-flex', kind: 'child-activity', label: '成长活动留白', valueMm: 1600, minimumMm: 1600, polygon: rectangle(8400, 650, 1600, 1900), ruleIds: ['rule-child-activity-clearance'] },
    ],
  };
}
