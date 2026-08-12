import { designStyleCases } from './design-style-cases.js';

const STYLE_ALIASES = Object.freeze({
  scandinavian: ['北欧', 'scandinavian', 'nordic', '浅木', '自然光'],
  japandi: ['日式北欧', 'japandi', '日式', '低矮', '侘寂', '藤编'],
  minimalist: ['极简', 'minimalist', 'minimalism', '留白', '隐藏收纳'],
  contemporary: ['当代', 'contemporary', '现代混搭', '长期基底', '过时'],
  'mid-century-modern': ['中世纪', '复古', 'mid-century', 'mid century', '胡桃木'],
  'quiet-luxury': ['静奢', 'quiet luxury', '高级', '精细收口', '对缝'],
  'new-chinese': ['新中式', 'new chinese', '东方', '格栅', '框景'],
  industrial: ['工业风', 'industrial', 'loft', '混凝土', '钢', '裸露结构'],
});

const FACETS = Object.freeze({
  'small-home': ['小户型', '小空间', '小公寓', 'compact', 'small', '48 平', '48平'],
  family: ['家庭', '孩子', '三代', '同堂', '亲子', 'family', 'children'],
  storage: ['收纳', '柜', '藏书', 'storage', 'cabinet', 'library'],
  climate: ['潮湿', '气候', '炎热', '寒冷', '通风', '遮阳', 'climate', 'humid', 'coastal'],
  budget: ['预算', '造价', '便宜', '投资', '成本', 'budget', 'cost', 'affordable'],
  materials: ['材料', '木材', '藤编', '石材', '混凝土', '钢', '织物', 'material'],
  maintenance: ['维护', '耐用', '清洁', '回声', '声学', 'maintenance', 'acoustic'],
  risk: ['不适合', '问题', '风险', '冲突', '过时', '取舍', '不要', 'risk'],
  lighting: ['采光', '灯光', '自然光', '眩光', 'lighting', 'daylight'],
  envelope: ['墙', '地面', '顶面', '壳体', '界面', '格栅', 'envelope', 'wall', 'floor'],
  furniture: ['家具', '沙发', '床', '桌', '体量', '低矮', 'furniture'],
  counterexample: ['不允许', '不能只', '不要只'],
  longevity: ['长期', '过时', '耐看'],
  intensity: ['比例', '堆成', '符号堆叠'],
  craft: ['高质量', '工艺', '节点'],
  priority: ['优先', '投资'],
  apartment: ['公寓', '层高'],
  'spatial-order': ['层高', '格栅', '符号'],
  acoustics: ['回声', '声学'],
  conflict: ['取舍', '冲突', '兼容', '同时要'],
  comparison: ['之间', '对比', '取舍'],
});

const BLOCKED = Object.freeze([
  { id: 'structural-safety', patterns: [/承重墙/, /结构.{0,6}(安全|拆|移除)/], reason: '风格案例不能证明结构改造安全，需要户型结构资料和有资质的工程复核。' },
  { id: 'exact-price', patterns: [/精确.{0,8}(报价|造价|价格)/, /每(平|平方|㎡).{0,8}(报价|造价|多少钱|价格)/], reason: '参考案例没有可核实的欧派报价、BOM 和工期数据，不能给出精确商业报价。' },
]);

const normalize = (value) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ').trim();
const contains = (text, phrase) => text.includes(normalize(phrase));
const unique = (values) => [...new Set(values)];
const STYLE_RESEARCH_INTENT = /(风格|氛围|气质|搭配|材料|墙面|地面|顶面|灯光|色彩|家装|装修|收纳|户型|层高|预算|维护|回声|采光|格栅|混凝土|胡桃木|藤编|北欧|日式|极简|当代|中世纪|静奢|新中式|工业风|scandinavian|japandi|minimal|contemporary|industrial|mid.?century|quiet luxury)/i;

export const shouldRetrieveStyleCases = (input) => STYLE_RESEARCH_INTENT.test(String(input ?? ''));

function detect(text, vocabulary) {
  return Object.fromEntries(Object.entries(vocabulary).map(([id, aliases]) => [id, aliases.filter((alias) => contains(text, alias))]).filter(([, hits]) => hits.length));
}

