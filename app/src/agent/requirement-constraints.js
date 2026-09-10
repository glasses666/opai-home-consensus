/** Mechanical permissions; this module does not classify natural language. */
export const HARD_KINDS = Object.freeze(['preserve_object','no_new_objects','lock_transform','lock_material','lock_object','avoid_openings']);
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const finish = entity => ({materialId:entity.materialId,roomMaterialIds:entity.roomMaterialIds});
export function assertRequirementConstraints(before,after,requirements) {
  if (same(before,after)) return;
  const afterById = new Map([...after.objects,...after.surfaces].map(entity=>[entity.id,entity]));
  for (const rule of requirements?.hardConstraints ?? []) {
    if (!HARD_KINDS.includes(rule.kind)) throw Error(`HARD_CONSTRAINT_KIND_REQUIRED:${rule.id}`);
    if (rule.kind==='no_new_objects') {
      if (after.objects.some(entity=>!before.objects.some(prior=>prior.id===entity.id))) throw Error(`REQUIREMENT_CONSTRAINT:${rule.id}:no_new_objects`);
      continue;
    }
    if (rule.kind==='avoid_openings') continue; // Checked by the geometry guard.
    const targets = ['lock_material','lock_object'].includes(rule.kind) ? [...before.objects,...before.surfaces] : before.objects;
    const beforeById = new Map(targets.map(entity=>[entity.id,entity]));
    for (const id of rule.objectIds?.length ? rule.objectIds : [...beforeById.keys()]) {
      const a=beforeById.get(id),b=afterById.get(id);
      if (!a) throw Error(`REQUIREMENT_SCOPE_UNKNOWN:${rule.id}:${id}`);
      if (!b) throw Error(`REQUIREMENT_CONSTRAINT:${rule.id}:preserve:${id}`);
      if (rule.kind==='lock_transform'&&!same(a.transform,b.transform)) throw Error(`REQUIREMENT_CONSTRAINT:${rule.id}:transform:${id}`);
      if (rule.kind==='lock_material'&&!same(finish(a),finish(b))) throw Error(`REQUIREMENT_CONSTRAINT:${rule.id}:material:${id}`);
      if (rule.kind==='lock_object'&&!same(a,b)) throw Error(`REQUIREMENT_CONSTRAINT:${rule.id}:object:${id}`);
      // preserve_object intentionally leaves transform, dimensions and material editable.
    }
  }
}
export function effectivePermissions(scene,requirements,objectId) {
  const object=scene.objects.find(entity=>entity.id===objectId);
  if (!object) throw Error(`OBJECT_NOT_FOUND:${objectId}`);
  const kinds=new Set((requirements?.hardConstraints??[]).filter(rule=>!rule.objectIds?.length||rule.objectIds.includes(objectId)).map(rule=>rule.kind));
  const frozen=kinds.has('lock_object'),poseLocked=frozen||kinds.has('lock_transform');
  return {objectId,canMove:!!object.capabilities.movable&&!poseLocked,
    canRotate:!!(object.capabilities.movable&&object.capabilities.rotatable)&&!poseLocked,
    canChangeMaterial:!!object.capabilities.materialEditable&&!frozen&&!kinds.has('lock_material'),
    mustExist:['preserve_object','lock_transform','lock_material','lock_object'].some(kind=>kinds.has(kind)),rules:[...kinds]};
}
