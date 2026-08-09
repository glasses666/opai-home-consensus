import { readFileSync } from 'node:fs';

const ITEM_SOURCES = new Set(['demo', 'enterprise']);
const PROVENANCE_SOURCES = new Set(['demo', 'estimate', 'enterprise']);
const DIMENSIONS = ['width', 'depth', 'height'];
const OPERATION_TYPES = new Set(['surface.setMaterial']);
const STABLE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,127}$/;

const clone = (value) => JSON.parse(JSON.stringify(value));
const empty = (value) => value === undefined || value === null || value === '';
const splitList = (value) => empty(value) ? [] : String(value).split('|').map((item) => item.trim()).filter(Boolean);

function error(errors, code, path, message) {
  errors.push({ code, path, message });
}

function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  let closedQuote = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += char;
      }
    } else if (closedQuote && char !== ',' && char !== '\n' && char !== '\r') {
      throw Object.assign(new Error('CSV data after closing quote'), { code: 'CATALOG_CSV_MALFORMED' });
    } else if (char === '"') {
      if (field !== '') throw Object.assign(new Error('CSV quote must start a field'), { code: 'CATALOG_CSV_MALFORMED' });
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
      closedQuote = false;
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      closedQuote = false;
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (quoted) throw Object.assign(new Error('CSV quote was not closed'), { code: 'CATALOG_CSV_MALFORMED' });
  row.push(field);
  if (row.some((cell) => cell !== '') || rows.length === 0) rows.push(row);
  const [header = [], ...body] = rows;
  const headers = header.map((name) => name.trim());
  const seen = new Set();
  for (const name of headers) {
    if (!name || seen.has(name)) throw Object.assign(new Error('CSV header is empty or duplicated'), { code: 'CATALOG_CSV_HEADER_INVALID' });
    seen.add(name);
  }
  for (const cells of body) {
    if (cells.length > headers.length) throw Object.assign(new Error('CSV row has too many fields'), { code: 'CATALOG_CSV_MALFORMED' });
  }
  return body.filter((cells) => cells.some((cell) => cell !== '')).map((cells) => Object.fromEntries(
    headers.map((name, index) => [name, cells[index]?.trim() ?? '']),
  ));
}

function normalizeRawCatalog(input, format) {
  const rows = format === 'csv' ? parseCsv(input) : null;
  const raw = format === 'csv' ? { units: rows.length && rows.every((row) => row.units === 'mm') ? 'mm' : undefined, items: rows } : JSON.parse(input);
  return Array.isArray(raw) ? { items: raw } : raw;
}

function normalizeCommercial(raw, errors, path) {
  const price = raw.commercial?.price ?? {
    min: raw.priceMin === undefined ? undefined : Number(raw.priceMin),
    max: raw.priceMax === undefined ? undefined : Number(raw.priceMax),
    unit: raw.priceUnit,
    currency: raw.currency || 'CNY',
    source: raw.priceSource,
  };
  const leadTime = raw.commercial?.leadTime ?? {
    min: raw.leadTimeMin === undefined ? undefined : Number(raw.leadTimeMin),
    max: raw.leadTimeMax === undefined ? undefined : Number(raw.leadTimeMax),
    unit: raw.leadTimeUnit || 'day',
    source: raw.leadTimeSource,
  };
  for (const [name, value] of [['price', price], ['leadTime', leadTime]]) {
    if (!Number.isFinite(value.min) || !Number.isFinite(value.max) || value.min < 0 || value.max < value.min || !value.unit) {
      error(errors, 'CATALOG_COMMERCIAL_INVALID', `${path}.commercial.${name}`, `${name} range and unit are required.`);
    }
    if (!PROVENANCE_SOURCES.has(value.source)) {
      error(errors, 'CATALOG_PROVENANCE_INVALID', `${path}.commercial.${name}.source`, `${name} source must be demo, estimate, or enterprise.`);
    }
  }
  return { price, leadTime };
}

function normalizeList(value, errors, path, { required = false } = {}) {
  const items = Array.isArray(value) ? value : splitList(value);
  if (required && items.length === 0) error(errors, 'CATALOG_LIST_INVALID', path, 'at least one value is required.');
  return items.map((item, index) => {
    if (typeof item !== 'string') {
      error(errors, 'CATALOG_LIST_INVALID', `${path}[${index}]`, 'list values must be strings.');
      return item;
    }
    const trimmed = item.trim();
    if (!trimmed || trimmed.length > 128) error(errors, 'CATALOG_LIST_INVALID', `${path}[${index}]`, 'list values must be 1-128 characters.');
    return trimmed;
  });
}

function normalizeConstraints(value, errors, path) {
  if (empty(value)) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // handled below
    }
  }
  error(errors, 'CATALOG_CONSTRAINTS_INVALID', path, 'constraints must be an array or a CSV JSON array field.');
  return [];
}

