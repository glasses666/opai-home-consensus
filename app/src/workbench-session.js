import { undoSceneCommand } from './domain/scene.js';

// A proposal starts after the user's current draft. Never roll back to the
// saved version: that would discard retained or manual unsaved changes.
export function retractUnretainedPreview(store, review) {
  if (!review) return store;
  let next = store;
  const target = Math.max(0, Math.min(review.startCursor ?? next.cursor - 1, next.cursor));
  while (next.cursor > target) next = undoSceneCommand(next);
  return next;
}
