import { compareSceneVersions } from './design-version.js';
import { evaluateDesignRules } from './design-rules.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const byId = (records) => new Map((records ?? []).map((record) => [record.id, record]));
const SOURCE_FIELDS = ['source', 'priceSource', 'leadTimeSource', 'commercialSource'];
const sourceOf = (record) => SOURCE_FIELDS.map((key) => record?.[key]).find(Boolean) ?? 'demo';

const versionById = (history, versionId = history.currentVersionId) => {
  const version = history.versions.find((candidate) => candidate.id === versionId);
  if (!version) throw new Error('VERSION_NOT_FOUND');
  return version;
};

export function buildDesignerReview(history, consensus, {
  projectId = 'project-demo',
  versionId = history.currentVersionId,
  capability = { aily: 'api_unavailable', base: 'api_unavailable' },
} = {}) {
  const current = versionById(history, versionId);
  const base = current.parentVersionId ? versionById(history, current.parentVersionId) : history.versions[0];
  const diff = compareSceneVersions(base, current);
  const rules = evaluateDesignRules(current.scene);
  const changedObjectIds = new Set(diff.objectDiffs.map((change) => change.objectId));
  const professionalReviews = current.scene.objects
    .filter((object) => changedObjectIds.has(object.id) && object.review?.requiresProfessionalReview && object.review.status !== 'approved')
    .map((object) => ({ objectId: object.id, status: object.review.status, reasons: clone(object.review.reasons), source: object.review.source }));
  const confirmed = consensus?.finalDecision?.versionId === current.id
    ? consensus.confirmations.map((confirmation) => confirmation.memberId)
    : [];

  return {
    schemaVersion: 1,
    projectId,
    route: `/review/${projectId}`,
    currentVersionId: current.id,
    currentVersionLabel: current.label,
    status: current.status,
    baseVersionId: base.id,
    ruleStatus: rules.status,
    ruleIssues: rules.violations.map((check) => ({
      code: check.code,
      status: check.status,
      message: check.message,
      source: check.source ?? 'demo',
      objectIds: [...check.objectIds],
    })),
    objectDiffs: diff.objectDiffs,
    surfaceDiffs: diff.surfaceDiffs,
    professionalReviews,
    unresolved: diff.impact.unresolved,
    household: {
      members: clone(consensus?.members ?? []),
      opinions: clone(consensus?.opinions ?? []),
      finalDecision: clone(consensus?.finalDecision ?? null),
      confirmedMemberIds: confirmed,
    },
    capability,
    recommendation: rules.status === 'blocked' || diff.impact.unresolved.length || professionalReviews.length
      ? 'return_with_notes'
      : 'approve',
  };
}

export function buildHandoffPacket(history, consensus, {
  projectId = 'project-demo',
  versionId = history.currentVersionId,
  capability = { aily: 'api_unavailable', base: 'api_unavailable' },
} = {}) {
  const version = versionById(history, versionId);
  const base = version.parentVersionId ? versionById(history, version.parentVersionId) : history.versions[0];
  const diff = compareSceneVersions(base, version);
  const objects = byId(version.scene.objects);
  const surfaces = byId(version.scene.surfaces);
  const materials = byId(version.scene.materials);

  return {
    schemaVersion: 1,
    projectId,
    version: {
      id: version.id,
      label: version.label,
      status: version.status,
      source: version.source,
      snapshotHash: version.summary.snapshotHash,
    },
    customerConsensus: {
      finalDecision: clone(consensus?.finalDecision ?? null),
      confirmations: clone(consensus?.confirmations ?? []),
      opinions: clone(consensus?.opinions ?? []),
    },
    confirmedObjects: version.scene.objects.map((object) => ({
      id: object.id,
      externalId: object.externalId,
      name: object.name,
      category: object.category,
      roomId: object.roomId,
      dimensions: clone(object.dimensions),
      transform: clone(object.transform),
      hierarchy: clone(object.hierarchy),
      placement: clone(object.placement),
      collision: clone(object.collision),
      model3D: clone(object.model3D),
      review: clone(object.review),
      materialId: object.materialId,
      materialSource: sourceOf(materials.get(object.materialId)),
      source: sourceOf(object),
    })),
    confirmedSurfaces: version.scene.surfaces.map((surface) => ({
      id: surface.id,
      kind: surface.kind,
      roomId: surface.roomId,
      materialId: surface.materialId,
      materialSource: sourceOf(materials.get(surface.materialId)),
      source: sourceOf(surface),
    })),
    changes: diff.objectDiffs.map((change) => ({
      ...change,
      objectName: objects.get(change.objectId)?.name ?? change.objectId,
      source: sourceOf(objects.get(change.objectId)),
    })),
    surfaceChanges: diff.surfaceDiffs.map((change) => ({
      ...change,
      source: sourceOf(surfaces.get(change.surfaceId)),
    })),
    impacts: clone(diff.impact.impacts),
    unresolved: [
      ...diff.impact.unresolved,
      { code: 'OPPEIN_ENTERPRISE_API_PENDING', reason: '真实 SKU、报价、BOM、工期、施工与生产接口等待欧派 / 海外事业部数据。', source: 'estimate' },
    ],
    downstreamPlaceholders: {
      skuMapping: 'pending_enterprise_catalog',
      pricing: 'pending_overseas_quote_or_estimate_api',
      bom: 'pending_bom_preview_api',
      production: 'not_connected_in_v1',
    },
    capability,
  };
}
