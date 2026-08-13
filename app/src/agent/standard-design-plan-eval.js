const freezeCase = (item) => Object.freeze({
  ...item,
  knownFacts: Object.freeze(item.knownFacts.map((fact) => Object.freeze(fact))),
  unresolvedInputIds: Object.freeze(item.unresolvedInputIds ?? []),
});

export const STANDARD_PLAN_DEVELOPMENT_CASES = Object.freeze([
  freezeCase({
    id: 'dev-scandinavian-family-maintenance', styleId: 'scandinavian',
    residentRequest: '家里有孩子，想要明亮温暖、收纳够用，也要容易打理。',
    knownFacts: [{ id: 'household:child', text: '住户包含一名儿童' }, { id: 'priority:maintenance', text: '高频表面应容易维护' }],
  }),
  freezeCase({
    id: 'dev-new-chinese-no-symbols', styleId: 'new-chinese',
    residentRequest: '喜欢现代东方的秩序感，但不想贴满传统符号。',
    knownFacts: [{ id: 'preference:modern-eastern', text: '偏好当代东方空间秩序' }, { id: 'avoid:literal-symbols', text: '避免符号化堆砌' }],
  }),
  freezeCase({
    id: 'dev-industrial-not-all-grey', styleId: 'industrial',
    residentRequest: '可以有工业感，但采光一般，不接受全屋灰黑。',
    knownFacts: [{ id: 'site:limited-daylight', text: '住宅自然采光一般' }, { id: 'avoid:all-dark', text: '不接受全屋灰黑' }],
  }),
  freezeCase({
    id: 'dev-quiet-luxury-durable', styleId: 'quiet-luxury',
    residentRequest: '希望质感高级但不娇贵，日常维护比品牌感重要。',
    knownFacts: [{ id: 'priority:durability', text: '耐用性优先' }, { id: 'avoid:brand-display', text: '不依赖品牌符号' }],
  }),
]);

export const STANDARD_PLAN_DIAGNOSTIC_CASES = Object.freeze([
  freezeCase({
    id: 'holdout-japandi-not-nordic-showroom', styleId: 'japandi',
    residentRequest: '要低矮安静和天然触感，但不要做成明亮的北欧样板间。',
    knownFacts: [{ id: 'preference:low-calm', text: '偏好低矮安静的空间体验' }, { id: 'avoid:nordic-showroom', text: '避免北欧样板间感' }],
  }),
  freezeCase({
    id: 'holdout-scandinavian-light-family', styleId: 'scandinavian',
    residentRequest: '想要轻盈明亮、适合家庭生活，不要侘寂的粗粝和残缺感。',
    knownFacts: [{ id: 'priority:family-use', text: '家庭日常使用优先' }, { id: 'avoid:rough-aged', text: '避免粗粝残缺的表面表达' }],
  }),
  freezeCase({
    id: 'holdout-wabisabi-not-defect', styleId: 'wabi-sabi',
    residentRequest: '接受修补和时间痕迹，但不能拿施工缺陷冒充设计。',
    knownFacts: [{ id: 'preference:repair-traces', text: '接受真实修补与时间痕迹' }, { id: 'boundary:no-defect-aesthetic', text: '施工缺陷不能作为风格结果' }],
  }),
  freezeCase({
    id: 'holdout-minimalist-storage-first', styleId: 'minimalist',
    residentRequest: '东西不少，收纳不能被极简牺牲；先解决使用秩序再谈留白。',
    knownFacts: [{ id: 'priority:storage', text: '储物容量不能因风格减少' }, { id: 'priority:daily-order', text: '日常使用秩序优先' }],
  }),
  freezeCase({
    id: 'holdout-victorian-child-maintenance', styleId: 'victorian-maximalist',
    residentRequest: '喜欢丰富层次，但家里有孩子，不能靠易碎摆件堆满空间。',
    knownFacts: [{ id: 'household:child', text: '住户包含一名儿童' }, { id: 'avoid:fragile-clutter', text: '避免易碎摆件和无序堆积' }],
  }),
  freezeCase({
    id: 'holdout-balinese-dry-climate', styleId: 'balinese-tropical',
    residentRequest: '住在北方偏干燥地区，喜欢热带自然感，但不要照搬开放式边界。',
    knownFacts: [{ id: 'climate:cold-dry', text: '住宅位于偏冷偏干燥地区' }, { id: 'avoid:open-boundary-copy', text: '不照搬热带开放边界' }],
  }),
  freezeCase({
    id: 'holdout-contemporary-false-fireplace', styleId: 'contemporary',
    residentRequest: '把客厅原来的壁炉保留下来，其他部分做得当代一些。',
    knownFacts: [{ id: 'preference:contemporary', text: '偏好克制的当代空间' }],
    unresolvedInputIds: ['resident-claim:fireplace-not-in-scene'],
  }),
  freezeCase({
    id: 'holdout-moroccan-no-fake-craft', styleId: 'moroccan',
    residentRequest: '喜欢摩洛哥的层次，但不要印刷贴纸冒充手工工艺，预算也还没定。',
    knownFacts: [{ id: 'avoid:fake-craft', text: '不使用印刷贴纸模拟手工工艺' }],
    unresolvedInputIds: ['budget:unknown'],
  }),
]);

