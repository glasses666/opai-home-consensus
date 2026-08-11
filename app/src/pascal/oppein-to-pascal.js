const SCALE = 0.001;
const LEVEL_ID = 'level_oppein_demo';

const idPart = (id) => String(id).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'node';
export const toPascalId = (prefix, canonicalId) => `${prefix}_${idPart(canonicalId)}`;
export const toPascalMaterialId = (canonicalId) => `mat_${idPart(canonicalId)}`;
export const toSceneMaterialRef = (canonicalId) => `scene:${toPascalMaterialId(canonicalId)}`;

const m = (mm = 0) => Math.round(mm) * SCALE;
const point = ({ x, z }) => [m(x), m(z)];

const metadata = (kind, record, extra = {}) => ({
  oppein: {
    id: record.id,
    kind,
    roomId: record.roomId ?? null,
    materialId: record.materialId ?? null,
    source: record.source ?? 'demo',
    capabilities: record.capabilities ?? {},
    ...extra,
  },
});

const materialPreset = (material) => {
  if (material.kind?.includes('wood')) return 'wood';
  if (material.kind?.includes('tile') || material.kind?.includes('porcelain')) return 'tile';
  if (material.kind?.includes('glass')) return 'glass';
  if (material.kind?.includes('metal')) return 'metal';
  if (material.kind?.includes('fabric')) return 'custom';
  return 'plaster';
};

function buildMaterial(material, mapping) {
  const id = toPascalMaterialId(material.id);
  mapping.canonicalToPascal.material[material.id] = id;
  mapping.pascalToCanonical[id] = { kind: 'material', id: material.id };
  return {
    id,
    name: material.name,
    material: {
      id,
      preset: materialPreset(material),
      properties: {
        color: material.color ?? '#f6f1e8',
        roughness: 0.72,
        metalness: 0,
        opacity: 1,
        transparent: false,
        side: 'double',
      },
    },
  };
}

function addMapping(mapping, kind, canonicalId, pascalId) {
  mapping.canonicalToPascal[kind][canonicalId] = pascalId;
  mapping.pascalToCanonical[pascalId] = { kind, id: canonicalId };
}

function baseNode(id, type, parentId, record, kind, extra = {}) {
  return {
    object: 'node',
    id,
    type,
    parentId,
    visible: true,
    name: record.name,
    metadata: metadata(kind, record, extra),
  };
}

function openingNode(opening, wallId) {
  const isWindow = opening.kind === 'window';
  return {
    object: 'node',
    id: toPascalId(isWindow ? 'window' : 'door', opening.id),
    type: isWindow ? 'window' : 'door',
    parentId: wallId,
    visible: true,
    name: opening.kind,
    metadata: metadata('opening', opening, { hostSurfaceId: opening.hostSurfaceId }),
    wallId,
    position: [m(opening.offset + opening.width / 2), m(opening.sillHeight + opening.height / 2), 0],
    rotation: [0, 0, 0],
    width: m(opening.width),
    height: m(opening.height),
    ...(isWindow
      ? { openingKind: 'window', windowType: 'fixed', sill: opening.sillHeight > 0 }
      : {
          openingKind: 'door',
          doorCategory: opening.connectsExterior ? 'exterior' : 'interior',
          doorType: 'hinged',
          openingShape: 'rectangle',
          hingesSide: opening.swing?.hinge === 'end' ? 'right' : 'left',
          swingDirection: opening.swing?.side === -1 ? 'outward' : 'inward',
          swingAngle: Math.PI / 2,
        }),
  };
}

/**
 * Project the OPPEIN canonical scene into Pascal's editor graph.
 * Pascal is deliberately a disposable projection: business ids stay in metadata.
 */
