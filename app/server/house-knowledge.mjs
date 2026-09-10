import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';

const SCHEMA_VERSION = 1;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_CHUNK_CHARS = 720;
const CHUNK_OVERLAP_CHARS = 90;
const TRUST_LEVELS = new Set(['official', 'user_confirmed', 'curated', 'unverified']);
const SOURCE_STATUSES = new Set(['current', 'stale', 'revoked']);
const SCOPE_LEVELS = new Set(['house', 'project']);
const DOCUMENT_KINDS = new Set(['text', 'markdown', 'json', 'csv', 'html', 'pdf_extracted']);
const TRUST_RANK = Object.freeze({ official: 4, user_confirmed: 3, curated: 2, unverified: 1 });
const SECRET_QUERY_KEY = /(?:api[-_]?key|authorization|password|secret|token)/i;
const DESIGN_CONSTRAINT_TYPES = new Set(['material', 'lock_transform', 'no_new_objects']);
const MAX_DESIGN_CONSTRAINTS = 64;
const MAX_MATERIAL_IDS_PER_CONSTRAINT = 16;

const clone = (value) => JSON.parse(JSON.stringify(value));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const nowIso = () => new Date().toISOString();
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const normalizeText = (value) => String(value ?? '').normalize('NFKC').replace(/\r\n?/g, '\n').replace(/\0/g, '').trim();
const normalizeSearchText = (value) => normalizeText(value).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();

function requireId(value, code) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 160 || !/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(text)) throw new Error(code);
  return text;
}

function requireIso(value, code) {
  const text = String(value ?? '').trim();
  if (!text || Number.isNaN(Date.parse(text))) throw new Error(code);
  return new Date(text).toISOString();
}

function requireShortText(value, code, max = 500) {
  const text = normalizeText(value);
  if (!text || text.length > max) throw new Error(code);
  return text;
}

function inferKind(source, filePath) {
  if (source.kind) return source.kind;
  const extension = extname(filePath ?? source.uri ?? '').toLowerCase();
  return ({ '.md': 'markdown', '.markdown': 'markdown', '.json': 'json', '.csv': 'csv', '.html': 'html', '.htm': 'html', '.txt': 'text', '.pdf': 'pdf_extracted' })[extension] ?? 'text';
}

function sanitizeSourceUri(value) {
  const text = requireShortText(value, 'HOUSE_KNOWLEDGE_SOURCE_URI_INVALID', 1000);
  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) return text;
    parsed.username = '';
    parsed.password = '';
    for (const key of [...parsed.searchParams.keys()]) if (SECRET_QUERY_KEY.test(key)) parsed.searchParams.set(key, '[REDACTED]');
    return parsed.toString();
  } catch {
    return text;
  }
}

function assertAllowedPath(filePath, allowedRoots) {
  if (!allowedRoots.length) throw new Error('HOUSE_KNOWLEDGE_FILE_IMPORT_DISABLED');
  const candidate = realpathSync(resolve(filePath));
  const allowed = allowedRoots.some((root) => {
    const base = realpathSync(resolve(root));
    const pathFromBase = relative(base, candidate);
    return pathFromBase === '' || (!pathFromBase.startsWith(`..${sep}`) && pathFromBase !== '..' && !pathFromBase.startsWith(sep));
  });
  if (!allowed) throw new Error('HOUSE_KNOWLEDGE_FILE_OUTSIDE_ALLOWED_ROOT');
  return candidate;
}

function readInputContent(input, allowedRoots) {
  const hasContent = typeof input.content === 'string' || Buffer.isBuffer(input.content);
  const hasFile = typeof input.filePath === 'string' && input.filePath.trim();
  if (Boolean(hasContent) === Boolean(hasFile)) throw new Error('HOUSE_KNOWLEDGE_CONTENT_REQUIRED');
  if (hasContent) return Buffer.isBuffer(input.content) ? input.content.toString('utf8') : input.content;
  const safePath = assertAllowedPath(input.filePath, allowedRoots);
  if (extname(safePath).toLowerCase() === '.pdf') throw new Error('HOUSE_KNOWLEDGE_PDF_EXTRACTION_REQUIRED');
  const bytes = readFileSync(safePath);
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('HOUSE_KNOWLEDGE_DOCUMENT_TOO_LARGE');
  return bytes.toString('utf8');
}

