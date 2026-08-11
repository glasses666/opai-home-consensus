import { objectCollisionFootprint, rotatedFootprint, segmentAtOffset, viewBoxForPolygons } from './geometry.js';

/**
 * Project both 2D layers from the same scene records. The media layer deliberately
 * repeats the CAD footprint so callers can prove that artwork never drifts from it.
 * @param {unknown} scene
 */
export function projectScene2D(scene) {
  const roomPolygons = scene.rooms.map((room) => room.polygon);
  const rooms = scene.rooms.map((room) => {
    const floor = scene.surfaces.find((surface) => surface.kind === 'floor' && surface.roomId === room.id);
    const ceiling = scene.surfaces.find((surface) => surface.kind === 'ceiling' && surface.roomId === room.id);
    return {
      id: room.id,
      name: room.name,
      polygon: room.polygon.map((point) => ({ x: point.x, y: point.z })),
      materialId: floor?.materialId ?? null,
      floorMaterialId: floor?.materialId ?? null,
      ceilingMaterialId: ceiling?.materialId ?? null,
      sourceRoomId: room.id,
    };
  });
  const wallSegments = scene.surfaces
    .filter((surface) => surface.kind === 'wall')
    .map((surface) => ({
      id: surface.id,
      sourceSurfaceId: surface.id,
      roomId: surface.roomId,
      start: { x: surface.edge.start.x, y: surface.edge.start.z },
      end: { x: surface.edge.end.x, y: surface.edge.end.z },
      thickness: surface.thickness,
      materialId: surface.materialId,
    }));
  const openingSegments = scene.openings.map((opening) => {
    const host = scene.surfaces.find((surface) => surface.id === opening.hostSurfaceId);
    const segment = segmentAtOffset(host.edge, opening.offset, opening.width);
    return {
      id: opening.id,
      sourceOpeningId: opening.id,
      hostSurfaceId: opening.hostSurfaceId,
      type: opening.kind,
      width: opening.width,
      swing: opening.swing ?? null,
      start: { x: segment.start.x, y: segment.start.z },
      end: { x: segment.end.x, y: segment.end.z },
    };
  });
  const objectFootprints = scene.objects.map((object) => ({
    id: object.id,
    sourceObjectId: object.id,
    roomId: object.roomId,
    layer: object.hierarchy.layer,
    hostSurfaceId: object.placement.hostSurfaceId,
    polygon: rotatedFootprint(object.transform, object.dimensions).map((point) => ({ x: point.x, y: point.z })),
    collisionPolygon: objectCollisionFootprint(object).map((point) => ({ x: point.x, y: point.z })),
  }));
  const assets = scene.objects.map((object, index) => ({
    id: `media-${object.id}`,
    sourceObjectId: object.id,
    roomId: object.roomId,
    src: object.media2D.src,
    source: object.media2D.source,
    anchor: { x: object.transform.x, y: object.transform.z },
    width: object.dimensions.width,
    depth: object.dimensions.depth,
    rotationY: object.transform.rotationY,
    polygon: objectFootprints[index].polygon.map((point) => ({ ...point })),
    selectable: object.capabilities.selectable,
  }));

  return {
    viewBox: viewBoxForPolygons(roomPolygons),
    layerOrder: ['cad', 'media'],
    layers: {
      cad: { rooms, wallSegments, openingSegments, objectFootprints },
      media: { assets },
    },
  };
}
