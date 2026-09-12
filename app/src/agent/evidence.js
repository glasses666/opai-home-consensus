// Confirmed, typed design policies constrain scene changes, never tool authority.
// Ordinary source prose is deliberately not parsed into executable commands.
export function assertEvidenceConstraints(before, after, constraints = [], scope = {}) {
  for (const rule of constraints) {
    const binding = rule.binding ?? {};
    if (rule.contentRole !== 'confirmed_typed_constraint' || rule.source?.trust !== 'user_confirmed'
      || !binding.documentId || !binding.documentRevision || !binding.contentSha256
      || (scope.projectId && binding.projectId !== scope.projectId)
      || (scope.houseId && binding.scopeLevel !== 'project' && binding.houseId !== scope.houseId)) throw Error('EVIDENCE_CONSTRAINT_SCOPE_INVALID');
    const id = rule.evidenceConstraintId;
    const a = before.objects.find(o=>o.id===rule.targetId) ?? before.surfaces.find(o=>o.id===rule.targetId);
    const b = after.objects.find(o=>o.id===rule.targetId) ?? after.surfaces.find(o=>o.id===rule.targetId);
    if (rule.type === 'material') {
      if (!a) throw Error(`EVIDENCE_TARGET_UNKNOWN:${rule.targetId}`);
      if (!b || a.materialId === b.materialId) continue;
      const materialIds = new Set(before.materials.map(m=>m.id));
      if ([...(rule.allowedMaterialIds??[]),...(rule.forbiddenMaterialIds??[])].some(m=>!materialIds.has(m))) throw Error(`EVIDENCE_MATERIAL_UNKNOWN:${id}`);
      if ((rule.allowedMaterialIds?.length && !rule.allowedMaterialIds.includes(b.materialId)) || rule.forbiddenMaterialIds?.includes(b.materialId)) throw Error(`EVIDENCE_MATERIAL_CONSTRAINT:${id}:${rule.targetId}:${b.materialId}`);
    } else if (rule.type === 'lock_transform') {
      if (!a?.transform) throw Error(`EVIDENCE_TARGET_UNKNOWN:${rule.targetId}`);
      if (!b || JSON.stringify(a.transform)!==JSON.stringify(b.transform) || JSON.stringify(a.dimensions)!==JSON.stringify(b.dimensions)) throw Error(`EVIDENCE_TRANSFORM_CONSTRAINT:${id}:${rule.targetId}`);
    } else if (rule.type === 'no_new_objects') {
      const whole = rule.targetId === before.id;
      if (!whole && !before.rooms.some(r=>r.id===rule.targetId)) throw Error(`EVIDENCE_TARGET_UNKNOWN:${rule.targetId}`);
      if (after.objects.some(o=>(whole || o.roomId===rule.targetId) && !before.objects.some(p=>p.id===o.id))) throw Error(`EVIDENCE_NEW_OBJECT_CONSTRAINT:${id}`);
    } else throw Error('EVIDENCE_CONSTRAINT_TYPE_INVALID');
  }
}

export function assertEvidenceCitations(reasons, searches) {
  const ids = new Set(searches.flatMap(search=>[
    ...(search.results??[]).flatMap(r=>[r.chunkId,r.source?.documentId]),
    ...(search.evidenceConstraints??[]).flatMap(r=>[r.evidenceConstraintId,r.binding?.documentId]),
  ]).filter(Boolean));
  const cited = (Array.isArray(reasons)?reasons:[]).flatMap(r=>Array.isArray(r.sourceIds)?r.sourceIds:[]);
  if (cited.some(id=>!ids.has(id))) throw Error('EVIDENCE_SOURCE_UNKNOWN: cite only observed current documentId or chunkId');
  if (ids.size && !cited.length) throw Error('EVIDENCE_CITATION_REQUIRED: explain how applicable retrieved evidence affects this preview; cite current documentId or chunkId, or clarify why the evidence conflicts before changing the scene');
}