function flattenJson(value, path = '$', output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenJson(item, `${path}[${index}]`, output));
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) flattenJson(item, `${path}.${key}`, output);
  } else if (value !== null && value !== undefined) {
    output.push({ text: `${path}: ${String(value)}`, location: { jsonPath: path } });
  }
  return output;
}

function stripHtml(content) {
  return content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function textBlocks(content, kind) {
  if (kind === 'json') {
    let parsed;
    try { parsed = JSON.parse(content); } catch { throw new Error('HOUSE_KNOWLEDGE_JSON_INVALID'); }
    return flattenJson(parsed);
  }
  if (kind === 'csv') {
    return normalizeText(content).split('\n').map((line, index) => ({ text: line.trim(), location: { rowStart: index + 1, rowEnd: index + 1 } })).filter(({ text }) => text);
  }
  const normalized = kind === 'html' ? normalizeText(stripHtml(content)) : normalizeText(content);
  const lines = normalized.split('\n');
  const blocks = [];
  let heading = null;
  let pending = [];
  let startLine = 1;
  const flush = (endLine) => {
    const text = normalizeText(pending.join(' '));
    if (text) blocks.push({ text, location: { lineStart: startLine, lineEnd: endLine, ...(heading ? { section: heading } : {}) } });
    pending = [];
  };
  lines.forEach((line, index) => {
    const markdownHeading = kind === 'markdown' ? line.match(/^#{1,6}\s+(.+)$/) : null;
    if (markdownHeading) {
      flush(index);
      heading = normalizeText(markdownHeading[1]);
      startLine = index + 2;
      return;
    }
    if (!line.trim()) {
      flush(index + 1);
      startLine = index + 2;
      return;
    }
    if (!pending.length) startLine = index + 1;
    pending.push(line.trim());
  });
  flush(lines.length);
  return blocks;
}

function splitLongBlock(block) {
  if (block.text.length <= MAX_CHUNK_CHARS) return [block];
  const chunks = [];
  let offset = 0;
  while (offset < block.text.length) {
    let end = Math.min(block.text.length, offset + MAX_CHUNK_CHARS);
    if (end < block.text.length) {
      const boundary = Math.max(
        block.text.lastIndexOf('。', end),
        block.text.lastIndexOf('；', end),
        block.text.lastIndexOf('. ', end),
        block.text.lastIndexOf('; ', end),
      );
      if (boundary > offset + Math.floor(MAX_CHUNK_CHARS * 0.55)) end = boundary + 1;
    }
    chunks.push({ text: block.text.slice(offset, end).trim(), location: { ...block.location, charStart: offset, charEnd: end } });
    if (end >= block.text.length) break;
    offset = Math.max(offset + 1, end - CHUNK_OVERLAP_CHARS);
  }
  return chunks.filter(({ text }) => text);
}

function parseDocument(content, kind) {
  const normalized = normalizeText(content);
  if (!normalized) throw new Error('HOUSE_KNOWLEDGE_CONTENT_EMPTY');
  if (Buffer.byteLength(normalized, 'utf8') > MAX_DOCUMENT_BYTES) throw new Error('HOUSE_KNOWLEDGE_DOCUMENT_TOO_LARGE');
  if (!DOCUMENT_KINDS.has(kind)) throw new Error('HOUSE_KNOWLEDGE_KIND_UNSUPPORTED');
  return textBlocks(normalized, kind).flatMap(splitLongBlock);
}

function parseJsonDocument(content) {
  try { return JSON.parse(content); } catch { throw new Error('HOUSE_KNOWLEDGE_JSON_INVALID'); }
}

function requireIdList(value, code) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_MATERIAL_IDS_PER_CONSTRAINT) throw new Error(code);
  const ids = value.map((item) => requireId(item, code));
  if (new Set(ids).size !== ids.length) throw new Error(code);
  return ids;
}

