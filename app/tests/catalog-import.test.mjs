import assert from 'node:assert/strict';
import test from 'node:test';

import { createCatalogPlugin, importCatalogText } from '../src/catalog/import-catalog.js';

const validJson = JSON.stringify({
  id: 'enterprise-catalog-v1',
  name: 'Enterprise catalog v1',
  units: 'mm',
  items: [
    {
      id: 'ent-cabinet-001',
      externalId: 'OP-DEMO-001',
      name: 'Imported Cabinet',
      kind: 'built_in_component',
      category: 'cabinetry',
      appliesTo: ['floor', 'wall'],
      tags: ['cabinet'],
      sceneReady: false,
      dimensions: { width: 900, depth: 360, height: 2200 },
      commercial: {
        price: { min: 1000, max: 2000, unit: 'set', currency: 'CNY', source: 'estimate' },
        leadTime: { min: 10, max: 20, unit: 'day', source: 'estimate' },
      },
      constraints: [{ code: 'CHECK', message: 'review required', source: 'estimate' }],
      source: 'enterprise',
    },
    {
      id: 'ent-panel-001',
      externalId: 'OP-DEMO-002',
      name: 'Imported Panel',
      kind: 'wall_system',
      category: 'wall_finish',
      appliesTo: ['wall'],
      tags: ['panel'],
      sceneReady: true,
      operation: { type: 'surface.setMaterial', materialId: 'mat-imported-panel' },
      dimensions: { width: 1200, depth: 18, height: 2400 },
      compatibleWith: ['ent-cabinet-001'],
      commercial: {
        price: { min: 300, max: 500, unit: 'm2', currency: 'CNY', source: 'estimate' },
        leadTime: { min: 5, max: 8, unit: 'day', source: 'estimate' },
      },
      constraints: [],
      source: 'enterprise',
    },
  ],
});

test('catalog JSON import validates and creates a replaceable catalog plugin', () => {
  const imported = importCatalogText(validJson);
  assert.equal(imported.ok, true);
  const plugin = createCatalogPlugin(imported.catalog);
  assert.equal(plugin.describe().units, 'mm');
  assert.equal(plugin.search({ query: 'panel' })[0].id, 'ent-panel-001');
  assert.equal(plugin.get('ent-cabinet-001').commercial.price.source, 'estimate');
  assert.equal(plugin.get('ent-panel-001').operation.materialId, 'mat-imported-panel');
});

test('catalog CSV import maps flat enterprise fields', () => {
  const csv = [
    'units,id,externalId,name,kind,category,appliesTo,tags,sceneReady,width,depth,height,priceMin,priceMax,priceUnit,priceSource,leadTimeMin,leadTimeMax,leadTimeSource,constraints,source',
    'mm,ent-shelf-001,OP-DEMO-003,Imported Shelf,mounted_component,shelving,wall,shelf|storage,false,900,260,45,600,900,piece,estimate,7,14,estimate,"[{""code"":""CSV_CHECK"",""message"":""review CSV field"",""source"":""estimate""}]",enterprise',
  ].join('\n');
  const imported = importCatalogText(csv, { format: 'csv' });
  assert.equal(imported.ok, true);
  assert.equal(imported.catalog.items[0].dimensions.width, 900);
  assert.equal(imported.catalog.items[0].constraints[0].code, 'CSV_CHECK');
});

test('catalog import fails closed with structured errors and no catalog', () => {
  const invalid = JSON.stringify({
    units: 'cm',
    items: [{
      id: 'bad id',
      name: 'Bad',
      kind: 'x',
      category: 'x',
      appliesTo: [],
      dimensions: { width: 1, depth: 2, height: 3 },
      commercial: { price: { min: 1, max: 2, unit: 'set' }, leadTime: { min: 1, max: 2, unit: 'day', source: 'estimate' } },
      source: 'enterprise',
    }],
  });
  const imported = importCatalogText(invalid);
  assert.equal(imported.ok, false);
  assert.equal(imported.catalog, undefined);
  assert.equal(imported.errors.some((err) => err.code === 'CATALOG_UNITS_INVALID'), true);
  assert.equal(imported.errors.some((err) => err.code === 'CATALOG_ID_INVALID'), true);
  assert.equal(imported.errors.some((err) => err.code === 'CATALOG_PROVENANCE_INVALID'), true);
});

test('catalog import requires explicit millimeter units for JSON and CSV', () => {
  assert.equal(importCatalogText(JSON.stringify({ items: [] })).errors.some((err) => err.code === 'CATALOG_UNITS_INVALID'), true);
  const imported = importCatalogText([
    'id,externalId,name,kind,category,appliesTo,tags,sceneReady,width,depth,height,priceMin,priceMax,priceUnit,priceSource,leadTimeMin,leadTimeMax,leadTimeSource,source',
    'ent-shelf-001,OP-DEMO-003,Imported Shelf,mounted_component,shelving,wall,shelf,false,900,260,45,600,900,piece,estimate,7,14,estimate,enterprise',
  ].join('\n'), { format: 'csv' });
  assert.equal(imported.ok, false);
  assert.equal(imported.errors.some((err) => err.code === 'CATALOG_UNITS_INVALID'), true);
});

test('catalog CSV import rejects malformed quotes and duplicate or empty headers', () => {
  for (const csv of [
    'units,id,name\n"mm,ent-shelf-001,Broken',
    'units,id,id\nmm,one,two',
    'units,,id\nmm,x,y',
  ]) {
    const imported = importCatalogText(csv, { format: 'csv' });
    assert.equal(imported.ok, false);
    assert.equal(imported.errors.some((err) => ['CATALOG_CSV_MALFORMED', 'CATALOG_CSV_HEADER_INVALID'].includes(err.code)), true);
  }
});

