// Presentation revisions of our own demo assets only. Imported/replaced GLBs
// retain their exact URLs and canonical identities, transforms and capabilities.
const revisedModels = new Set(['sofa','dining-table','dining-chair','coffee-table','lounge-chair','tv-console','double-bed','single-bed','wardrobe','desk','kitchen-counter','shoe-cabinet','floating-shelf','slat-partition','feature-wall']);
const fabModels = new Set(['sofa', 'dining-table', 'dining-chair', 'coffee-table', 'lounge-chair', 'double-bed', 'wardrobe', 'desk']);
export function isFabPresentation(src) {
  const match = /^\/assets\/models\/([a-z-]+)\.glb$/.exec(src ?? '');
  return !!match && fabModels.has(match[1]);
}
export function studioAssetSource(src) {
  if (isFabPresentation(src)) return src.replace('/models/', '/models/fab/');
  const match = /^\/assets\/models\/([a-z-]+)\.glb$/.exec(src ?? '');
  return match && revisedModels.has(match[1]) ? `/assets/models/studio/${match[1]}.glb` : src;
}
