export const DEFAULT_EXPERIENCE_STYLE = 'calm-catalog';

export const EXPERIENCE_STYLES = [
  {
    id: 'calm-catalog',
    name: '静谧目录',
    label: '静谧目录',
    headline: '安静、克制、像一本可翻的住宅目录。',
    summary: '留白更大，材质更稳，信息只在需要时出现。适合先让住户看懂 Agent 的判断，再进入微调。',
    motion: '低动效 · 适合稳定首屏',
    reference: 'Vitra configurator / 欧美家居目录',
    accent: 'calm',
  },
  {
    id: 'spatial-cinema',
    name: '空间电影',
    label: '空间电影',
    headline: '把 3D 舞台当主角，镜头像在引导一次进入房间。',
    summary: '深色外壳、连续转场、轻景深层次。适合做“点房间 → 飞到俯视 → 继续看”的主体验。',
    motion: '动态 · 镜头与光带',
    reference: 'Smart / BMW 3D configurator',
    accent: 'cinema',
  },
  {
    id: 'agent-canvas',
    name: '智能画布',
    label: '智能画布',
    headline: 'Agent、预览和编辑结果共处同一张工作台。',
    summary: '适合一边看方案，一边理解 Agent 为什么这么改；对话和场景都要可见，用户编辑只做辅助。',
    motion: '动态 · 状态反馈',
    reference: 'Ruumix / dMaya',
    accent: 'canvas',
  },
  {
    id: 'architect-index',
    name: '建筑索引',
    label: '建筑索引',
    headline: '像建筑作品集一样清楚地告诉人现在在哪一层。',
    summary: '纵向 / 横向索引、位置反馈和渐进揭示更强。适合导航页与比较页，不让滚动劫持用户。',
    motion: '动态 · 索引与位置感',
    reference: 'Garonzi / Mobius',
    accent: 'index',
  },
];

export const EXPERIENCE_STYLE_BY_ID = Object.fromEntries(EXPERIENCE_STYLES.map((style) => [style.id, style]));

export function normalizeExperienceStyle(value) {
  return typeof value === 'string' && EXPERIENCE_STYLE_BY_ID[value] ? value : null;
}

export function resolveExperienceStyle(search, fallback) {
  const params = new URLSearchParams(search ?? '');
  return normalizeExperienceStyle(params.get('style') ?? fallback) ?? DEFAULT_EXPERIENCE_STYLE;
}

export function withExperienceStyle(query, styleId) {
  const normalized = normalizeExperienceStyle(styleId);
  if (!normalized) return query;
  const params = new URLSearchParams(query ?? '');
  params.set('style', normalized);
  const nextQuery = params.toString();
  return nextQuery ? `?${nextQuery}` : '';
}

export function experienceStyleHref(styleId, pathname = '/project/demo') {
  const normalized = normalizeExperienceStyle(styleId);
  return normalized ? `${pathname}?style=${encodeURIComponent(normalized)}` : pathname;
}
