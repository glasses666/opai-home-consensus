export function resolveRenderProfile({ width = 1440, coarsePointer = false, deviceMemory, hidden = false } = {}) {
  if (hidden) return Object.freeze({ mode: 'paused', defaultView: '2d', allowHeavy3D: false, dprCap: 1 });
  const constrained = width <= 840 || coarsePointer || (Number.isFinite(deviceMemory) && deviceMemory <= 4);
  return Object.freeze(constrained
    ? { mode: 'light', defaultView: '2d', allowHeavy3D: true, dprCap: 1 }
    : { mode: 'full', defaultView: 'split', allowHeavy3D: true, dprCap: 1.75 });
}
