const SCALE = 1000;

const roundMm = (m = 0) => Math.round(m * SCALE);

function canonicalFor(mapping, pascalId) {
  return mapping?.pascalToCanonical?.[pascalId] ?? null;
}

function materialIdFromRef(ref, mapping) {
  if (!ref || typeof ref !== 'string') return null;
  const pascalId = ref.startsWith('scene:') ? ref.slice(6) : ref;
  return mapping?.pascalToCanonical?.[pascalId]?.kind === 'material'
    ? mapping.pascalToCanonical[pascalId].id
    : null;
}

export function pascalEditToSceneCommand(event, mapping) {
  if (!event || typeof event.type !== 'string') return null;
  const canonical = canonicalFor(mapping, event.nodeId);
  if (!canonical) return null;

  if (event.type === 'node.delete') {
    return canonical.kind === 'object' ? { type: 'object.delete', objectId: canonical.id } : null;
  }

  if (event.type === 'node.transform') {
    if (canonical.kind !== 'object' || !Array.isArray(event.position)) return null;
    const transform = {
      x: roundMm(event.position[0]),
      y: roundMm(event.position[1] ?? 0),
      z: roundMm(event.position[2]),
    };
    if (Array.isArray(event.rotation) && Number.isFinite(event.rotation[1])) {
      transform.rotationY = event.rotation[1];
    }
    return { type: 'object.setTransform', objectId: canonical.id, transform };
  }

  if (event.type === 'node.material') {
    const materialId = materialIdFromRef(event.materialRef, mapping);
    if (!materialId) return null;
    if (canonical.kind === 'object') return { type: 'object.setMaterial', objectId: canonical.id, materialId };
    if (canonical.kind === 'surface') return { type: 'surface.setMaterial', surfaceId: canonical.id, materialId };
  }

  return null;
}

export function pascalNodeChangeToSceneCommand(beforeNode, currentNode, mapping) {
  const node = currentNode ?? beforeNode;
  if (!node?.id) return null;
  if (!currentNode) return pascalEditToSceneCommand({ type: 'node.delete', nodeId: node.id }, mapping);

  if (JSON.stringify(beforeNode?.position) !== JSON.stringify(currentNode.position) ||
      JSON.stringify(beforeNode?.rotation) !== JSON.stringify(currentNode.rotation)) {
    return pascalEditToSceneCommand({
      type: 'node.transform',
      nodeId: node.id,
      position: currentNode.position,
      rotation: currentNode.rotation,
    }, mapping);
  }

  const beforeSlot = beforeNode?.slots?.default ?? beforeNode?.slots?.interior;
  const currentSlot = currentNode?.slots?.default ?? currentNode?.slots?.interior;
  if (beforeSlot !== currentSlot) {
    return pascalEditToSceneCommand({
      type: 'node.material',
      nodeId: node.id,
      materialRef: currentSlot,
    }, mapping);
  }

  return null;
}

export function pascalCommitToSceneCommands(commit, mapping) {
  if (!commit || commit.origin !== 'local') return [];
  const before = commit.before?.nodes ?? {};
  const current = commit.current?.nodes ?? {};
  const ids = new Set([...Object.keys(before), ...Object.keys(current)]);
  return [...ids]
    .filter((id) => JSON.stringify(before[id]) !== JSON.stringify(current[id]))
    .map((id) => pascalNodeChangeToSceneCommand(before[id], current[id], mapping))
    .filter(Boolean);
}

const RESIDENT_EDIT_COMMANDS = new Set(['object.setTransform', 'object.setDimensions']);

export function isResidentEditCommand(command) {
  return RESIDENT_EDIT_COMMANDS.has(command?.type);
}
