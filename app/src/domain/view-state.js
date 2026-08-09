const findById = (records, id) => records?.find((record) => record.id === id);

const selectedEntity = (scene, id) => {
  if (typeof id !== 'string') return null;
  for (const key of ['rooms', 'surfaces', 'openings', 'objects']) {
    const entity = findById(scene?.[key], id);
    if (entity) return entity;
  }
  return null;
};

const selectionBelongsToRoom = (scene, entity, roomId) => {
  if (!roomId) return true;
  if (entity.id === roomId || entity.roomId === roomId || entity.connectsRoomIds?.includes(roomId)) return true;
  return findById(scene?.surfaces, entity.hostSurfaceId)?.roomId === roomId;
};

export function objectNavigationPreset(scene, object) {
  if (!scene || !object?.id || !object?.roomId) return null;
  const presets = scene.cameraPresets ?? [];
  const preferred = presets.find((preset) => preset.id === object.preferredCameraPresetId) ?? null;
  if (!object.capabilities?.movable) return preferred;
  return presets.find((preset) => preset.roomId === object.roomId && preset.objectId === object.id && preset.kind === 'object_overhead')
    ?? presets.find((preset) => preset.roomId === object.roomId && preset.kind === 'room_overhead')
    ?? preferred;
}

/** Return a canonical, scene-compatible navigation state. */
export function sanitizeViewState(state, scene) {
  const presets = scene?.cameraPresets ?? [];
  const defaultHome = presets.find((preset) => preset.kind === 'whole_home') ?? null;
  const room = findById(scene?.rooms, state?.roomId);
  const entity = selectedEntity(scene, state?.selectedId);
  const roomPresetIds = new Set(room?.cameraPresetIds ?? []);
  const allowedPresets = room
    ? presets.filter((preset) => preset.roomId === room.id && (roomPresetIds.has(preset.id) || preset.objectId === entity?.id))
    : presets.filter((preset) => preset.kind === 'whole_home');
  const requestedPreset = findById(allowedPresets, state?.viewId);
  const preset = requestedPreset ?? (room
    ? allowedPresets.find((candidate) => candidate.kind === 'room_overhead') ?? allowedPresets[0]
    : defaultHome);
  return {
    roomId: room?.id ?? null,
    viewId: preset?.id ?? defaultHome?.id ?? null,
    selectedId: entity && selectionBelongsToRoom(scene, entity, room?.id) ? entity.id : null,
  };
}

/** Parse and sanitize window.location.search-compatible input. */
export function parseViewState(search, scene) {
  const params = new URLSearchParams(search ?? '');
  return sanitizeViewState({
    roomId: params.get('room'),
    viewId: params.get('view'),
    selectedId: params.get('select'),
  }, scene);
}

/** Serialize a canonical query string, omitting the default whole-home state. */
export function serializeViewState(state, scene) {
  const safe = sanitizeViewState(state, scene);
  const defaultHomeId = scene?.cameraPresets?.find((preset) => preset.kind === 'whole_home')?.id ?? null;
  const params = new URLSearchParams();
  if (safe.roomId) params.set('room', safe.roomId);
  if (safe.viewId && (safe.roomId || safe.viewId !== defaultHomeId)) params.set('view', safe.viewId);
  if (safe.selectedId) params.set('select', safe.selectedId);
  const query = params.toString();
  return query ? `?${query}` : '';
}
