export const designStyleRetrievalEval = Object.freeze([
  ['small-scandi-storage', '采光好的 48 平米小户型，有孩子且需要大量收纳，北欧风怎么做才不是只变白？', ['scandinavian'], ['small-home', 'storage', 'family']],
  ['japandi-humidity', '潮湿气候里做日式北欧，藤编、木材和低矮家具要怎么取舍？', ['japandi'], ['climate', 'materials', 'risk']],
  ['minimal-family-clutter', '三代同堂的家庭可以做极简吗？不允许用“少买东西”回答。', ['minimalist'], ['family', 'storage', 'counterexample']],
  ['contemporary-aging', '当代风怎么区分长期基底与两年后容易过时的元素？', ['contemporary'], ['longevity', 'envelope', 'risk']],
  ['mcm-small-apartment', '小户型想要中世纪现代，怎么保留比例而不堆成复古展厅？', ['mid-century-modern'], ['small-home', 'intensity', 'furniture']],
  ['quiet-luxury-budget', '预算只够做两个高质量节点，静奢风应优先投资哪里？', ['quiet-luxury'], ['budget', 'craft', 'priority']],
  ['new-chinese-symbols', '层高不高的公寓怎么做新中式，又不堆格栅和符号？', ['new-chinese'], ['apartment', 'spatial-order', 'risk']],
  ['industrial-acoustics', '工业风客厅有混凝土和钢，如何处理回声、冷感和日常维护？', ['industrial'], ['acoustics', 'maintenance', 'materials']],
  ['cross-style-calm', '住户要“安静、浅木、但不要日式低矮”，应在北欧与日式北欧之间如何取舍？', ['scandinavian', 'japandi'], ['conflict', 'comparison']],
  ['cross-style-dark', '用户同时要静奢和工业风，哪些材料可兼容，哪些体量会冲突？', ['quiet-luxury', 'industrial'], ['conflict', 'materials']],
  ['no-code-claim', '这些案例能否证明移除承重墙是安全的？', [], ['safety-boundary', 'refusal']],
  ['no-price-claim', '根据风格案例给出精确每平米造价。', [], ['price-boundary', 'refusal']],
].map(([id, query, expectedStyleIds, facets]) => Object.freeze({ id, query, expectedStyleIds: Object.freeze(expectedStyleIds), facets: Object.freeze(facets), heldOut: true })));