function normalizeDesignConstraints({ input, content, kind, source, documentId, revision, contentSha256 }) {
  let embedded;
  if (kind === 'json') {
    const parsed = parseJsonDocument(content);
    if (isRecord(parsed) && Object.hasOwn(parsed, 'designConstraints')) embedded = parsed.designConstraints;
  }
  if (input.designConstraints !== undefined && embedded !== undefined) throw new Error('HOUSE_KNOWLEDGE_DESIGN_CONSTRAINTS_MULTIPLE_INPUTS');
  const rawConstraints = input.designConstraints ?? embedded;
  if (rawConstraints === undefined) return [];
  if (!Array.isArray(rawConstraints) || rawConstraints.length > MAX_DESIGN_CONSTRAINTS) throw new Error('HOUSE_KNOWLEDGE_DESIGN_CONSTRAINTS_INVALID');
  const authorizationExplicit = Object.hasOwn(input.source ?? {}, 'authorization') &&
    typeof input.source.authorization === 'string' && input.source.authorization.trim().length > 0;
  if (source.trust !== 'user_confirmed' || input.source?.authorized !== true || !authorizationExplicit) {
    throw new Error('HOUSE_KNOWLEDGE_DESIGN_CONSTRAINTS_REQUIRE_USER_CONFIRMATION');
  }
  const normalizedConstraints = rawConstraints.map((raw, index) => {
    if (!isRecord(raw)) throw new Error('HOUSE_KNOWLEDGE_DESIGN_CONSTRAINT_INVALID');
    const type = String(raw.type ?? '').trim();
    if (!DESIGN_CONSTRAINT_TYPES.has(type)) throw new Error('HOUSE_KNOWLEDGE_DESIGN_CONSTRAINT_TYPE_INVALID');
    const allowedKeys = new Set(type === 'material'
      ? ['id', 'type', 'targetId', 'allowedMaterialIds', 'forbiddenMaterialIds']
      : ['id', 'type', 'targetId']);
    if (Object.keys(raw).some((key) => !allowedKeys.has(key))) throw new Error('HOUSE_KNOWLEDGE_DESIGN_CONSTRAINT_FIELDS_INVALID');
    const logicalId = raw.id === undefined
      ? `constraint-${index + 1}`
      : requireId(raw.id, 'HOUSE_KNOWLEDGE_DESIGN_CONSTRAINT_ID_INVALID');
    const targetId = requireId(raw.targetId, 'HOUSE_KNOWLEDGE_DESIGN_CONSTRAINT_TARGET_INVALID');
    const normalized = { logicalId, type, targetId };
    if (type === 'material') {
      const allowedMaterialIds = requireIdList(raw.allowedMaterialIds, 'HOUSE_KNOWLEDGE_ALLOWED_MATERIALS_INVALID');
      const forbiddenMaterialIds = requireIdList(raw.forbiddenMaterialIds, 'HOUSE_KNOWLEDGE_FORBIDDEN_MATERIALS_INVALID');
      if (!allowedMaterialIds.length && !forbiddenMaterialIds.length) throw new Error('HOUSE_KNOWLEDGE_MATERIAL_POLICY_EMPTY');
      if (allowedMaterialIds.some((materialId) => forbiddenMaterialIds.includes(materialId))) throw new Error('HOUSE_KNOWLEDGE_MATERIAL_POLICY_CONFLICT');
      if (allowedMaterialIds.length) normalized.allowedMaterialIds = allowedMaterialIds;
      if (forbiddenMaterialIds.length) normalized.forbiddenMaterialIds = forbiddenMaterialIds;
    }
    return {
      ...normalized,
      evidenceConstraintId: `constraint-${hash(`${documentId}\u0000${revision}\u0000${contentSha256}\u0000${index}\u0000${JSON.stringify(normalized)}`).slice(0, 24)}`,
      binding: { documentRevision: revision, contentSha256 },
    };
  });
  if (new Set(normalizedConstraints.map((constraint) => constraint.logicalId)).size !== normalizedConstraints.length) {
    throw new Error('HOUSE_KNOWLEDGE_DESIGN_CONSTRAINT_ID_DUPLICATE');
  }
  return normalizedConstraints;
}

