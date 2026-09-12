import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { studioAssetSource } from '../src/pascal/studio-assets.js';

test('studio revises local demo models, never user imports or older layout variants', () => {
  assert.equal(studioAssetSource('/assets/models/sofa.glb'), '/assets/models/studio/sofa.glb');
  assert.equal(studioAssetSource('/assets/models/fab/sofa.glb'), '/assets/models/fab/sofa.glb');
  assert.equal(studioAssetSource('/assets/models/bedroom-bed.glb'), '/assets/models/studio/bedroom-bed.glb');
  assert.equal(studioAssetSource('/assets/models/bedroom-feature.glb'), '/assets/models/studio/bedroom-feature.glb');
  assert.equal(studioAssetSource('/assets/models/bedroom-bedside.glb'), '/assets/models/studio/bedroom-bedside.glb');
  for (const src of ['https://example.com/sofa.glb', '/uploads/sofa.glb', '/assets/models/double-bed-original.glb', '/assets/models/sofa.glb?custom=1', undefined]) assert.equal(studioAssetSource(src), src);
});
test('licensed local Fab assets are opt-in while clean checkouts keep studio fallbacks', () => {
  assert.equal(studioAssetSource('/assets/models/dining-table.glb', { useLocalFabAssets: true }), '/assets/models/fab/dining-table.glb');
  assert.equal(studioAssetSource('/assets/models/dining-chair.glb', { useLocalFabAssets: true }), '/assets/models/fab/dining-chair.glb');
  assert.equal(studioAssetSource('/assets/models/tv-console.glb', { useLocalFabAssets: true }), '/assets/models/studio/tv-console.glb');
});
test('studio GLBs contain valid embedded geometry and textures, with no remote dependencies', () => {
  const root = new URL('../public/assets/models/studio/', import.meta.url);
  for (const file of readdirSync(root).filter(file => file.endsWith('.glb'))) {
    const data = readFileSync(new URL(file, root));
    assert.equal(data.toString('ascii',0,4), 'glTF', file);
    assert.equal(data.readUInt32LE(4), 2, file);
    assert.equal(data.readUInt32LE(8), data.length, file);
    assert.equal(data.readUInt32LE(16), 0x4e4f534a, file);
    const json = JSON.parse(data.toString('utf8',20,20+data.readUInt32LE(12)));
    assert.ok(json.nodes.length && json.meshes.length, file);
    assert.ok(json.images?.length, `${file}: packed material textures`);
    for (const image of json.images) assert.ok(Number.isInteger(image.bufferView) && !image.uri, file);
    for (const buffer of json.buffers) assert.ok(!buffer.uri, file);
    for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
      assert.ok(Number.isInteger(primitive.attributes.POSITION), file);
      assert.ok(Number.isInteger(primitive.attributes.NORMAL), file);
      if (json.materials[primitive.material]?.pbrMetallicRoughness?.baseColorTexture) {
        assert.ok(Number.isInteger(primitive.attributes.TEXCOORD_0), `${file}: textured geometry needs UVs`);
      }
    }
  }
});
test('every studio model has a real local payload', () => {
  assert.ok(existsSync(new URL('../public/assets/models/studio/bedroom-bedside.glb',import.meta.url)));
  for (const name of ['sofa','dining-table','dining-chair','coffee-table','lounge-chair','tv-console','double-bed','single-bed','wardrobe','desk','kitchen-counter','shoe-cabinet','floating-shelf','slat-partition','feature-wall']) {
    assert.ok(existsSync(new URL(`../public${studioAssetSource(`/assets/models/${name}.glb`)}`, import.meta.url)),name);
  }
});