function normalizeSceneReady(value, format, errors, path) {
  if (format === 'json') {
    if (typeof value === 'boolean') return value;
  } else if (value === 'true' || value === 'false') {
    return value === 'true';
  }
  error(errors, 'CATALOG_SCENE_READY_INVALID', path, 'sceneReady must be a JSON boolean or CSV true/false.');
  return false;
}

function normalizeOperation(raw, errors, path) {
  if (empty(raw.operation) && raw.operationType) {
    return { type: raw.operationType, materialId: raw.materialId };
  }
  return raw.operation;
}

function validateOperation(operation, errors, path) {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    error(errors, 'CATALOG_OPERATION_INVALID', path, 'scene-ready items require a valid operation.');
    return;
  }
  if (!OPERATION_TYPES.has(operation.type)) {
    error(errors, 'CATALOG_OPERATION_INVALID', `${path}.type`, 'operation type is not supported.');
  }
  if (operation.type === 'surface.setMaterial' && !operation.materialId) {
    error(errors, 'CATALOG_OPERATION_INVALID', `${path}.materialId`, 'surface.setMaterial requires materialId.');
  }
}

function normalizeItem(raw, index, errors, format) {
  const path = `items[${index}]`;
  const dimensions = raw.dimensions ?? Object.fromEntries(DIMENSIONS.map((key) => [key, raw[key] === undefined ? undefined : Number(raw[key])]));
  const operation = normalizeOperation(raw, errors, `${path}.operation`);
  const item = {
    id: String(raw.id ?? raw.moduleId ?? '').trim(),
    externalId: String(raw.externalId ?? raw.moduleId ?? raw.id ?? '').trim(),
    name: String(raw.name ?? '').trim(),
    kind: String(raw.kind ?? '').trim(),
    category: String(raw.category ?? '').trim(),
    appliesTo: normalizeList(raw.appliesTo, errors, `${path}.appliesTo`, { required: true }),
    tags: normalizeList(raw.tags, errors, `${path}.tags`),
    sceneReady: normalizeSceneReady(raw.sceneReady, format, errors, `${path}.sceneReady`),
    dimensions,
    commercial: normalizeCommercial(raw, errors, path),
    constraints: normalizeConstraints(raw.constraints, errors, `${path}.constraints`),
    compatibleWith: normalizeList(raw.compatibleWith, errors, `${path}.compatibleWith`),
    incompatibleWith: normalizeList(raw.incompatibleWith, errors, `${path}.incompatibleWith`),
    source: String(raw.source ?? '').trim(),
  };
  if (operation !== undefined) item.operation = operation;

  if (!STABLE_ID.test(item.id)) error(errors, 'CATALOG_ID_INVALID', `${path}.id`, 'Stable module id is required.');
  for (const key of ['externalId', 'name', 'kind', 'category']) {
    if (!item[key]) error(errors, 'CATALOG_FIELD_REQUIRED', `${path}.${key}`, `${key} is required.`);
  }
  if (!ITEM_SOURCES.has(item.source)) error(errors, 'CATALOG_SOURCE_INVALID', `${path}.source`, 'source must be demo or enterprise.');
  for (const key of DIMENSIONS) {
    if (!Number.isInteger(item.dimensions[key]) || item.dimensions[key] <= 0) {
      error(errors, 'CATALOG_DIMENSION_INVALID', `${path}.dimensions.${key}`, 'dimensions must be positive integer millimeters.');
    }
  }
  for (const [constraintIndex, constraint] of item.constraints.entries()) {
    if (!constraint?.code || !constraint?.message || !PROVENANCE_SOURCES.has(constraint.source)) {
      error(errors, 'CATALOG_CONSTRAINT_INVALID', `${path}.constraints[${constraintIndex}]`, 'constraint code, message, and source are required.');
    }
  }
  if (item.sceneReady) validateOperation(item.operation, errors, `${path}.operation`);
  if (!item.sceneReady && item.operation !== undefined) validateOperation(item.operation, errors, `${path}.operation`);
  return item;
}