function validateStoredDesignConstraint(constraint, document, index) {
  if (
    !isRecord(constraint) || typeof constraint.evidenceConstraintId !== 'string' ||
    typeof constraint.logicalId !== 'string' || !DESIGN_CONSTRAINT_TYPES.has(constraint.type) ||
    typeof constraint.targetId !== 'string' || !isRecord(constraint.binding) ||
    constraint.binding.documentRevision !== document.revision || constraint.binding.contentSha256 !== document.contentSha256
  ) throw new Error('HOUSE_KNOWLEDGE_STORE_INVALID');
  const normalized = { logicalId: constraint.logicalId, type: constraint.type, targetId: constraint.targetId };
  if (constraint.type === 'material') {
    const allowed = constraint.allowedMaterialIds ?? [];
    const forbidden = constraint.forbiddenMaterialIds ?? [];
    if ((!Array.isArray(allowed) || !Array.isArray(forbidden)) || (!allowed.length && !forbidden.length) ||
      allowed.length > MAX_MATERIAL_IDS_PER_CONSTRAINT || forbidden.length > MAX_MATERIAL_IDS_PER_CONSTRAINT) throw new Error('HOUSE_KNOWLEDGE_STORE_INVALID');
    if ([...allowed, ...forbidden].some((item) => typeof item !== 'string') || new Set(allowed).size !== allowed.length ||
      new Set(forbidden).size !== forbidden.length || allowed.some((item) => forbidden.includes(item))) {
      throw new Error('HOUSE_KNOWLEDGE_STORE_INVALID');
    }
    if (allowed.length) normalized.allowedMaterialIds = allowed;
    if (forbidden.length) normalized.forbiddenMaterialIds = forbidden;
  } else if (constraint.allowedMaterialIds !== undefined || constraint.forbiddenMaterialIds !== undefined) {
    throw new Error('HOUSE_KNOWLEDGE_STORE_INVALID');
  }
  const expectedId = `constraint-${hash(`${document.id}\u0000${document.revision}\u0000${document.contentSha256}\u0000${index}\u0000${JSON.stringify(normalized)}`).slice(0, 24)}`;
  if (constraint.evidenceConstraintId !== expectedId) throw new Error('HOUSE_KNOWLEDGE_STORE_INVALID');
}

function tokenize(value) {
  const text = normalizeSearchText(value);
  const terms = new Set(text.match(/[a-z0-9]+(?:[._-][a-z0-9]+)*/g) ?? []);
  for (const sequence of text.match(/[\p{Script=Han}]+/gu) ?? []) {
    if (sequence.length <= 8) terms.add(sequence);
    for (let index = 0; index < sequence.length; index += 1) {
      if (index + 1 < sequence.length) terms.add(sequence.slice(index, index + 2));
      if (index + 2 < sequence.length) terms.add(sequence.slice(index, index + 3));
    }
    if (sequence.length === 1) terms.add(sequence);
  }
  return [...terms].filter((term) => term.length > 1 || /[\p{Script=Han}]/u.test(term));
}

