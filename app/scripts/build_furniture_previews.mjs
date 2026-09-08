import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compactFurnitureNames } from '../src/pascal/furniture-preview.js';

const root = new URL('../public/assets/furniture/', import.meta.url);
mkdirSync(new URL('preview/', root), { recursive: true });
let sourceBytes = 0;
let previewBytes = 0;
for (const name of compactFurnitureNames) {
  const input = fileURLToPath(new URL(`${name}.png`, root));
  const output = fileURLToPath(new URL(`preview/${name}.webp`, root));
  const png = readFileSync(input);
  if (png.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${name}`);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const scale = Math.min(1, 512 / Math.max(width, height));
  const result = spawnSync('cwebp', ['-quiet', '-q', '82', '-alpha_q', '100', '-m', '6', '-sharp_yuv', '-metadata', 'none',
    '-resize', String(Math.max(1, Math.round(width * scale))), String(Math.max(1, Math.round(height * scale))), input, '-o', output], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`cwebp failed for ${name}: ${result.stderr || result.error?.message}`);
  sourceBytes += png.length;
  previewBytes += statSync(output).size;
}
console.log(JSON.stringify({ count: compactFurnitureNames.length, sourceBytes, previewBytes, maximumEdge: 512, quality: 82, alphaQuality: 100 }));
