const CORE_STYLE_IDS = Object.freeze([
  'scandinavian',
  'japandi',
  'minimalist',
  'contemporary',
  'mid-century-modern',
  'quiet-luxury',
  'new-chinese',
  'industrial',
]);

const INTENSITIES = new Set(['light', 'typical', 'strong', 'hybrid']);
const BUDGET_BANDS = new Set(['accessible', 'mid', 'upper', 'high', 'unknown']);
const SOURCE_KINDS = new Set(['primary-studio', 'architecture-media', 'design-media', 'public-institution']);
const EVIDENCE_SECTIONS = Object.freeze([
  'designMoves',
  'envelope',
  'furniture',
  'lighting',
  'applicability',
  'risks',
]);

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTextList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isText);
}

function issue(errors, code, path, message) {
  errors.push(Object.freeze({ code, path, message }));
}

export { CORE_STYLE_IDS };

export function validateDesignStyleCases(corpus) {
  const errors = [];
  if (!corpus || corpus.schemaVersion !== 1 || !Array.isArray(corpus.cases)) {
    return { ok: false, errors: [{ code: 'INVALID_ROOT', path: '$', message: 'Expected case corpus schemaVersion 1.' }] };
  }

  const ids = new Set();
  const urls = new Set();
  const counts = new Map(CORE_STYLE_IDS.map((id) => [id, 0]));
  const diversity = new Map(CORE_STYLE_IDS.map((id) => [id, { rooms: new Set(), dwellings: new Set(), intensities: new Set(), geographies: new Set() }]));

  corpus.cases.forEach((item, index) => {
    const path = `cases[${index}]`;
    if (!isText(item.id) || ids.has(item.id)) issue(errors, 'INVALID_ID', `${path}.id`, 'Case IDs must be non-empty and unique.');
    ids.add(item.id);
    if (!CORE_STYLE_IDS.includes(item.styleId)) issue(errors, 'INVALID_STYLE', `${path}.styleId`, 'Case style must be one of the eight core styles.');
    else {
      counts.set(item.styleId, counts.get(item.styleId) + 1);
      const facets = diversity.get(item.styleId);
      item.rooms?.forEach((room) => facets.rooms.add(room));
      facets.dwellings.add(item.dwellingType);
      facets.intensities.add(item.intensity);
      facets.geographies.add(item.geography);
    }
    if (!isText(item.title) || !isText(item.geography) || !isText(item.dwellingType)) issue(errors, 'INCOMPLETE_IDENTITY', path, 'Title, geography, and dwelling type are required.');
    if (!isText(item.source?.url) || urls.has(item.source?.url)) issue(errors, 'INVALID_SOURCE_URL', `${path}.source.url`, 'Source URLs must be non-empty and unique.');
    urls.add(item.source?.url);
    if (!SOURCE_KINDS.has(item.source?.kind) || item.source?.usage !== 'reference_only') issue(errors, 'INVALID_SOURCE_BOUNDARY', `${path}.source`, 'Source kind and reference-only usage are required.');
    if (!isTextList(item.rooms) || !isText(item.household) || !isTextList(item.constraints)) issue(errors, 'INCOMPLETE_CONTEXT', path, 'Rooms, household, and project constraints are required.');
    if (!INTENSITIES.has(item.intensity)) issue(errors, 'INVALID_INTENSITY', `${path}.intensity`, 'Intensity must use the controlled vocabulary.');
    if (!BUDGET_BANDS.has(item.budget?.band) || item.budget?.provenance !== 'curated_estimate') issue(errors, 'INVALID_BUDGET', `${path}.budget`, 'Budget must be a provenance-labelled estimate.');
    for (const section of EVIDENCE_SECTIONS) {
      if (!isTextList(item[section])) issue(errors, 'EMPTY_SECTION', `${path}.${section}`, `${section} must contain compact evidence.`);
    }
    if (!Array.isArray(item.evidence?.sourceFacts) || !Array.isArray(item.evidence?.curatedInferences) || !Array.isArray(item.evidence?.unknowns)) {
      issue(errors, 'INVALID_EVIDENCE', `${path}.evidence`, 'Evidence must separate source facts, curated inferences, and unknowns.');
    }
  });

  for (const [styleId, count] of counts) {
    if (count !== 10) issue(errors, 'STYLE_CASE_COUNT', `styles.${styleId}`, `Expected exactly 10 cases, received ${count}.`);
    const facets = diversity.get(styleId);
    if (count === 10 && (facets.rooms.size < 3 || facets.dwellings.size < 2 || facets.intensities.size < 2 || facets.geographies.size < 3)) {
      issue(errors, 'STYLE_CASE_HOMOGENEITY', `styles.${styleId}`, 'Cases must vary room, dwelling, intensity, and geography facets.');
    }
  }
  return { ok: errors.length === 0, errors };
}

export function projectStyleRagChunks(corpus) {
  const result = validateDesignStyleCases(corpus);
  if (!result.ok) throw new TypeError(`Invalid style case corpus: ${result.errors.map(({ path }) => path).join(', ')}`);
  return Object.freeze(corpus.cases.flatMap((item) => EVIDENCE_SECTIONS.map((section) => Object.freeze({
    id: `${item.id}:${section}`,
    caseId: item.id,
    styleId: item.styleId,
    rooms: item.rooms,
    geography: item.geography,
    dwellingType: item.dwellingType,
    intensity: item.intensity,
    section,
    text: item[section].join(' '),
    sourceUrl: item.source.url,
    evidence: section === 'applicability' || section === 'risks' ? 'curated_inference' : 'source_fact_summary',
  }))));
}