function scoreChunk(chunk, queryText, queryTerms, documentFrequency, chunkCount) {
  const searchable = normalizeSearchText(`${chunk.location.section ?? ''} ${chunk.text}`);
  let score = searchable.includes(queryText) && queryText.length >= 3 ? 14 : 0;
  const matchedTerms = [];
  for (const term of queryTerms) {
    if (!searchable.includes(term)) continue;
    matchedTerms.push(term);
    const rarity = Math.log((chunkCount + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1;
    score += Math.min(term.length, 6) * rarity;
  }
  if (chunk.location.section && queryTerms.some((term) => normalizeSearchText(chunk.location.section).includes(term))) score += 3;
  return { score, matchedTerms: [...new Set(matchedTerms)].sort((a, b) => b.length - a.length).slice(0, 10) };
}

function validateState(state) {
  if (state?.schemaVersion !== SCHEMA_VERSION || !Number.isInteger(state?.indexRevision) || state.indexRevision < 0 || !Array.isArray(state?.documents)) {
    throw new Error('HOUSE_KNOWLEDGE_STORE_INVALID');
  }
  const documentIds = new Set();
  const sourceKeys = new Set();
  for (const document of state.documents) {
    if (
      !document?.id || documentIds.has(document.id) || !document?.sourceKey || sourceKeys.has(document.sourceKey) ||
      typeof document.projectId !== 'string' || !SCOPE_LEVELS.has(document.scopeLevel) ||
      (document.scopeLevel === 'house' && typeof document.houseId !== 'string') ||
      (document.scopeLevel === 'project' && document.houseId !== null) ||
      !Number.isInteger(document.revision) || document.revision < 1 ||
      typeof document.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(document.contentSha256) ||
      !isRecord(document.source) || !DOCUMENT_KINDS.has(document.source.kind) ||
      !TRUST_LEVELS.has(document.source.trust) || !SOURCE_STATUSES.has(document.source.status) ||
      typeof document.source.uri !== 'string' || typeof document.source.title !== 'string' ||
      Number.isNaN(Date.parse(document.source.updatedAt)) || !Array.isArray(document.chunks) ||
      (document.designConstraints !== undefined && (!Array.isArray(document.designConstraints) || document.designConstraints.length > MAX_DESIGN_CONSTRAINTS))
    ) {
      throw new Error('HOUSE_KNOWLEDGE_STORE_INVALID');
    }
    documentIds.add(document.id);
    sourceKeys.add(document.sourceKey);
    const chunkIds = new Set();
    for (const chunk of document.chunks) {
      if (!chunk?.id || chunkIds.has(chunk.id) || typeof chunk.text !== 'string' || !chunk.text || !isRecord(chunk.location)) {
        throw new Error('HOUSE_KNOWLEDGE_STORE_INVALID');
      }
      chunkIds.add(chunk.id);
    }
    const logicalConstraintIds = new Set();
    if ((document.designConstraints?.length ?? 0) > 0 && (document.source.trust !== 'user_confirmed' || typeof document.source.authorization !== 'string' || !document.source.authorization.trim())) {
      throw new Error('HOUSE_KNOWLEDGE_STORE_INVALID');
    }
    for (const [index, constraint] of (document.designConstraints ?? []).entries()) {
      validateStoredDesignConstraint(constraint, document, index);
      if (logicalConstraintIds.has(constraint.logicalId)) throw new Error('HOUSE_KNOWLEDGE_STORE_INVALID');
      logicalConstraintIds.add(constraint.logicalId);
    }
  }
  return state;
}

function normalizeScope(input) {
  const projectId = requireId(input.projectId, 'HOUSE_KNOWLEDGE_PROJECT_ID_INVALID');
  const scopeLevel = input.scopeLevel ?? 'house';
  if (!SCOPE_LEVELS.has(scopeLevel)) throw new Error('HOUSE_KNOWLEDGE_SCOPE_INVALID');
  const houseId = scopeLevel === 'house' ? requireId(input.houseId, 'HOUSE_KNOWLEDGE_HOUSE_ID_INVALID') : null;
  return { projectId, houseId, scopeLevel };
}

function normalizeSource(input, importedAt, allowedImportTrust) {
  const source = input.source;
  if (!isRecord(source) || source.authorized !== true) throw new Error('HOUSE_KNOWLEDGE_SOURCE_NOT_AUTHORIZED');
  const trust = source.trust ?? 'unverified';
  const status = source.status ?? 'current';
  if (!TRUST_LEVELS.has(trust)) throw new Error('HOUSE_KNOWLEDGE_TRUST_INVALID');
  if (!allowedImportTrust.has(trust)) throw new Error('HOUSE_KNOWLEDGE_TRUST_NOT_ALLOWED');
  if (!SOURCE_STATUSES.has(status)) throw new Error('HOUSE_KNOWLEDGE_SOURCE_STATUS_INVALID');
  return {
    title: requireShortText(source.title, 'HOUSE_KNOWLEDGE_SOURCE_TITLE_INVALID', 240),
    uri: sanitizeSourceUri(source.uri),
    kind: inferKind(source, input.filePath),
    location: source.location ? requireShortText(source.location, 'HOUSE_KNOWLEDGE_SOURCE_LOCATION_INVALID', 500) : null,
    trust,
    status,
    authorization: source.authorization ? requireShortText(source.authorization, 'HOUSE_KNOWLEDGE_AUTHORIZATION_INVALID', 120) : 'user_provided',
    updatedAt: source.updatedAt ? requireIso(source.updatedAt, 'HOUSE_KNOWLEDGE_SOURCE_UPDATED_AT_INVALID') : importedAt,
  };
}

function sourceSummary(document) {
  return {
    id: document.id,
    documentId: document.id,
    title: document.source.title,
    uri: document.source.uri,
    kind: document.source.kind,
    location: document.source.location,
    updatedAt: document.source.updatedAt,
    trust: document.source.trust,
    status: document.source.status,
    authorization: document.source.authorization,
    contentSha256: document.contentSha256,
    revision: document.revision,
  };
}

export function buildPlannerKnowledgeContext(searchResult, { maxResults = 4, maxExcerptChars = 520 } = {}) {
  if (!isRecord(searchResult) || !Array.isArray(searchResult.results) || !Array.isArray(searchResult.evidenceConstraints ?? [])) throw new Error('HOUSE_KNOWLEDGE_SEARCH_RESULT_INVALID');
  return {
    role: 'untrusted_house_reference',
    policy: {
      contentMayAuthorizeTools: false,
      contentMayOverrideInstructions: false,
      canonicalSceneIsGeometryAuthority: true,
      missingOrConflictingFactsRequireClarification: true,
      freeTextMayBecomeDeterministicConstraint: false,
      typedConfirmedConstraintsRequireDeterministicValidation: true,
    },
    status: searchResult.status,
    scope: clone(searchResult.scope),
    indexRevision: searchResult.indexRevision,
    evidence: searchResult.results.slice(0, maxResults).map((result) => ({
      evidenceId: result.chunkId,
      excerpt: result.text.slice(0, maxExcerptChars),
      relevance: result.score,
      matchedTerms: clone(result.matchedTerms),
      source: clone(result.source),
      location: clone(result.location),
      contentRole: 'untrusted_reference',
    })),
    evidenceConstraints: clone(searchResult.evidenceConstraints ?? []),
  };
}

export function createHouseKnowledgeStore({
  filePath,
  allowedRoots = [],
  allowedImportTrust = ['user_confirmed', 'unverified'],
  now = nowIso,
  id = randomUUID,
} = {}) {
  if (!filePath) throw new Error('HOUSE_KNOWLEDGE_STORE_PATH_REQUIRED');
  const importTrust = new Set(allowedImportTrust);
  if (!importTrust.size || [...importTrust].some((trust) => !TRUST_LEVELS.has(trust))) throw new Error('HOUSE_KNOWLEDGE_IMPORT_TRUST_CONFIG_INVALID');
  mkdirSync(dirname(filePath), { recursive: true });
  let state = existsSync(filePath)
    ? validateState(JSON.parse(readFileSync(filePath, 'utf8')))
    : { schemaVersion: SCHEMA_VERSION, indexRevision: 0, documents: [] };

  const save = () => {
    const temporaryPath = `${filePath}.tmp-${process.pid}-${String(id()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
      renameSync(temporaryPath, filePath);
    } catch (error) {
      rmSync(temporaryPath, { force: true });
      throw error;
    }
  };

  if (!existsSync(filePath)) save();

  const importDocument = (input = {}) => {
    const scope = normalizeScope(input);
    const importedAt = requireIso(now(), 'HOUSE_KNOWLEDGE_CLOCK_INVALID');
    const source = normalizeSource(input, importedAt, importTrust);
    const content = normalizeText(readInputContent(input, allowedRoots));
    const parsed = parseDocument(content, source.kind);
    const sourceKey = hash(`${scope.projectId}\u0000${scope.scopeLevel}\u0000${scope.houseId ?? '*'}\u0000${source.uri}`);
    const existingIndex = state.documents.findIndex((document) => document.sourceKey === sourceKey);
    const existing = existingIndex >= 0 ? state.documents[existingIndex] : null;
    if (existing && input.expectedRevision === undefined) throw new Error('HOUSE_KNOWLEDGE_EXPECTED_REVISION_REQUIRED');
    if (input.expectedRevision !== undefined && input.expectedRevision !== (existing?.revision ?? 0)) throw new Error('HOUSE_KNOWLEDGE_REVISION_CONFLICT');
    if (existing && Date.parse(source.updatedAt) < Date.parse(existing.source.updatedAt)) throw new Error('HOUSE_KNOWLEDGE_SOURCE_UPDATE_STALE');
    const revision = (existing?.revision ?? 0) + 1;
    const documentId = existing?.id ?? `doc-${hash(`${sourceKey}\u0000${id()}`).slice(0, 20)}`;
    const contentSha256 = hash(content);
    const designConstraints = normalizeDesignConstraints({ input, content, kind: source.kind, source, documentId, revision, contentSha256 });
    const document = {
      id: documentId,
      sourceKey,
      ...scope,
      revision,
      importedAt,
      contentSha256,
      source,
      designConstraints,
      chunks: parsed.map((chunk, index) => ({
        id: `chunk-${hash(`${documentId}\u0000${revision}\u0000${index}\u0000${chunk.text}`).slice(0, 24)}`,
        text: chunk.text,
        location: chunk.location,
      })),
    };
    const documents = [...state.documents];
    if (existingIndex >= 0) documents.splice(existingIndex, 1, document);
    else documents.push(document);
    state = validateState({ ...state, indexRevision: state.indexRevision + 1, documents });
    save();
    return clone({ indexRevision: state.indexRevision, replaced: Boolean(existing), document: { ...sourceSummary(document), ...scope, chunkCount: document.chunks.length, designConstraintCount: designConstraints.length } });
  };

  const documentsForSearch = ({ projectId, houseId, includeTrust }) => {
    const exclusions = { differentProject: 0, differentHouse: 0, notCurrent: 0, trustFiltered: 0 };
    const documents = state.documents.filter((document) => {
      if (document.projectId !== projectId) { exclusions.differentProject += 1; return false; }
      if (document.scopeLevel === 'house' && document.houseId !== houseId) { exclusions.differentHouse += 1; return false; }
      if (document.source.status !== 'current') { exclusions.notCurrent += 1; return false; }
      if (includeTrust && !includeTrust.has(document.source.trust)) { exclusions.trustFiltered += 1; return false; }
      return true;
    });
    return { documents, exclusions };
  };

  const search = ({ projectId: rawProjectId, houseId: rawHouseId, query, limit = 5, includeTrust } = {}) => {
    const projectId = requireId(rawProjectId, 'HOUSE_KNOWLEDGE_PROJECT_ID_INVALID');
    const houseId = requireId(rawHouseId, 'HOUSE_KNOWLEDGE_HOUSE_ID_INVALID');
    const rawQuery = requireShortText(query, 'HOUSE_KNOWLEDGE_QUERY_INVALID', 1000);
    if (!Number.isInteger(limit) || limit < 1 || limit > 12) throw new Error('HOUSE_KNOWLEDGE_LIMIT_INVALID');
    const trustFilter = includeTrust === undefined ? null : new Set(includeTrust);
    if (trustFilter && [...trustFilter].some((trust) => !TRUST_LEVELS.has(trust))) throw new Error('HOUSE_KNOWLEDGE_TRUST_FILTER_INVALID');
    const { documents, exclusions } = documentsForSearch({ projectId, houseId, includeTrust: trustFilter });
    const candidates = documents.flatMap((document) => document.chunks.map((chunk) => ({ document, chunk })));
    const queryText = normalizeSearchText(rawQuery);
    const queryTerms = tokenize(rawQuery);
    const documentFrequency = new Map(queryTerms.map((term) => [term, candidates.filter(({ chunk }) => normalizeSearchText(chunk.text).includes(term)).length]));
    const results = candidates.map(({ document, chunk }) => ({ document, chunk, ...scoreChunk(chunk, queryText, queryTerms, documentFrequency, candidates.length) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || TRUST_RANK[right.document.source.trust] - TRUST_RANK[left.document.source.trust] || left.chunk.id.localeCompare(right.chunk.id))
      .slice(0, limit)
      .map(({ document, chunk, score, matchedTerms }) => ({
        chunkId: chunk.id,
        text: chunk.text,
        score: Number(score.toFixed(4)),
        matchedTerms,
        location: clone(chunk.location),
        scope: { projectId: document.projectId, houseId: document.houseId, scopeLevel: document.scopeLevel },
        source: sourceSummary(document),
        contentRole: 'untrusted_reference',
      }));
    const evidenceConstraints = documents
      .filter((document) => document.source.trust === 'user_confirmed')
      .flatMap((document) => (document.designConstraints ?? []).map((constraint) => ({
        ...clone(constraint),
        sourceId: document.id,
        binding: {
          documentId: document.id,
          documentRevision: document.revision,
          contentSha256: document.contentSha256,
          indexRevision: state.indexRevision,
          projectId: document.projectId,
          houseId: document.houseId,
          scopeLevel: document.scopeLevel,
        },
        source: sourceSummary(document),
        contentRole: 'confirmed_typed_constraint',
        mayAuthorizeTools: false,
      })));
    const evidenceSources = [
      ...results.map((result) => ({
        id: result.source.documentId,
        title: result.source.title,
        url: result.source.uri,
        location: result.source.location ?? (result.location.section ? `章节：${result.location.section}` : null),
        scope: result.scope.scopeLevel === 'project' ? `项目 ${projectId}` : `房屋 ${houseId}`,
        updatedAt: result.source.updatedAt,
        trust: result.source.trust,
      })),
      ...evidenceConstraints.map((constraint) => ({
        id: constraint.sourceId,
        title: constraint.source.title,
        url: constraint.source.uri,
        location: constraint.source.location,
        scope: constraint.binding.scopeLevel === 'project' ? `项目 ${projectId}` : `房屋 ${houseId}`,
        updatedAt: constraint.source.updatedAt,
        trust: constraint.source.trust,
      })),
    ];
    return clone({
      status: results.length || evidenceConstraints.length ? 'ready' : documents.length ? 'insufficient_context' : 'no_documents',
      query: rawQuery,
      scope: { projectId, houseId },
      indexRevision: state.indexRevision,
      results,
      evidenceConstraints,
      sources: [...new Map(evidenceSources.map((source) => [source.id, source])).values()],
      exclusions,
    });
  };

  const listDocuments = ({ projectId: rawProjectId, houseId: rawHouseId } = {}) => {
    const projectId = requireId(rawProjectId, 'HOUSE_KNOWLEDGE_PROJECT_ID_INVALID');
    const houseId = rawHouseId === undefined ? null : requireId(rawHouseId, 'HOUSE_KNOWLEDGE_HOUSE_ID_INVALID');
    return clone(state.documents.filter((document) => document.projectId === projectId && (houseId === null || document.scopeLevel === 'project' || document.houseId === houseId)).map((document) => ({
      ...sourceSummary(document),
      projectId: document.projectId,
      houseId: document.houseId,
      scopeLevel: document.scopeLevel,
      chunkCount: document.chunks.length,
      designConstraintCount: (document.designConstraints ?? []).length,
      importedAt: document.importedAt,
    })));
  };

  const removeDocument = ({ projectId: rawProjectId, houseId: rawHouseId, documentId, expectedRevision } = {}) => {
    const projectId = requireId(rawProjectId, 'HOUSE_KNOWLEDGE_PROJECT_ID_INVALID');
    const houseId = rawHouseId === undefined ? null : requireId(rawHouseId, 'HOUSE_KNOWLEDGE_HOUSE_ID_INVALID');
    const targetId = requireId(documentId, 'HOUSE_KNOWLEDGE_DOCUMENT_ID_INVALID');
    const index = state.documents.findIndex((document) => document.id === targetId && document.projectId === projectId && (document.scopeLevel === 'project' || document.houseId === houseId));
    if (index < 0) throw new Error('HOUSE_KNOWLEDGE_DOCUMENT_NOT_FOUND');
    const document = state.documents[index];
    if (expectedRevision !== undefined && expectedRevision !== document.revision) throw new Error('HOUSE_KNOWLEDGE_REVISION_CONFLICT');
    const documents = [...state.documents];
    documents.splice(index, 1);
    state = validateState({ ...state, indexRevision: state.indexRevision + 1, documents });
    save();
    return clone({ removedDocumentId: document.id, indexRevision: state.indexRevision });
  };

  const getStats = ({ projectId: rawProjectId, houseId: rawHouseId } = {}) => {
    const documents = listDocuments({ projectId: rawProjectId, ...(rawHouseId === undefined ? {} : { houseId: rawHouseId }) });
    return { indexRevision: state.indexRevision, documents: documents.length, chunks: documents.reduce((sum, document) => sum + document.chunkCount, 0) };
  };

  return Object.freeze({ importDocument, search, listDocuments, removeDocument, getStats });
}