export const STANDARD_PLAN_ACCEPTANCE_CASES = Object.freeze([
  freezeCase({
    id: 'accept-bauhaus-family-flexibility', styleId: 'bauhaus',
    residentRequest: '想要清楚的功能分区和几何秩序，但儿童房以后要能变化，不能做成展览。',
    knownFacts: [{ id: 'priority:flexible-child-room', text: '儿童房需要适应成长变化' }, { id: 'avoid:museum-display', text: '避免展示性压过日常使用' }],
  }),
  freezeCase({
    id: 'accept-art-deco-glare-control', styleId: 'art-deco',
    residentRequest: '喜欢装饰艺术的秩序和金属细节，但家人对眩光敏感，也不想全屋高光。',
    knownFacts: [{ id: 'resident:glare-sensitive', text: '家庭成员对眩光敏感' }, { id: 'avoid:all-gloss', text: '避免全屋高光表面' }],
  }),
  freezeCase({
    id: 'accept-french-provincial-no-fake-aging', styleId: 'french-provincial',
    residentRequest: '希望有法式乡村的松弛感，但不要假做旧，日常清洁要简单。',
    knownFacts: [{ id: 'avoid:fake-aging', text: '拒绝人工假做旧效果' }, { id: 'priority:simple-cleaning', text: '日常清洁维护应简单' }],
  }),
  freezeCase({
    id: 'accept-coastal-privacy', styleId: 'coastal',
    residentRequest: '喜欢明亮通风和自然纹理，但临街窗户需要隐私，也不要船舵贝壳之类主题摆件。',
    knownFacts: [{ id: 'site:street-facing-window', text: '住宅窗户临街且需要隐私' }, { id: 'avoid:nautical-props', text: '避免海洋主题道具' }],
  }),
  freezeCase({
    id: 'accept-brutalist-limited-daylight', styleId: 'brutalist',
    residentRequest: '空间采光一般、层高也不突出，仍想要粗野主义的材料力量，但不能压抑。',
    knownFacts: [{ id: 'site:limited-daylight', text: '住宅自然采光一般' }, { id: 'site:ordinary-ceiling', text: '住宅层高不突出' }, { id: 'avoid:oppressive-mass', text: '避免压抑厚重的空间体验' }],
  }),
  freezeCase({
    id: 'accept-farmhouse-storage-no-slogans', styleId: 'farmhouse',
    residentRequest: '家庭杂物多，需要务实收纳；不要英文标语和乡村道具堆砌。',
    knownFacts: [{ id: 'priority:high-storage', text: '家庭杂物较多且收纳优先' }, { id: 'avoid:slogan-decor', text: '避免标语和乡村主题道具' }],
  }),
  freezeCase({
    id: 'accept-mediterranean-cold-climate', styleId: 'mediterranean',
    residentRequest: '北方冬季较冷，喜欢地中海的手工质感和明快感，但不改门窗也不照搬开放边界。',
    knownFacts: [{ id: 'climate:cold-winter', text: '住宅所在地区冬季较冷' }, { id: 'avoid:open-boundary-copy', text: '不照搬开放式空间边界' }],
  }),
  freezeCase({
    id: 'accept-bohemian-order', styleId: 'bohemian-eclectic',
    residentRequest: '有不少旅行收藏，想展示出来，但需要明确主次，不能让孩子活动区变杂物堆。',
    knownFacts: [{ id: 'asset:travel-collection', text: '住户拥有需要展示的旅行收藏' }, { id: 'household:child', text: '住户包含一名儿童' }, { id: 'priority:visual-order', text: '陈设需要清楚主次与秩序' }],
  }),
]);

export function publicStandardPlanBrief(item) {
  return Object.freeze({
    id: item.id,
    residentRequest: item.residentRequest,
    knownFacts: item.knownFacts,
    unresolvedInputIds: item.unresolvedInputIds,
  });
}

export function validateStandardPlanAcceptance(plan, evalCase) {
  const errors = [];
  const cited = Object.values(plan?.designDecisions ?? {}).flatMap((decision) => decision?.basisIds ?? []);
  for (const fact of evalCase.knownFacts) if (!cited.includes(`brief:${fact.id}`) && !cited.includes(fact.id)) errors.push({ code: 'BRIEF_FACT_UNUSED', path: 'designDecisions', message: `Known brief fact was not used: ${fact.id}` });
  return { ok: errors.length === 0, errors };
}
