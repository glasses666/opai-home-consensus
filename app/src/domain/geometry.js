const EPSILON = 1e-6;

/**
 * @typedef {{x:number,z:number}} PlanPoint
 * @typedef {{start:PlanPoint,end:PlanPoint}} PlanSegment
 */

/**
 * @param {PlanPoint[]} polygon
 * @returns {number}
 */
export function polygonArea(polygon) {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    area += current.x * next.z - next.x * current.z;
  }
  return area / 2;
}

/**
 * @param {PlanPoint[]} polygon
 * @returns {PlanSegment[]}
 */
export function polygonEdges(polygon) {
  return polygon.map((point, index) => ({
    start: point,
    end: polygon[(index + 1) % polygon.length],
  }));
}

/**
 * @param {PlanPoint} a
 * @param {PlanPoint} b
 * @returns {number}
 */
export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/**
 * @param {PlanPoint} point
 * @param {PlanSegment} segment
 * @returns {boolean}
 */
export function pointOnSegment(point, segment) {
  const cross =
    (point.z - segment.start.z) * (segment.end.x - segment.start.x) -
    (point.x - segment.start.x) * (segment.end.z - segment.start.z);
  if (Math.abs(cross) > EPSILON) return false;

  const minX = Math.min(segment.start.x, segment.end.x) - EPSILON;
  const maxX = Math.max(segment.start.x, segment.end.x) + EPSILON;
  const minZ = Math.min(segment.start.z, segment.end.z) - EPSILON;
  const maxZ = Math.max(segment.start.z, segment.end.z) + EPSILON;
  return point.x >= minX && point.x <= maxX && point.z >= minZ && point.z <= maxZ;
}

/**
 * @param {PlanSegment} child
 * @param {PlanSegment} parent
 * @returns {boolean}
 */
export function segmentOnSegment(child, parent) {
  return pointOnSegment(child.start, parent) && pointOnSegment(child.end, parent);
}

/**
 * @param {PlanPoint} point
 * @param {PlanPoint[]} polygon
 * @returns {boolean}
 */
export function pointInPolygon(point, polygon) {
  if (polygonEdges(polygon).some((edge) => pointOnSegment(point, edge))) {
    return true;
  }

  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = a.z > point.z !== b.z > point.z;
    const x = ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses && point.x < x) inside = !inside;
  }
  return inside;
}

/**
 * @param {PlanPoint[]} inner
 * @param {PlanPoint[]} outer
 * @returns {boolean}
 */
export function polygonInsidePolygon(inner, outer) {
  // ponytail: vertex containment covers this Gate's rectilinear fixture; add edge-crossing checks before concave plan imports.
  return inner.every((point) => pointInPolygon(point, outer));
}

/**
 * @param {PlanSegment} a
 * @param {PlanSegment} b
 * @returns {boolean}
 */
export function segmentsIntersect(a, b) {
  const direction = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = direction(a.start, a.end, b.start);
  const d2 = direction(a.start, a.end, b.end);
  const d3 = direction(b.start, b.end, a.start);
  const d4 = direction(b.start, b.end, a.end);

  if (
    ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
    ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))
  ) {
    return true;
  }

  return (
    (Math.abs(d1) <= EPSILON && pointOnSegment(b.start, a)) ||
    (Math.abs(d2) <= EPSILON && pointOnSegment(b.end, a)) ||
    (Math.abs(d3) <= EPSILON && pointOnSegment(a.start, b)) ||
    (Math.abs(d4) <= EPSILON && pointOnSegment(a.end, b))
  );
}

/**
 * @param {PlanPoint[]} polygon
 * @returns {boolean}
 */
export function isSimplePolygon(polygon) {
  const edges = polygonEdges(polygon);
  for (let first = 0; first < edges.length; first += 1) {
    for (let second = first + 1; second < edges.length; second += 1) {
      const adjacent =
        second === first + 1 ||
        (first === 0 && second === edges.length - 1);
      if (!adjacent && segmentsIntersect(edges[first], edges[second])) {
        return false;
      }
    }
  }
  return true;
}

/**
 * @param {{x:number,z:number,rotationY:number}} transform
 * @param {{width:number,depth:number}} dimensions
 * @returns {PlanPoint[]}
 */
export function rotatedFootprint(transform, dimensions) {
  const halfWidth = dimensions.width / 2;
  const halfDepth = dimensions.depth / 2;
  const corners = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth },
  ];
  const sin = Math.sin(transform.rotationY);
  const cos = Math.cos(transform.rotationY);

  return corners.map((corner) => ({
    x: transform.x + corner.x * cos - corner.z * sin,
    z: transform.z + corner.x * sin + corner.z * cos,
  }));
}

/**
 * Positive-area overlap test for convex plan polygons. Edge contact is allowed.
 * Furniture footprints and clearance zones in the canonical scene are convex.
 *
 * @param {PlanPoint[]} first
 * @param {PlanPoint[]} second
 * @returns {boolean}
 */
export function convexPolygonsOverlap(first, second) {
  const axes = [...polygonEdges(first), ...polygonEdges(second)].map((edge) => ({
    x: -(edge.end.z - edge.start.z),
    z: edge.end.x - edge.start.x,
  }));

  return axes.every((axis) => {
    const project = (polygon) => polygon.map((point) => point.x * axis.x + point.z * axis.z);
    const a = project(first);
    const b = project(second);
    const overlap = Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b));
    return overlap > EPSILON;
  });
}

/**
 * @param {PlanSegment} segment
 * @param {number} offset
 * @param {number} length
 * @returns {PlanSegment}
 */
export function segmentAtOffset(segment, offset, length) {
  const total = distance(segment.start, segment.end);
  const dx = (segment.end.x - segment.start.x) / total;
  const dz = (segment.end.z - segment.start.z) / total;
  return {
    start: {
      x: segment.start.x + dx * offset,
      z: segment.start.z + dz * offset,
    },
    end: {
      x: segment.start.x + dx * (offset + length),
      z: segment.start.z + dz * (offset + length),
    },
  };
}

/**
 * @param {PlanPoint[][]} polygons
 * @returns {{x:number,y:number,width:number,height:number}}
 */
export function viewBoxForPolygons(polygons) {
  const points = polygons.flat();
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  return { x: minX, y: minZ, width: maxX - minX, height: maxZ - minZ };
}
