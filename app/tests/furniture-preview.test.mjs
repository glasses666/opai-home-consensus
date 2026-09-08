import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { compactFurnitureNames, furniturePreviewSource } from '../src/pascal/furniture-preview.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { projectScene2D } from '../src/domain/projection.js';
import { projectOppeinSceneToPascal } from '../src/pascal/oppein-to-pascal.js';

test('all local furniture previews are valid WebP payloads within a 750 KB total budget', () => {
  let bytes = 0;
  for (const name of compactFurnitureNames) {
    const src = `/assets/furniture/${name}.png`;
    const file = new URL(`../public${furniturePreviewSource(src)}`, import.meta.url);
    const data = readFileSync(file);
    assert.equal(data.toString('ascii', 0, 4), 'RIFF', name);
    assert.equal(data.toString('ascii', 8, 12), 'WEBP', name);
    assert.equal(data.readUInt32LE(4) + 8, data.length, name);
    assert.equal(data.toString('ascii', 12, 16), 'VP8X', `${name}: extended alpha format`);
    assert.ok(data[20] & 0x10, `${name}: transparent background retained`);
    assert.ok(data.readUIntLE(24, 3) + 1 <= 512, `${name}: width budget`);
    assert.ok(data.readUIntLE(27, 3) + 1 <= 512, `${name}: height budget`);
    assert.ok(statSync(new URL(`../public${src}`, import.meta.url)).size > 0, `${name}: original retained`);
    bytes += data.length;
  }
  assert.ok(bytes < 750_000, `all previews: ${bytes} bytes`);
});

test('preview resolution never rewrites imported, custom or signed image URLs', () => {
  for (const src of [undefined, '/uploads/sofa-top.png', 'https://example.com/assets/furniture/sofa-top.png', '/assets/furniture/sofa-top.png?custom=1', '/assets/furniture/unknown-top.png']) {
    assert.equal(furniturePreviewSource(src), src);
  }
});

test('default and saved scenes resolve compact media without mutating source or footprint', () => {
  const scene = JSON.parse(JSON.stringify(createDemoScene()));
  const before = JSON.stringify(scene);
  const projection = projectScene2D(scene);
  const pascal = projectOppeinSceneToPascal(scene);
  for (const object of scene.objects) {
    const asset = projection.layers.media.assets.find(candidate => candidate.sourceObjectId === object.id);
    assert.equal(asset.src, object.media2D.src);
    assert.equal(asset.previewSrc, furniturePreviewSource(object.media2D.src));
    assert.ok(asset.previewSrc.endsWith('.webp'));
    assert.equal(asset.width, object.dimensions.width);
    const node = pascal.sceneGraph.nodes[pascal.mapping.canonicalToPascal.object[object.id]];
    assert.equal(node.asset.thumbnail, asset.previewSrc);
    assert.equal(node.asset.floorPlanUrl, asset.previewSrc);
  }
  assert.equal(JSON.stringify(scene), before);
});
