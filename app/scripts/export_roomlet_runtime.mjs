// Deterministic transport packaging: original geometry and choreography remain unchanged.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const root = new URL('../../', import.meta.url);
const target = new URL('app/public/assets/rooms/runtime-v1/', root);
const sources = { living: 'stone-v2', growing: 'growing-local', together: 'together-local' };
await mkdir(target, { recursive: true });
for (const [name, folder] of Object.entries(sources)) {
  const source = await readFile(new URL(`design-lab/roomlet-${folder}/src/scene-data.js`, root), 'utf8');
  const start = source.indexOf('window.SCULPT_SCENE=');
  if (start < 0) throw new Error(`Missing roomlet scene: ${name}`);
  const data = JSON.parse(source.slice(start + 'window.SCULPT_SCENE='.length).trim().replace(/;$/, ''));
  const bytes = gzipSync(JSON.stringify(data), { level: 9 });
  // .bin avoids servers/CDNs treating .gz as an already encoded HTTP response.
  await writeFile(new URL(`${name}.bin`, target), bytes);
  console.log(`${name}: ${bytes.length} bytes; ${data.geometries.length} original meshes, ${data.motion.tracks.length} motion tracks`);
}
