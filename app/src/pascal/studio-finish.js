// GLBs authored for this project use CANONICAL mesh roles, rather than
// Pascal's SLOT_* material names. Keep that presentation contract separate
// from the canonical scene and never recolor shared cached GLTF materials.
export function isStudioFinishMesh(mesh, category) {
  if (!mesh?.isMesh) return false;
  if (mesh.userData?.fabDefaultMaterial) return true;
  const canonical = mesh.name.startsWith('CANONICAL') || mesh.userData?.material_role === 'canonical';
  if (!canonical) return false;
  const upholstered = ['sofa', 'dining-chair', 'desk-chair', 'lounge-chair', 'bed'].includes(category);
  // Timber frames remain timber when a resident changes upholstery.
  return !(upholstered && /oak[ _](leg|rail|foot)/i.test(mesh.name));
}

export function studioFinishRoughness(kind = '') {
  if (kind.includes('fabric')) return 0.92;
  if (kind.includes('wood')) return 0.62;
  if (kind.includes('metal')) return 0.36;
  return 0.76;
}

export function applyStudioFinish(mesh, finish, category, owned) {
  if (!finish?.color || !isStudioFinishMesh(mesh, category)) return;
  if (mesh.userData?.fabDefaultMaterial && mesh.userData.fabDefaultMaterial === finish.id) {
    const record = owned.get(mesh);
    if (record) {
      if (mesh.material === record.material) mesh.material = record.original;
      for (const material of record.clones) material.dispose();
      owned.delete(mesh);
    }
    return;
  }
  const previous = owned.get(mesh);
  if (!previous || mesh.material !== previous.material) {
    if (previous) for (const material of previous.clones) material.dispose();
    const original = mesh.material;
    const source = Array.isArray(original) ? original : [original];
    const clones = source.map(material => material.clone());
    const material = Array.isArray(original) ? clones : clones[0];
    owned.set(mesh, { original, material, clones });
    mesh.material = material;
  }
  for (const material of owned.get(mesh).clones) {
    material.color?.set(finish.color);
    material.roughness = studioFinishRoughness(finish.kind);
    material.envMapIntensity = 0.55;
  }
}

export function disposeStudioFinishes(owned) {
  for (const [mesh, record] of owned) {
    if (mesh.material === record.material) mesh.material = record.original;
    for (const material of record.clones) material.dispose();
  }
  owned.clear();
}