test('catalog import keeps item source separate from commercial provenance', () => {
  const invalid = JSON.parse(validJson);
  invalid.items[0].source = 'estimate';
  invalid.items[0].commercial.price.source = 'estimate';
  const imported = importCatalogText(JSON.stringify(invalid));
  assert.equal(imported.ok, false);
  assert.equal(imported.errors.some((err) => err.code === 'CATALOG_SOURCE_INVALID' && err.path === 'items[0].source'), true);
});

test('catalog import rejects contradictory and dangling compatibility references', () => {
  const invalid = JSON.parse(validJson);
  invalid.items[1].compatibleWith = ['ent-cabinet-001', 'missing-id'];
  invalid.items[1].incompatibleWith = ['ent-cabinet-001', 'ent-panel-001'];
  const imported = importCatalogText(JSON.stringify(invalid));
  assert.equal(imported.ok, false);
  assert.equal(imported.errors.some((err) => err.code === 'CATALOG_RELATION_CONTRADICTORY'), true);
  assert.equal(imported.errors.some((err) => err.code === 'CATALOG_RELATION_INVALID'), true);
});

test('catalog import fails closed when scene-ready operation is absent or invalid', () => {
  const missing = JSON.parse(validJson);
  delete missing.items[1].operation;
  assert.equal(importCatalogText(JSON.stringify(missing)).errors.some((err) => err.code === 'CATALOG_OPERATION_INVALID'), true);

  const invalid = JSON.parse(validJson);
  invalid.items[1].operation = { type: 'object.create' };
  assert.equal(importCatalogText(JSON.stringify(invalid)).errors.some((err) => err.code === 'CATALOG_OPERATION_INVALID'), true);
});

test('created catalog plugin validates inputs and returns clones', () => {
  const plugin = createCatalogPlugin(importCatalogText(validJson).catalog);
  const summary = plugin.summary();
  summary.items[0].appliesTo.push('mutated');
  assert.equal(plugin.summary().items[0].appliesTo.includes('mutated'), false);

  const item = plugin.get('ent-panel-001');
  item.operation.materialId = 'mutated';
  assert.equal(plugin.get('ent-panel-001').operation.materialId, 'mat-imported-panel');

  assert.throws(() => plugin.search({ query: 1 }), /CATALOG_QUERY_INVALID/);
  assert.throws(() => plugin.get(1), /CATALOG_ITEM_ID_INVALID/);
  assert.throws(() => createCatalogPlugin({ ...importCatalogText(validJson).catalog, units: 'cm' }), /CATALOG_INVALID/);
});

test('catalog import rejects unsafe list contents', () => {
  const invalid = JSON.parse(validJson);
  invalid.items[0].appliesTo = ['floor', ''];
  invalid.items[0].tags = ['cabinet', 1];
  invalid.items[1].compatibleWith = ['ent-cabinet-001', 'x'.repeat(129)];
  invalid.items[1].incompatibleWith = [null];
  const imported = importCatalogText(JSON.stringify(invalid));
  assert.equal(imported.ok, false);
  assert.equal(imported.errors.filter((err) => err.code === 'CATALOG_LIST_INVALID').length >= 4, true);
});

test('catalog import requires explicit sceneReady boolean or CSV true false', () => {
  const json = JSON.parse(validJson);
  json.items[0].sceneReady = 'false';
  assert.equal(importCatalogText(JSON.stringify(json)).errors.some((err) => err.code === 'CATALOG_SCENE_READY_INVALID'), true);

  const csv = [
    'units,id,externalId,name,kind,category,appliesTo,tags,sceneReady,width,depth,height,priceMin,priceMax,priceUnit,priceSource,leadTimeMin,leadTimeMax,leadTimeSource,source',
    'mm,ent-shelf-001,OP-DEMO-003,Imported Shelf,mounted_component,shelving,wall,shelf,yes,900,260,45,600,900,piece,estimate,7,14,estimate,enterprise',
  ].join('\n');
  assert.equal(importCatalogText(csv, { format: 'csv' }).errors.some((err) => err.code === 'CATALOG_SCENE_READY_INVALID'), true);
});

test('catalog import rejects non-array constraints unless CSV field is a JSON array', () => {
  const invalid = JSON.parse(validJson);
  invalid.items[0].constraints = { code: 'NOPE', message: 'object is not an array', source: 'estimate' };
  const imported = importCatalogText(JSON.stringify(invalid));
  assert.equal(imported.ok, false);
  assert.equal(imported.errors.some((err) => err.code === 'CATALOG_CONSTRAINTS_INVALID'), true);
});

test('catalog import rejects duplicate external ids and unstable catalog identity', () => {
  const duplicate = JSON.parse(validJson);
  duplicate.items[1].externalId = duplicate.items[0].externalId;
  assert.equal(importCatalogText(JSON.stringify(duplicate)).errors.some((err) => err.code === 'CATALOG_EXTERNAL_ID_DUPLICATE'), true);

  const unstable = JSON.parse(validJson);
  unstable.id = 'bad id';
  unstable.name = '';
  const imported = importCatalogText(JSON.stringify(unstable));
  assert.equal(imported.ok, false);
  assert.equal(imported.errors.some((err) => err.code === 'CATALOG_ID_INVALID' && err.path === 'id'), true);
  assert.equal(imported.errors.some((err) => err.code === 'CATALOG_NAME_INVALID'), true);
});