function disambiguateStyles(text, detected) {
  const result = { ...detected };
  const comparesNordic = /北欧.*(?:与|和|对比|取舍|之间).*日式北欧|日式北欧.*(?:与|和|对比|取舍|之间).*北欧/.test(text);
  if (result.japandi && result.scandinavian && !comparesNordic) delete result.scandinavian;
  return result;
}

function corpusText(item) {
  return normalize([
    item.title, item.geography, item.dwellingType, item.household,
    ...item.rooms, ...item.constraints, ...item.designMoves, ...item.envelope,
    ...item.furniture, ...item.lighting, ...item.applicability, ...item.risks,
  ].join(' '));
}

function scoreCase(item, query, styleHits, facetHits) {
  const text = corpusText(item);
  let score = 0;
  const reasons = [];
  if (styleHits[item.styleId]) {
    score += 12 + Math.min(4, styleHits[item.styleId].length);
    reasons.push(`风格:${item.styleId}`);
  }
  for (const [facet, hits] of Object.entries(facetHits)) {
    const matched = hits.some((hit) => contains(text, hit));
    if (matched) {
      score += facet === 'risk' ? 4 : 3;
      reasons.push(`条件:${facet}`);
    }
  }
  const terms = unique(query.split(' ').filter((term) => term.length >= 2));
  const lexicalHits = terms.filter((term) => text.includes(term)).slice(0, 5);
  score += lexicalHits.length;
  if (lexicalHits.length) reasons.push(`文本:${lexicalHits.join('/')}`);
  if (!Object.keys(styleHits).length && Object.keys(facetHits).length && reasons.some((reason) => reason.startsWith('条件:'))) score += 1;
  return { item, score, reasons };
}

function rerank(scored, expectedStyles, limit) {
  const result = [];
  const usedCases = new Set();
  for (const styleId of expectedStyles) {
    const candidate = scored.find(({ item }) => item.styleId === styleId && !usedCases.has(item.id));
    if (candidate) { result.push(candidate); usedCases.add(candidate.item.id); }
  }
  for (const candidate of scored) {
    if (result.length >= limit) break;
    if (!usedCases.has(candidate.item.id)) { result.push(candidate); usedCases.add(candidate.item.id); }
  }
  return result.slice(0, limit);
}

export function retrieveStyleCases(input, { limit = 4, corpus = designStyleCases } = {}) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('STYLE_QUERY_EMPTY');
  if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw new Error('STYLE_QUERY_LIMIT_INVALID');
  const blocked = BLOCKED.find(({ patterns }) => patterns.some((pattern) => pattern.test(raw)));
  if (blocked) return Object.freeze({ query: raw, status: 'blocked', boundary: blocked.id, message: blocked.reason, results: Object.freeze([]) });

  const query = normalize(raw);
  const styleHits = disambiguateStyles(query, detect(query, STYLE_ALIASES));
  const facetHits = detect(query, FACETS);
  const expectedStyles = Object.keys(styleHits);
  const scored = corpus.cases.map((item) => scoreCase(item, query, styleHits, facetHits))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id));
  const selected = rerank(scored, expectedStyles, limit);
  const results = selected.map(({ item, score, reasons }) => Object.freeze({
    caseId: item.id,
    styleId: item.styleId,
    title: item.title,
    score,
    matched: Object.freeze(reasons),
    context: Object.freeze({ geography: item.geography, dwellingType: item.dwellingType, rooms: item.rooms, household: item.household, intensity: item.intensity, budget: item.budget }),
    evidence: Object.freeze({ designMoves: item.designMoves, applicability: item.applicability, risks: item.risks, unknowns: item.evidence.unknowns }),
    citation: Object.freeze({ url: item.source.url, usage: item.source.usage }),
  }));
  return Object.freeze({
    query: raw,
    status: results.length ? 'ready' : 'insufficient_context',
    detected: Object.freeze({ styleIds: Object.freeze(expectedStyles), facets: Object.freeze(Object.keys(facetHits)) }),
    message: results.length ? '案例只用于方向比较；规范、报价和施工可行性仍需独立数据校验。' : '没有足够条件选出可靠案例，应先询问风格、房间或家庭需求。',
    results: Object.freeze(results),
  });
}
