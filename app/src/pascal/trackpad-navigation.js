import { createCameraOrbit, sampleCameraOrbit, smoothCameraProgress } from '../domain/camera-transition.js';

const PIXEL_DELTA = 0;
const TRACKPAD_DELTA_CUTOFF = 50;
const MAX_DELTA_PER_FRAME = 80;

export function isTrackpadPanWheel(event, continuing = false) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.deltaMode !== PIXEL_DELTA) return false;
  if (continuing) return true;
  return Math.abs(event.deltaX) > 0
    || (Math.abs(event.deltaY) > 0 && Math.abs(event.deltaY) < TRACKPAD_DELTA_CUTOFF)
    || !Number.isInteger(event.deltaY);
}

export function isTrackpadPinchWheel(event) {
  return event.deltaMode === PIXEL_DELTA && event.ctrlKey && !event.metaKey && !event.altKey;
}

export function panCameraPose(pose, { deltaX, deltaY, viewportWidth }) {
  if (!pose || !(viewportWidth > 0)) return null;
  const forward = pose.target.map((value, index) => value - pose.position[index]);
  const horizontalLength = Math.hypot(forward[0], forward[2]);
  const groundForward = horizontalLength > 1e-6
    ? [forward[0] / horizontalLength, 0, forward[2] / horizontalLength]
    : [0, 0, -1];
  const right = [-groundForward[2], 0, groundForward[0]];
  const viewWidth = pose.viewWidth || Math.hypot(...forward);
  if (!(viewWidth > 0)) return null;

  const scale = viewWidth / viewportWidth;
  const x = Math.max(-MAX_DELTA_PER_FRAME, Math.min(MAX_DELTA_PER_FRAME, deltaX)) * scale;
  const y = Math.max(-MAX_DELTA_PER_FRAME, Math.min(MAX_DELTA_PER_FRAME, deltaY)) * scale;
  const offset = right.map((value, index) => value * x + groundForward[index] * y);
  const translate = (point) => point.map((value, index) => value + offset[index]);

  return { ...pose, position: translate(pose.position), target: translate(pose.target) };
}

export function zoomCameraPose(pose, deltaY) {
  if (!pose?.viewWidth) return null;
  const viewWidth = Math.max(0.25, Math.min(250, pose.viewWidth * Math.exp(deltaY * 0.01)));
  return { ...pose, position: [...pose.position], target: [...pose.target], viewWidth };
}

export function centerCameraPoseOnFloorPlan(pose, bounds) {
  if (!pose || !bounds) return null;
  const centerX = (bounds.x + bounds.width / 2) / 1000;
  const centerZ = (bounds.z + bounds.depth / 2) / 1000;
  const offsetX = centerX - pose.target[0];
  const offsetZ = centerZ - pose.target[2];
  return {
    ...pose,
    position: [pose.position[0] + offsetX, pose.position[1], pose.position[2] + offsetZ],
    target: [centerX, pose.target[1], centerZ],
  };
}

export function centerCameraPoseOnRoom(pose, room) {
  if (!pose || !room?.polygon?.length) return null;
  const xs = room.polygon.map((point) => point.x / 1000);
  const zs = room.polygon.map((point) => point.z / 1000);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const diagonal = Math.hypot(maxX - minX, maxZ - minZ);
  const horizontal = Math.max(2.4, diagonal * 0.72);
  const height = horizontal * Math.SQRT2;
  return {
    ...pose,
    position: [centerX - horizontal, height, centerZ - horizontal],
    target: [centerX, pose.target[1], centerZ],
    viewWidth: undefined,
  };
}

export function cameraPresetToPose(preset, fallbackProjection = 'perspective') {
  if (!preset?.position || !preset?.target) return null;
  const vector = (point) => [point.x / 1000, point.y / 1000, point.z / 1000];
  return {
    position: vector(preset.position),
    target: vector(preset.target),
    projection: fallbackProjection,
    ...(Number.isFinite(preset.fov) ? { fov: preset.fov } : {}),
  };
}

export function interpolateCameraPose(from, to, progress) {
  const amount = Math.max(0, Math.min(1, progress));
  if (amount === 0) return { ...from, position: [...from.position], target: [...from.target] };
  if (amount === 1) return { ...to, position: [...to.position], target: [...to.target] };
  const eased = smoothCameraProgress(amount);
  const point = (value) => ({ x: value[0], y: value[1], z: value[2] });
  const orbit = createCameraOrbit(point(from.position), point(from.target), point(to.position), point(to.target));
  const sampled = sampleCameraOrbit(orbit, eased);
  return {
    ...to,
    position: [sampled.position.x, sampled.position.y, sampled.position.z],
    target: [sampled.target.x, sampled.target.y, sampled.target.z],
    ...(Number.isFinite(from.fov) && Number.isFinite(to.fov) ? { fov: from.fov + (to.fov - from.fov) * eased } : {}),
  };
}
