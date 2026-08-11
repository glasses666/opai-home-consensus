const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, progress) => from + (to - from) * progress;

export const smoothCameraProgress = (progress) => progress ** 3 * (progress * (progress * 6 - 15) + 10);
export const cameraTransitionDuration = (angle, requested) => requested ?? Math.max(920, Math.min(1500, 760 + angle * 260));
export const surfaceFadeProgress = (current, target, deltaMs) => {
  const next = lerp(current, target, 1 - Math.exp(-Math.max(0, deltaMs) / 110));
  return Math.abs(target - next) < 0.002 ? target : next;
};
// Keep a faint silhouette so occluding surfaces read as "softly faded" instead of disappearing.
const MIN_OCCLUSION_OPACITY = 0.16;
export const surfaceOcclusionOpacity = (progress) => MIN_OCCLUSION_OPACITY
  + (1 - MIN_OCCLUSION_OPACITY) * (1 - smoothCameraProgress(clamp(progress, 0, 1)));
export const cameraDistanceLimit = (viewKind, roomSpan = 8) => viewKind === 'whole_home'
  ? 28
  : Math.max(8, Math.min(16, roomSpan * 2));
export const cameraFocusObjectId = (preset, requestedObjectId) => preset?.objectId
  ?? (preset?.kind === 'room_overhead' ? requestedObjectId : null);

const spherical = ({ x, y, z }) => {
  const radius = Math.hypot(x, y, z);
  return {
    radius,
    theta: Math.atan2(x, z),
    phi: Math.acos(clamp(y / radius, -1, 1)),
  };
};

/** Build a shortest-arc orbit that cannot pass through its look-at target. */
export function createCameraOrbit(fromPosition, fromTarget, toPosition, toTarget) {
  const from = spherical({
    x: fromPosition.x - fromTarget.x,
    y: fromPosition.y - fromTarget.y,
    z: fromPosition.z - fromTarget.z,
  });
  const to = spherical({
    x: toPosition.x - toTarget.x,
    y: toPosition.y - toTarget.y,
    z: toPosition.z - toTarget.z,
  });
  return {
    from,
    to,
    thetaDelta: Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta)),
    fromTarget: { ...fromTarget },
    toTarget: { ...toTarget },
  };
}

export function sampleCameraOrbit(orbit, progress) {
  const target = {
    x: lerp(orbit.fromTarget.x, orbit.toTarget.x, progress),
    y: lerp(orbit.fromTarget.y, orbit.toTarget.y, progress),
    z: lerp(orbit.fromTarget.z, orbit.toTarget.z, progress),
  };
  const radius = lerp(orbit.from.radius, orbit.to.radius, progress);
  const theta = orbit.from.theta + orbit.thetaDelta * progress;
  const phi = lerp(orbit.from.phi, orbit.to.phi, progress);
  const horizontal = radius * Math.sin(phi);
  return {
    target,
    position: {
      x: target.x + horizontal * Math.sin(theta),
      y: target.y + radius * Math.cos(phi),
      z: target.z + horizontal * Math.cos(theta),
    },
  };
}