export function projectOppeinSceneToPascal(scene) {
  const mapping = {
    canonicalToPascal: { room: {}, surface: {}, opening: {}, object: {}, material: {} },
    pascalToCanonical: {},
  };
  const nodes = {};
  const materials = {};
  const levelChildren = [];

  for (const material of scene.materials ?? []) {
    materials[toPascalMaterialId(material.id)] = buildMaterial(material, mapping);
  }

  const bounds = scene.floorPlan?.bounds;
  const xs = bounds
    ? [bounds.x, bounds.x + bounds.width]
    : scene.rooms.flatMap((room) => room.polygon.map((p) => p.x));
  const zs = bounds
    ? [bounds.z, bounds.z + bounds.depth]
    : scene.rooms.flatMap((room) => room.polygon.map((p) => p.z));
  const minX = Math.min(...xs) - 2000;
  const maxX = Math.max(...xs) + 2000;
  const minZ = Math.min(...zs) - 2000;
  const maxZ = Math.max(...zs) + 2000;

  nodes.site_oppein_demo = {
    object: 'node',
    id: 'site_oppein_demo',
    type: 'site',
    parentId: null,
    visible: true,
    name: scene.name ?? 'OPPEIN demo',
    metadata: metadata('scene', scene),
    polygon: { type: 'polygon', points: [point({ x: minX, z: minZ }), point({ x: maxX, z: minZ }), point({ x: maxX, z: maxZ }), point({ x: minX, z: maxZ })] },
    children: ['building_oppein_demo'],
  };
  nodes.building_oppein_demo = {
    object: 'node',
    id: 'building_oppein_demo',
    type: 'building',
    parentId: 'site_oppein_demo',
    visible: true,
    name: '一层数字住宅',
    metadata: metadata('building', scene),
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    children: [LEVEL_ID],
  };

  const openingsBySurface = new Map();
  for (const opening of scene.openings ?? []) {
    const list = openingsBySurface.get(opening.hostSurfaceId) ?? [];
    list.push(opening);
    openingsBySurface.set(opening.hostSurfaceId, list);
  }

  for (const surface of scene.surfaces ?? []) {
    const prefix = surface.kind === 'wall' ? 'wall' : surface.kind === 'ceiling' ? 'ceiling' : 'slab';
    const id = toPascalId(prefix, surface.id);
    addMapping(mapping, 'surface', surface.id, id);
    levelChildren.push(id);
    if (surface.kind === 'wall') {
      const children = [];
      for (const opening of openingsBySurface.get(surface.id) ?? []) {
        const openingPascalId = toPascalId(opening.kind === 'window' ? 'window' : 'door', opening.id);
        addMapping(mapping, 'opening', opening.id, openingPascalId);
        nodes[openingPascalId] = openingNode(opening, id);
        children.push(openingPascalId);
      }
      nodes[id] = {
        ...baseNode(id, 'wall', LEVEL_ID, surface, 'surface'),
        start: point(surface.edge.start),
        end: point(surface.edge.end),
        thickness: m(surface.thickness ?? 120),
        height: m(surface.height ?? 2800),
        frontSide: 'unknown',
        backSide: 'unknown',
        slots: { interior: toSceneMaterialRef(surface.materialId), exterior: toSceneMaterialRef(surface.materialId) },
        children,
      };
    } else {
      nodes[id] = {
        ...baseNode(id, surface.kind === 'ceiling' ? 'ceiling' : 'slab', LEVEL_ID, surface, 'surface'),
        polygon: surface.polygon.map(point),
        holes: [],
        elevation: surface.kind === 'floor' ? 0 : undefined,
        thickness: surface.kind === 'floor' ? 0.12 : undefined,
        height: surface.kind === 'ceiling' ? m(surface.elevation ?? 2800) : undefined,
        autoFromWalls: false,
        slots: { default: toSceneMaterialRef(surface.materialId) },
      };
    }
  }

  for (const room of scene.rooms ?? []) {
    const id = toPascalId('zone', room.id);
    addMapping(mapping, 'room', room.id, id);
    levelChildren.push(id);
    nodes[id] = {
      ...baseNode(id, 'zone', LEVEL_ID, room, 'room'),
      polygon: room.polygon.map(point),
      autoFromWalls: false,
      boundaryWallIds: scene.surfaces
        .filter((surface) => surface.kind === 'wall' && surface.roomId === room.id)
        .map((surface) => mapping.canonicalToPascal.surface[surface.id]),
      spaceRole: 'room',
      roomNumber: room.id.replace('room-', ''),
      enclosureStatus: 'auto',
      floorFinish: '',
      wallFinish: '',
      ceilingFinish: '',
      ceilingHeight: 2.8,
      occupancy: '',
      clearDimensionPolicy: 'inside-faces',
      color: '#d9c7aa',
    };
  }

  for (const object of scene.objects ?? []) {
    const id = toPascalId('item', object.id);
    addMapping(mapping, 'object', object.id, id);
    levelChildren.push(id);
    nodes[id] = {
      ...baseNode(id, 'item', LEVEL_ID, object, 'object'),
      position: [m(object.transform.x), m(object.transform.y), m(object.transform.z)],
      rotation: [0, object.transform.rotationY ?? 0, 0],
      scale: [1, 1, 1],
      children: [],
      supportSlabId: mapping.canonicalToPascal.surface[`surface-floor-${object.roomId.slice(5)}`],
      slots: { default: toSceneMaterialRef(object.materialId) },
      asset: {
        id: object.externalId,
        category: object.category,
        name: object.name,
        thumbnail: object.media2D?.src ?? '/icons/item.webp',
        floorPlanUrl: object.media2D?.src,
        source: 'mine',
        src: object.model3D?.src ?? '/assets/models/placeholder.glb',
        dimensions: [m(object.dimensions.width), m(object.dimensions.height), m(object.dimensions.depth)],
        offset: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        tags: [object.source ?? 'demo', object.category],
      },
    };
  }

  nodes[LEVEL_ID] = {
    object: 'node',
    id: LEVEL_ID,
    type: 'level',
    parentId: 'building_oppein_demo',
    visible: true,
    name: '一层',
    metadata: metadata('level', scene),
    level: 0,
    height: 2.8,
    children: levelChildren,
  };

  return {
    sceneGraph: {
      nodes,
      rootNodeIds: ['site_oppein_demo'],
      collections: {},
      materials,
      installedPlugins: ['pascal:core'],
    },
    mapping,
    counts: {
      rooms: scene.rooms.length,
      surfaces: scene.surfaces.length,
      openings: scene.openings.length,
      objects: scene.objects.length,
      materials: scene.materials.length,
    },
  };
}
