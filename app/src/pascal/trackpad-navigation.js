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
