import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const root = new URL('../../', import.meta.url);
const sources = { living: 'stone-v2', growing: 'growing-local', together: 'together-local' };

test('Three roomlet assets preserve every approved mesh, texture, node and sampled motion', async () => {
  let totalBytes = 0;
  for (const [name, folder] of Object.entries(sources)) {
    const source = await readFile(new URL(`design-lab/roomlet-${folder}/src/scene-data.js`, root), 'utf8');
    const original = JSON.parse(source.slice(source.indexOf('window.SCULPT_SCENE=') + 'window.SCULPT_SCENE='.length).trim().replace(/;$/, ''));
    const compressed = await readFile(new URL(`app/public/assets/rooms/runtime-v1/${name}.bin`, root));
    totalBytes += compressed.length;
    const data = JSON.parse(gunzipSync(compressed));
    assert.deepEqual(data, original, `${name}: original data must not be simplified or silently changed`);
    const names = new Set(data.nodes.map(node => node.name));
    assert.equal(names.size, data.nodes.length, 'Three animation bindings require unique names');
    for (const track of data.motion.tracks) {
      assert.ok(names.has(track.name));
      const buffer = Buffer.from(track.positions, 'base64');
      const positions = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
      assert.equal(track.rotations.length > 0, true);
      // The final approved bedroom keeps every large item, including the lamp
      // cabinet, grounded. Moving small objects in other rooms leave the frame.
      if (name === 'together') for (let i = 1; i < positions.length; i += 3) assert.ok(Math.abs(positions[i] - 0.08) < 0.00001);
      const last = positions.length - 3;
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(positions[i] - positions[last + i]) < 0.00001, `${track.name}: seamless loop`);
    }
  }
  assert.ok(totalBytes < 1_500_000, `All three scene payloads must stay below 1.5 MB, found ${totalBytes}`);
});

test('Roomlet adapter defers Three and retains a non-blocking static fallback', async () => {
  const component = await readFile(new URL('app/src/RoomletStoryMedia.jsx', root), 'utf8');
  assert.ok(component.includes("await import('./roomlet-runtime.mjs')"));
  assert.ok(component.includes('IntersectionObserver'));
  assert.ok(component.includes('visibilitychange'));
  assert.ok(component.includes('15000'));
  assert.ok(component.includes('重试动态预览'));
  assert.ok(!component.includes('<video'));
});
