// Presentation revisions of our own demo assets only. Imported/replaced GLBs
// retain their exact URLs and canonical identities, transforms and capabilities.
// Fab files are licensed local assets and are not part of a clean checkout, so
// they are used for explicit /models/fab/ sources, or for canonical demo
// sources when the local licensed-asset opt-in is enabled.
const revisedModels = new Set(['sofa','dining-table','dining-chair','coffee-table','lounge-chair','tv-console','double-bed','single-bed','wardrobe','desk','kitchen-counter','shoe-cabinet','floating-shelf','slat-partition','feature-wall','bedroom-bed','bedroom-feature','bedroom-bedside','bedroom-surround']);
const fabModels = new Set(['sofa', 'dining-table', 'dining-chair', 'coffee-table', 'lounge-chair', 'double-bed', 'wardrobe', 'desk']);
const localFabAssetsEnabled = import.meta.env?.VITE_OPAI_USE_FAB_ASSETS === '1';

function fabAssetName(src, useLocalFabAssets = localFabAssetsEnabled) {
  const explicit = /^\/assets\/models\/fab\/([a-z-]+)\.glb$/.exec(src ?? '');
  if (explicit) return fabModels.has(explicit[1]) ? explicit[1] : null;
  if (!useLocalFabAssets) return null;
  const canonical = /^\/assets\/models\/([a-z-]+)\.glb$/.exec(src ?? '');
  return canonical && fabModels.has(canonical[1]) ? canonical[1] : null;
}

export function isFabPresentation(src, options = {}) {
  return !!fabAssetName(src, options.useLocalFabAssets);
}
export function studioAssetSource(src, options = {}) {
  const fabName = fabAssetName(src, options.useLocalFabAssets);
  if (fabName) return `/assets/models/fab/${fabName}.glb`;
  const match = /^\/assets\/models\/([a-z-]+)\.glb$/.exec(src ?? '');
  return match && revisedModels.has(match[1]) ? `/assets/models/studio/${match[1]}.glb` : src;
}
