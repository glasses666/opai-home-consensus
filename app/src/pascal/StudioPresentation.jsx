import { useEffect, useMemo, useRef } from 'react';
import { sceneRegistry } from '@pascal-app/core';
import { applyStudioFinish, disposeStudioFinishes } from './studio-finish.js';

// Host-owned presentation only: original models, IDs, bounding volumes and
// SceneCommand transforms stay under the existing Pascal/canonical bridge.
export default function StudioPresentation({ model, mapping }) {
  const owned = useRef(new Map());
  const finishes = useMemo(() => new Map(model.materials.map(material => [material.id, material])), [model.materials]);

  useEffect(() => () => disposeStudioFinishes(owned.current), []);

  useEffect(() => {
    const sync = () => {
      const active = new Set();
      for (const object of model.objects) {
        // Imported/replaced assets own their own material semantics.
        if (!/^\/assets\/models\/[a-z-]+\.glb$/.test(object.model3D?.src ?? '')) continue;
        const id = mapping.canonicalToPascal.object[object.id];
        const root = sceneRegistry.nodes.get(id);
        if (!root || !root.userData.itemModelSettled) continue;
        root.traverse(mesh => {
          if (!mesh.isMesh) return;
          active.add(mesh);
          applyStudioFinish(mesh, finishes.get(object.materialId), object.category, owned.current);
        });
      }
      // Replaced/deleted scene instances must not retain cloned materials.
      for (const [mesh, record] of owned.current) {
        if (active.has(mesh)) continue;
        if (mesh.material === record.material) mesh.material = record.original;
        for (const material of record.clones) material.dispose();
        owned.current.delete(mesh);
      }
    };
    sync();
    // The public editor suppresses viewerSceneSlot in resident browse mode.
    // Its public registry is available in both modes. A snapshot may replace
    // child materials while keeping the same root: resync at 4 Hz, not every
    // GPU frame, reusing clones while their input stays unchanged.
    const timer = window.setInterval(sync, 250);
    return () => window.clearInterval(timer);
  }, [model, mapping, finishes]);
  return null;
}