export function importCatalogText(text, { format = 'json', id = 'catalog-imported-v1', name = 'Imported catalog' } = {}) {
  const errors = [];
  if (typeof text !== 'string' || text.length === 0) error(errors, 'CATALOG_INPUT_INVALID', '$', 'catalog text is required.');
  if (!['json', 'csv'].includes(format)) error(errors, 'CATALOG_FORMAT_INVALID', 'format', 'format must be json or csv.');
  if (errors.length) return { ok: false, errors };

  let raw;
  try {
    raw = normalizeRawCatalog(text, format);
  } catch (err) {
    return { ok: false, errors: [{ code: err.code ?? 'CATALOG_PARSE_FAILED', path: '$', message: 'catalog input could not be parsed.' }] };
  }

  const catalogId = String(raw.id ?? id).trim();
  const catalogName = String(raw.name ?? name).trim();
  if (!STABLE_ID.test(catalogId)) error(errors, 'CATALOG_ID_INVALID', 'id', 'stable catalog id is required.');
  if (!catalogName || catalogName.length > 128) error(errors, 'CATALOG_NAME_INVALID', 'name', 'catalog name is required.');
  if (raw.units !== 'mm') error(errors, 'CATALOG_UNITS_INVALID', 'units', 'catalog units must explicitly be mm.');
  if (!Array.isArray(raw.items) || raw.items.length === 0) error(errors, 'CATALOG_ITEMS_INVALID', 'items', 'catalog needs at least one item.');
  const items = (raw.items ?? []).map((item, index) => normalizeItem(item, index, errors, format));
  const ids = new Set();
  const externalIds = new Set();
  for (const [index, item] of items.entries()) {
    if (ids.has(item.id)) error(errors, 'CATALOG_ID_DUPLICATE', `items[${index}].id`, `duplicate id ${item.id}`);
    ids.add(item.id);
    if (externalIds.has(item.externalId)) error(errors, 'CATALOG_EXTERNAL_ID_DUPLICATE', `items[${index}].externalId`, `duplicate externalId ${item.externalId}`);
    externalIds.add(item.externalId);
  }
  for (const [index, item] of items.entries()) {
    const compatible = new Set(item.compatibleWith);
    for (const key of ['compatibleWith', 'incompatibleWith']) {
      for (const targetId of item[key]) {
        if (targetId === item.id || !ids.has(targetId)) error(errors, 'CATALOG_RELATION_INVALID', `items[${index}].${key}`, `${targetId} must reference another imported item.`);
      }
    }
    for (const targetId of item.incompatibleWith) {
      if (compatible.has(targetId)) error(errors, 'CATALOG_RELATION_CONTRADICTORY', `items[${index}].incompatibleWith`, `${targetId} cannot be both compatible and incompatible.`);
    }
  }
  const itemSources = [...new Set(items.map((item) => item.source))];
  const catalogSource = raw.source ?? (itemSources.length === 1 ? itemSources[0] : undefined);
  if (!ITEM_SOURCES.has(catalogSource)) error(errors, 'CATALOG_SOURCE_INVALID', 'source', 'catalog source must be demo or enterprise.');
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    catalog: {
      id: catalogId,
      name: catalogName,
      schemaVersion: 1,
      units: 'mm',
      source: catalogSource,
      items,
    },
  };
}

export function importCatalogFile(filePath, options) {
  return importCatalogText(readFileSync(filePath, 'utf8'), options);
}

export function createCatalogPlugin(catalog) {
  const validation = importCatalogText(JSON.stringify(catalog));
  if (!validation.ok) {
    const err = new Error('CATALOG_INVALID');
    err.errors = validation.errors;
    throw err;
  }
  const normalized = validation.catalog;
  const items = clone(normalized.items);
  const byId = new Map(items.map((item) => [item.id, item]));
  const describe = () => ({
    id: normalized.id,
    name: normalized.name,
    schemaVersion: normalized.schemaVersion,
    source: normalized.source,
    units: normalized.units,
    itemCount: items.length,
    categories: [...new Set(items.map((item) => item.category))].sort(),
    disclaimer: normalized.source === 'enterprise' ? '企业数据入口；未接真实报价/BOM前仍以字段 provenance 为准。' : '导入目录；以字段 provenance 为准。',
  });
  const optionalText = (value, name) => {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string' || value.length > 128) throw new Error(`CATALOG_${name.toUpperCase()}_INVALID`);
    return value.trim().toLowerCase();
  };
  return Object.freeze({
    describe,
    summary({ input = '' } = {}) {
      if (typeof input !== 'string' || input.length > 4000) throw new Error('CATALOG_INPUT_INVALID');
      return clone({ ...describe(), items: items.map(({ id, name, kind, category, appliesTo, sceneReady, constraints, source }) => ({
        id, name, kind, category, appliesTo, sceneReady,
        constraints: constraints.map(({ message }) => message),
        source,
      })) });
    },
    search({ query = '', category, kind, appliesTo, limit = 8 } = {}) {
      const normalizedQuery = optionalText(query, 'query');
      const normalizedCategory = optionalText(category, 'category');
      const normalizedKind = optionalText(kind, 'kind');
      const normalizedAppliesTo = optionalText(appliesTo, 'applies_to');
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('CATALOG_LIMIT_INVALID');
      const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
      return clone(items.filter((item) => {
        if (normalizedCategory && item.category.toLowerCase() !== normalizedCategory) return false;
        if (normalizedKind && item.kind.toLowerCase() !== normalizedKind) return false;
        if (normalizedAppliesTo && !item.appliesTo.some((value) => value.toLowerCase() === normalizedAppliesTo)) return false;
        const text = [item.id, item.externalId, item.name, item.kind, item.category, ...item.tags].join(' ').toLowerCase();
        return tokens.every((token) => text.includes(token));
      }).slice(0, limit));
    },
    get(itemId) {
      if (typeof itemId !== 'string' || itemId.length > 128) throw new Error('CATALOG_ITEM_ID_INVALID');
      const item = byId.get(itemId);
      return item ? clone(item) : null;
    },
  });
}
