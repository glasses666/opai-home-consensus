// Render-time derivatives only. Saved canonical scenes continue to reference
// their original PNGs; imported/custom artwork must retain its exact URL.
export const compactFurnitureNames = Object.freeze([
  'coffee-table-top', 'desk-top', 'dining-chair-top',
  'dining-table-original-top', 'dining-table-top', 'double-bed-top',
  'feature-wall-original-top', 'feature-wall-top', 'floating-shelf-top',
  'kitchen-counter-v2-top', 'lounge-chair-top', 'shoe-cabinet-top',
  'single-bed-top', 'slat-partition-top', 'sofa-top', 'tv-console-top',
  'wardrobe-v2-top',
]);
const names = new Set(compactFurnitureNames);

export function furniturePreviewSource(src) {
  const match = /^\/assets\/furniture\/([a-z0-9-]+)\.png$/.exec(src ?? '');
  return match && names.has(match[1]) ? `/assets/furniture/preview/${match[1]}.webp` : src;
}
