export const MINIMUM_GENERATION_MS = 10_000;

export const remainingGenerationDelay = (startedAt, now = Date.now()) => Math.max(0, MINIMUM_GENERATION_MS - (now - startedAt));

export const generationProgressAt = (elapsedMs) => {
  const ratio = Math.max(0, Math.min(1, elapsedMs / MINIMUM_GENERATION_MS));
  return Math.round(8 + 91 * (1 - (1 - ratio) ** 2));
};
