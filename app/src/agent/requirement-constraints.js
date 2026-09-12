/** Mechanical permissions. Natural-language interpretation belongs to the provider. */
export const HARD_KINDS = Object.freeze([
  'preserve_object', 'no_new_objects', 'no_new_large_objects', 'lock_transform', 'lock_material', 'lock_object', 'avoid_openings',
]);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const material = entity => ({ materialId: entity.materialId, roomMaterialIds: entity.roomMaterialIds });
const SMALL_ADDITION_CATEGORY = /(?:light|lamp|decor|art|plant|accessor)/i;

// This is a deterministic scene rule, not a language-model guess. Unknown
// geometry fails closed so an unmeasured object cannot bypass a size promise.
export function isLargeObjectAddition(object) {
  if (SMALL_ADDITION_CATEGORY.test(object?.category ?? '')) return false;
  const width = Number(object?.dimensions?.width);
  const depth = Number(object?.dimensions?.depth);
  if (!(width > 0) || !(depth > 0)) return true;
  return width >= 1200 || depth >= 1200 || width * depth >= 600_000;
}

export function assertRequirementConstraints(before, after, requirements) {
  if (equal(before, after)) return; // Read-only dialogue can repair a malformed legacy rule.
  const nextEntities = new Map([...after.objects, ...after.surfaces].map(item => [item.id, item]));
  for (const rule of requirements?.hardConstraints ?? []) {
    if (!HARD_KINDS.includes(rule.kind)) throw Error(`HARD_CONSTRAINT_KIND_REQUIRED:${rule.id}`);
    if (rule.kind === 'no_new_objects') {
      if (after.objects.some(object => !before.objects.some(prior => prior.id === object.id))) {
        throw Error(`REQUIREMENT_CONSTRAINT:${rule.id}:no_new_objects`);
      }
      continue;
    }
    if (rule.kind === 'no_new_large_objects') {
      const added = after.objects.filter(object => !before.objects.some(prior => prior.id === object.id));
      if (added.some(isLargeObjectAddition)) {
        throw Error(`REQUIREMENT_CONSTRAINT:${rule.id}:no_new_large_objects`);
      }
      continue;
    }
    if (rule.kind === 'avoid_openings') continue; // The geometry guard enforces this independently.
    const entities = ['lock_material', 'lock_object'].includes(rule.kind)
      ? [...before.objects, ...before.surfaces] : before.objects;
    const scope = rule.objectIds?.length ? rule.objectIds : entities.map(item => item.id);
    for (const id of scope) {
      const prior = entities.find(item => item.id === id), next = nextEntities.get(id);
      if (!prior) throw Error(`REQUIREMENT_SCOPE_UNKNOWN:${rule.id}:${id}`);
      if (!next) throw Error(`REQUIREMENT_CONSTRAINT:${rule.id}:preserve:${id}`);
      if (rule.kind === 'lock_transform' && !equal(prior.transform, next.transform)) {
        throw Error(`REQUIREMENT_CONSTRAINT:${rule.id}:transform:${id}`);
      }
      if (rule.kind === 'lock_material' && !equal(material(prior), material(next))) {
        throw Error(`REQUIREMENT_CONSTRAINT:${rule.id}:material:${id}`);
      }
      if (rule.kind === 'lock_object' && !equal(prior, next)) {
        throw Error(`REQUIREMENT_CONSTRAINT:${rule.id}:object:${id}`);
      }
      // preserve_object intentionally does NOT freeze pose, material, size or model.
    }
  }
}

export function effectivePermissions(scene, requirements, id) {
  const object = scene.objects.find(item => item.id === id);
  if (!object) throw Error(`OBJECT_NOT_FOUND:${id}`);
  const kinds = new Set((requirements?.hardConstraints ?? [])
    .filter(rule => !rule.objectIds?.length || rule.objectIds.includes(id)).map(rule => rule.kind));
  const allLocked = kinds.has('lock_object'), poseLocked = allLocked || kinds.has('lock_transform');
  return {
    canMove: !!object.capabilities.movable && !poseLocked,
    canRotate: !!object.capabilities.movable && !!object.capabilities.rotatable && !poseLocked,
    canChangeMaterial: !!object.capabilities.materialEditable && !allLocked && !kinds.has('lock_material'),
    canResize: !!object.capabilities.parameterEditable && !allLocked,
    mustExist: ['preserve_object', 'lock_transform', 'lock_material', 'lock_object'].some(kind => kinds.has(kind)),
    kinds: [...kinds],
  };
}
