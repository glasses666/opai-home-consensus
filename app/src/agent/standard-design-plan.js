import { designStyleCases } from '../catalog/design-style-cases.js';
import { designStyleCorpus } from '../catalog/design-style-corpus.js';
import { evaluateDesignRules } from '../domain/design-rules.js';

export const STANDARD_PLAN_PROMPT_VERSION = 'oppein-standard-master-plan-v1.16';
export const STANDARD_PLAN_UNKNOWN_IDS = Object.freeze([
  'homeowner_preferences',
  'site_measurement',
  'climate_and_orientation',
  'oppein_catalog',
  'pricing_bom_schedule',
  'construction_feasibility',
  'professional_review',
]);
export const STANDARD_PLAN_BOUNDARIES = Object.freeze([
  'reference_only',
  'not_construction_standard',
  'no_oppein_sku',
  'no_pricing_bom_schedule',
  'no_production_or_installation',
]);
export const STANDARD_PLAN_DECISION_AREAS = Object.freeze(['spatial', 'envelope', 'furniture', 'lighting']);
export const STANDARD_PLAN_SEGMENTS = Object.freeze(['overview', 'rooms', 'decisions']);
export const STANDARD_PLAN_BASELINE_BRIEF = Object.freeze({
  id: 'baseline-family-home',
  residentRequest: '两位成人和一名儿童共同居住，重视耐用、易维护、收纳和通畅动线。',
  knownFacts: Object.freeze([
    Object.freeze({ id: 'household:two-adults-one-child', text: '住户为两位成人和一名儿童' }),
    Object.freeze({ id: 'priority:durability', text: '耐用性优先' }),
    Object.freeze({ id: 'priority:maintainability', text: '易维护性优先' }),
    Object.freeze({ id: 'priority:storage', text: '收纳能力优先' }),
    Object.freeze({ id: 'priority:clear-circulation', text: '通畅动线优先' }),
  ]),
  unresolvedInputIds: Object.freeze([]),
});

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length >= 2 && value.length <= 500;
const isToken = (value) => typeof value === 'string' && value.trim().length >= 1 && value.length <= 100;
const sameSet = (actual, expected) => Array.isArray(actual) && actual.length === expected.length &&
  actual.every((value) => typeof value === 'string' && expected.includes(value)) && new Set(actual).size === actual.length;
const textFields = (value, keys) => isRecord(value) && keys.every((key) => isText(value[key]));
const issue = (errors, code, path, message) => errors.push(Object.freeze({ code, path, message }));
const unsupportedClaimsIn = (value) => {
  const designText = JSON.stringify(value).replace(/(?:不|不得|禁止|无需)(?:(?:新增|新建|拆除|去除|移动|扩大|缩小|封闭|打通)(?:或|、)?)+.{0,4}(?:墙|隔断|门窗|洞口|管线|水槽|灶)/g, '');
  return [...new Set(designText.match(/[¥￥$]\s*\d|#[0-9a-f]{3,8}|\d+(?:\.\d+)?\s*(?:mm|cm|m²?|㎡|lux|k|毫米|厘米|米|英寸|度|元|万元|万\/|元\/|天完工|天交付)|(?:SKU|BOM|欧派.{0,8}(?:型号|产品|报价|工艺))|(?:可直接施工|施工图|生产下单|不是承重|结构安全|消防合规|机电可行|防水层|防水高度|膨胀螺栓|预埋件|实心墙|燃气热水器|排油烟机|线路调整|锚固于|防倾倒连接件)|(?:拆除|去除|新建|扩大|缩小|封闭|打通).{0,8}(?:墙|隔断|门窗|洞口|管线|水槽|灶)|移动(?:墙|隔断|门窗|洞口|管线|水槽|灶)|(?:替代.{0,4}实墙|全屋.{0,8}开放格局)|(?:现有|原有|保留).{0,6}(?:壁炉|庭院|露梁|拱门|岛台|步入式衣柜)/ig) ?? [])];
};
const rejectUnknown = (errors, value, allowed, path) => {
  if (!isRecord(value)) return;
  Object.keys(value).filter((key) => !allowed.includes(key)).forEach((key) =>
    issue(errors, 'UNKNOWN_FIELD', `${path}.${key}`, 'Undeclared standard-plan fields are not allowed.'),
  );
};

export function standardPlanRuleIds(scene) {
  return Object.freeze([...new Set(evaluateDesignRules(scene).checks.map((check) => check.ruleId).filter(Boolean))].sort());
}

export function standardPlanStyle(styleId, corpus = designStyleCorpus) {
  const style = corpus.styles.find((item) => item.id === styleId);
  if (!style) throw new Error(`STANDARD_PLAN_STYLE_UNKNOWN: ${styleId}`);
  return style;
}

function referencesFor(styleId, cases = designStyleCases) {
  return cases.cases.filter((item) => item.styleId === styleId).slice(0, 2).map((item) => ({
    caseId: item.id,
    designMoves: item.designMoves,
    applicability: item.applicability,
    risks: item.risks,
  }));
}

function sceneSummary(scene) {
  return {
    rooms: scene.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      kind: room.kind,
    })),
    objects: scene.objects.map((object) => ({ id: object.id, roomId: object.roomId, category: object.category, movable: object.capabilities?.movable === true })),
  };
}

function normalizeBrief(brief = STANDARD_PLAN_BASELINE_BRIEF) {
  return {
    id: brief.id,
    residentRequest: brief.residentRequest,
    knownFacts: (brief.knownFacts ?? []).map(({ id, text }) => ({ id, text })),
    unresolvedInputIds: [...(brief.unresolvedInputIds ?? [])],
  };
}

function allowedBasisIds(style, scene, brief) {
  return new Set([
    ...Object.keys(style.characteristics).map((facet) => `style:${style.id}:${facet}`),
    ...scene.rooms.map((room) => `room:${room.id}`),
    ...scene.objects.map((object) => `object:${object.id}`),
    ...scene.openings.map((opening) => `opening:${opening.id}`),
    ...standardPlanRuleIds(scene).flatMap((ruleId) => [`rule:${ruleId}`, `rule:${ruleId.replace(/^rule-/, '')}`]),
    ...brief.knownFacts.flatMap((fact) => [`brief:${fact.id}`, fact.id]),
  ]);
}

function basisCodebook(style, scene, brief) {
  const canonicalRules = new Set(standardPlanRuleIds(scene).map((id) => `rule:${id}`));
  const rawBriefIds = new Set(brief.knownFacts.map((fact) => fact.id));
  return [...allowedBasisIds(style, scene, brief)]
    .filter((id) => !rawBriefIds.has(id) && (!id.startsWith('rule:') || canonicalRules.has(id)))
    .map((id, index) => [`X${String(index + 1).padStart(3, '0')}`, id]);
}

function standardPlanContext(style, scene, brief, cases) {
  return {
    style: {
      id: style.id,
      names: style.names,
      sourceIds: style.sourceIds,
      characteristics: style.characteristics,
    },
    referenceCases: referencesFor(style.id, cases),
    house: sceneSummary(scene),
    brief,
    fixedConstraints: ['keep room boundaries', 'keep openings', 'no structural or MEP changes'],
  };
}

export function buildStandardDesignPlanPrompt({ styleId, scene, brief: rawBrief = STANDARD_PLAN_BASELINE_BRIEF, corpus = designStyleCorpus, cases = designStyleCases }) {
  const style = standardPlanStyle(styleId, corpus);
  const brief = normalizeBrief(rawBrief);
  const context = standardPlanContext(style, scene, brief, cases);
  const shape = {
    toolCalls: [],
    standardPlanDraft: [
      ['', '', ''],
      ['', '', '', ''],
      scene.rooms.map((room) => [room.id, '', '', '', '']),
      ['', '', '', ''],
      ['', '', ''],
      ['', '', ''],
      [[''], [''], ['']],
      ['', ['']],
      STANDARD_PLAN_DECISION_AREAS.map((area) => [
        area,
        '',
        [],
        '',
      ]),
    ],
  };

  return [
    '你是住宅设计规划 Agent。请基于给定风格档案，为同一套固定户型生成一套标准母方案。',
    '只返回一个 JSON 对象，不要 Markdown，不要解释，不要调用工具。第一个字符必须是 {，toolCalls 必须是空数组。根对象只含 toolCalls 与 standardPlanDraft。',
    '不得改变房间边界、门窗、结构或机电；不得声称欧派 SKU、精确价格、BOM、工期、施工图、施工可行、结构/消防/机电合规或可直接生产安装。',
    '只写设计意图与材料、色彩、体量、光环境和维护方向。禁止颜色号、色温、照度、尺寸数值、防水高度、线路/燃气/水槽/烟机位置、螺栓/预埋/锚固方式等施工细节。',
    'roomId 与 basisIds 必须从上下文逐字复制；referenceCases 为空时不得伪造案例。',
    'house 是当前住宅唯一事实来源。风格档案中的壁炉、庭院、拱门、露梁、岛台或其他原型元素若不在 house 中，只能转译为抽象设计语言，不得写成当前住宅已有事实或结构改造。',
    '不得提议新增、拆除或移动任何隔断，即使描述为轻质、活动、非固定或装饰性；只能利用 house 中已有家具、表面和开口表达分区。',
    'standardPlanDraft 九段顺序固定为 summary、spatial、rooms、renovation、furniture、lighting、materials、storage、decisions。不得改成对象。',
    '严格输出形状中的空字符串与空 basisIds 都必须替换为本次设计内容；不得原样复制空值、字段名、英文说明或示例句。roomId 与 decision area 是固定标识，不得替换。',
    '提议方向不得描述成现状。错误或无法核验的住户前提只能在第一段 summary 第三项 resolutionNote 中说明需要核验。',
    'decisions 必须恰好四项，首项依次为 spatial、envelope、furniture、lighting。每项格式为 [area,decision,basisIds,tradeoff]，至少引用一个 style:* 依据和一个 room/object/brief:* 事实依据。不得写“营造高级感”等空话。',
    'brief.knownFacts 中的每个 ID 都必须至少在某一项 decisions 的 basisIds 中以 brief:ID 原样引用一次，不能只在文字里复述。',
    `style basis ID 只能从 ${Object.keys(style.characteristics).map((facet) => `style:${style.id}:${facet}`).join(', ')} 中选择，必须逐字复制 ID，禁止在冒号后拼接锚点文字。其他 basis ID 也只能逐字复制 context 中已有的 ID。`,
    '第三段 rooms 每项严格为 [roomId,intent,envelope,furnitureAndStorage,lighting]，每个房间恰好出现一次。所有文字值不超过 40 个汉字。固定身份、事实引用、规则、未知项和产品边界由本地适配器注入，不要输出这些字段。',
    '涉及高柜防倾倒、固定安装或墙体关系时，只写“待专业复核”，不得给锚固方法。',
    '严格保持定长数组顺序；materials 的三项和 storage 第二项都是非空字符串数组。不得增加对象键或改变数组顺序。',
    `上下文：${JSON.stringify(context)}`,
    `严格输出形状：${JSON.stringify(shape)}`,
  ].join('\n');
}

function segmentShape(segment, style, scene) {
  if (segment === 'overview') return Array.from({ length: 22 }, (_, index) => `${String(index + 1).padStart(2, '0')}##<填写内容>`).join('@@');
  if (segment === 'rooms') return Array.from({ length: scene.rooms.length * 4 }, (_, index) => `${String(index + 1).padStart(2, '0')}##<填写内容>`).join('@@');
  if (segment === 'decisions') return Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(2, '0')}##<填写内容>`).join('@@');
  throw new Error(`STANDARD_PLAN_SEGMENT_UNKNOWN: ${segment}`);
}

export function buildStandardDesignPlanSegmentPrompt({ segment, styleId, scene, brief: rawBrief = STANDARD_PLAN_BASELINE_BRIEF, corpus = designStyleCorpus, cases = designStyleCases }) {
  const style = standardPlanStyle(styleId, corpus);
  const brief = normalizeBrief(rawBrief);
  const context = standardPlanContext(style, scene, brief, cases);
  const instructions = {
    overview: '严格保留 01 至 22 的数字键，每条记录只有“数字键##内容”两个字段。01标题；02设计意图；03需求回应；04全屋策略；05动线；06私密；07尺度；08墙面；09地面；10顶面；11固定构件与洞口；12家具尺度与布置；13软装；14规避项；15自然光；16照明层次；17眩光与维护；18色板列表；19材料列表；20维护列表；21全屋收纳；22房间收纳优先级列表。18、19、20、22 用 || 分隔至少两个短项，其他值不得含分隔符。',
    rooms: `严格输出 01 至 ${String(scene.rooms.length * 4).padStart(2, '0')} 的二字段数字槽位。每个房间连续四槽，依次填写空间意图、墙地顶方向、家具与收纳、照明方向。房间顺序为：${scene.rooms.map((room, index) => `${index + 1}=${room.id}`).join('，')}。`,
    decisions: `严格输出 01 至 12 的二字段数字槽位。01空间决定、02空间依据、03空间代价；04墙地顶决定、05墙地顶依据、06墙地顶代价；07家具决定、08家具依据、09家具代价；10照明决定、11照明依据、12照明代价。依据槽位只填 X001 形式的允许短码，用 || 分隔；每个至少选择一个风格依据和一个事实依据${brief.id === STANDARD_PLAN_BASELINE_BRIEF.id ? '' : '，所有必须覆盖的住户事实短码至少选择一次'}；其他槽位不得含分隔符。`,
  }[segment];
  return [
    `你是住宅设计规划 Agent。只完成标准母方案的 ${segment} 片段。`,
    '只返回一个 JSON 对象，不要 Markdown，不要解释，不要调用工具。根对象只含 toolCalls 与 standardPlanSegment；toolCalls 必须是空数组。',
    'standardPlanSegment 必须是一个单行字符串，不是数组或对象。用 @@ 分隔记录、## 分隔字段、|| 分隔列表项；内容不得包含这些分隔符。',
    instructions,
    '不得改变房间边界、门窗、结构或机电；不得声称欧派 SKU、精确价格、BOM、工期、施工图、施工可行、结构/消防/机电合规或可生产安装。',
    'house 是当前住宅唯一事实来源。原型元素若不在 house 中，不得写成现状。错误或无法核验的住户前提只能作为待核验内容。',
    '不得新增、拆除或移动隔断。禁止颜色号、色温、照度、尺寸、防水高度、线路、燃气、锚固等施工细节。固定安装关系只写“待专业复核”。',
    '严格输出形状中的尖括号占位词、全大写占位词和 FACET、FACT_ID 必须全部替换，不得原样输出。所有文字值不超过 40 个汉字。固定 roomId 与 area 由本地适配器按数字键注入；basisIds 只能从允许列表逐字复制。',
    segment === 'decisions' ? `允许依据短码：${basisCodebook(style, scene, brief).map(([code, id]) => `${code}=${id}`).join(', ')}。${brief.id === STANDARD_PLAN_BASELINE_BRIEF.id ? '' : `必须覆盖的住户事实短码：${basisCodebook(style, scene, brief).filter(([, id]) => id.startsWith('brief:')).map(([code]) => code).join(', ')}。`}依据槽位只能复制等号左侧短码，不能输出右侧长 ID，也不能自造短码。` : '',
    `上下文：${JSON.stringify(context)}`,
    `严格输出形状：${JSON.stringify({ toolCalls: [], standardPlanSegment: segmentShape(segment, style, scene) })}`,
  ].join('\n');
}

export function validateStandardDesignPlanSegmentResponse(response, { segment, scene, style, brief: rawBrief }) {
  const errors = [];
  rejectUnknown(errors, response, ['toolCalls', 'standardPlanSegment'], '$');
  if (!isRecord(response) || !Array.isArray(response.toolCalls) || response.toolCalls.length !== 0 || typeof response.standardPlanSegment !== 'string') {
    issue(errors, 'SEGMENT_ROOT_INVALID', '$', 'Expected empty toolCalls and one standardPlanSegment string.');
    return { ok: false, errors, value: null };
  }
  const rawRows = response.standardPlanSegment.split(/(?:@@|##)(?=\d{2}##)/).map((row) => row.split('##'));
  const segmentText = (value) => isText(value) && value.length <= 80 && !/^[A-Z_]+$/.test(value);
  let value = null;
  if (segment === 'overview') {
    const keys = Array.from({ length: 22 }, (_, index) => String(index + 1).padStart(2, '0'));
    if (rawRows.length !== keys.length || rawRows.some((row, index) => row.length !== 2 || row[0] !== keys[index])) issue(errors, 'SEGMENT_OVERVIEW_SHAPE', 'standardPlanSegment', 'Overview DSL must contain keys 01 through 22 in order, with one value each.');
    else {
      const fields = rawRows.map((row) => row[1]);
      value = [fields.slice(0, 3), fields.slice(3, 7), fields.slice(7, 11), fields.slice(11, 14), fields.slice(14, 17), fields.slice(17, 20), fields.slice(20, 22)];
      value[5] = value[5].map((items) => items.split('||').filter(Boolean));
      value[6][1] = value[6][1].split('||').filter(Boolean);
      if (!value.slice(0, 5).flat().every(segmentText)) issue(errors, 'SEGMENT_OVERVIEW_CONTENT', 'standardPlanSegment', 'Overview contains empty, placeholder, or overlong text.');
      if (!value[5].every((items) => items.length > 0 && items.every(isToken))) issue(errors, 'SEGMENT_MATERIAL_SHAPE', 'standardPlanSegment', 'Material sections must be non-empty lists.');
      if (!segmentText(value[6][0]) || value[6][1].length < 1 || !value[6][1].every(segmentText)) issue(errors, 'SEGMENT_STORAGE_SHAPE', 'standardPlanSegment', 'Storage must contain one whole-home string and one non-empty priority list.');
    }
  }
  if (segment === 'rooms') {
    const keys = Array.from({ length: scene.rooms.length * 4 }, (_, index) => String(index + 1).padStart(2, '0'));
    // Aily occasionally groups the four fields under one room key even after
    // being asked for flat slots. It is the same lossless DSL, so normalize
    // that shape locally while keeping room order and field count strict.
    const groupedRows = rawRows.length === scene.rooms.length
      && rawRows.every((row, index) => row.length === 5 && row[0] === String(index + 1).padStart(2, '0'));
    const normalizedRows = groupedRows
      ? rawRows.flatMap((row, roomIndex) => row.slice(1).map((field, fieldIndex) => [keys[roomIndex * 4 + fieldIndex], field]))
      : rawRows;
    if (normalizedRows.length !== keys.length || normalizedRows.some((row, index) => row.length !== 2 || row[0] !== keys[index])) issue(errors, 'SEGMENT_ROOM_SHAPE', 'standardPlanSegment', 'Rooms DSL must contain ordered numeric keys with one value each.');
    else {
      const fields = normalizedRows.map((row) => row[1]);
      value = scene.rooms.map((room, index) => [room.id, ...fields.slice(index * 4, index * 4 + 4)]);
      if (value.some((row) => !row.slice(1).every(segmentText))) issue(errors, 'SEGMENT_ROOM_CONTENT', 'standardPlanSegment', 'Room rows contain empty, placeholder, or overlong text.');
    }
  }
  if (segment === 'decisions') {
    const keys = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
    // Some provider replies leave a trailing empty field after the final
    // separator ("value##@@next"). Strip only that lossless formatting noise;
    // any non-empty extra field remains invalid.
    const normalizedRows = rawRows.map((row) => row.length === 3 && row[2] === '' ? row.slice(0, 2) : row);
    if (normalizedRows.length !== keys.length || normalizedRows.some((row, index) => row.length !== 2 || row[0] !== keys[index])) issue(errors, 'SEGMENT_DECISION_SHAPE', 'standardPlanSegment', 'Decisions DSL must contain keys 01 through 12 in order, with one value each.');
    else {
      const fields = normalizedRows.map((row) => row[1]);
      value = STANDARD_PLAN_DECISION_AREAS.map((area, index) => [area, ...fields.slice(index * 3, index * 3 + 3)]);
    }
    if (value && style) {
      const brief = normalizeBrief(rawBrief);
      const allowed = allowedBasisIds(style, scene, brief);
      const codes = new Map(basisCodebook(style, scene, brief));
      const normalizeBasisToken = (token) => {
        const [code, ...canonicalParts] = token.split('=');
        const canonical = codes.get(code);
        return canonical && canonicalParts.join('=') === canonical ? canonical : (canonical ?? token);
      };
      value = value.map((row) => [row[0], row[1], row[2].split('||').filter(Boolean).map(normalizeBasisToken).join('||'), row[3]]);
      value.forEach((row, index) => {
        const cited = typeof row[2] === 'string' ? row[2].split('||').filter(Boolean) : [];
        if (!segmentText(row[1]) || !segmentText(row[3]) || cited.length < 2 || cited.some((id) => !allowed.has(id)) || !cited.some((id) => id.startsWith(`style:${style.id}:`)) || !cited.some((id) => !id.startsWith('style:'))) issue(errors, 'SEGMENT_DECISION_GROUNDING', `standardPlanSegment[${index}]`, 'Each decision requires one allowed style basis, one factual basis, and a tradeoff.');
      });
      const allCited = value.flatMap((row) => row[2].split('||').filter(Boolean));
      if (rawBrief && brief.id !== STANDARD_PLAN_BASELINE_BRIEF.id) brief.knownFacts.forEach((fact) => {
        if (!allCited.includes(`brief:${fact.id}`) && !allCited.includes(fact.id)) issue(errors, 'SEGMENT_BRIEF_FACT_UNUSED', 'standardPlanSegment', `Known brief fact was not used: ${fact.id}`);
      });
    }
  }
  const unsupportedClaims = unsupportedClaimsIn(response.standardPlanSegment);
  if (unsupportedClaims.length) issue(errors, 'SEGMENT_UNSUPPORTED_CLAIM', 'standardPlanSegment', `Remove unsupported claims: ${unsupportedClaims.join(', ')}`);
  return { ok: errors.length === 0, errors, value };
}

export function materializeStandardDesignPlanSegments(segments, context) {
  const overview = segments.overview ?? [];
  const decisions = (segments.decisions ?? []).map((row) => [
    row[0], row[1], typeof row[2] === 'string' ? row[2].split('||').filter(Boolean) : row[2], row[3],
  ]);
  return materializeStandardDesignPlanResponse({
    toolCalls: [],
    standardPlanDraft: [overview[0], overview[1], segments.rooms, overview[2], overview[3], overview[4], overview[5], overview[6], decisions],
  }, context);
}

export function materializeStandardDesignPlanResponse(response, { style, scene, brief: rawBrief = STANDARD_PLAN_BASELINE_BRIEF, cases = designStyleCases }) {
  const errors = [];
  rejectUnknown(errors, response, ['toolCalls', 'standardPlanDraft'], '$');
  if (!isRecord(response) || !Array.isArray(response.toolCalls) || response.toolCalls.length !== 0 || !Array.isArray(response.standardPlanDraft)) {
    issue(errors, 'DRAFT_ROOT_INVALID', '$', 'Expected an empty toolCalls array and one standardPlanDraft array.');
    return { response: { toolCalls: [], standardPlan: null }, errors };
  }
  const draft = response.standardPlanDraft;
  const brief = normalizeBrief(rawBrief);
  const references = referencesFor(style.id, cases);
  const exact = (value, length, code, path) => {
    if (Array.isArray(value) && value.length === length) return value;
    issue(errors, code, path, `Expected an array with exactly ${length} items.`);
    return [];
  };
  const sections = exact(draft, 9, 'DRAFT_SECTION_SHAPE', 'standardPlanDraft');
  const summary = exact(sections[0], 3, 'DRAFT_SUMMARY_SHAPE', 'standardPlanDraft[0]');
  const spatial = exact(sections[1], 4, 'DRAFT_SPATIAL_SHAPE', 'standardPlanDraft[1]');
  const roomRows = sections[2];
  const renovation = exact(sections[3], 4, 'DRAFT_RENOVATION_SHAPE', 'standardPlanDraft[3]');
  const furniture = exact(sections[4], 3, 'DRAFT_FURNITURE_SHAPE', 'standardPlanDraft[4]');
  const lighting = exact(sections[5], 3, 'DRAFT_LIGHTING_SHAPE', 'standardPlanDraft[5]');
  const materials = exact(sections[6], 3, 'DRAFT_MATERIALS_SHAPE', 'standardPlanDraft[6]');
  const storage = exact(sections[7], 2, 'DRAFT_STORAGE_SHAPE', 'standardPlanDraft[7]');
  const decisionRows = exact(sections[8], STANDARD_PLAN_DECISION_AREAS.length, 'DRAFT_DECISIONS_SHAPE', 'standardPlanDraft[8]');
  const draftRooms = Array.isArray(roomRows) ? roomRows.map((row, index) => {
    const values = exact(row, 5, 'DRAFT_ROOM_SHAPE', `standardPlanDraft.rooms[${index}]`);
    return {
      roomId: values[0], intent: values[1], envelope: values[2],
      furnitureAndStorage: values[3], lighting: values[4],
    };
  }) : [];
  const roomIds = draftRooms.map((room) => room?.roomId);
  if (!sameSet(roomIds, scene.rooms.map((room) => room.id))) issue(errors, 'DRAFT_ROOM_COVERAGE', 'standardPlanDraft[2]', 'Every canonical room must appear exactly once.');
  const decisions = Object.fromEntries(decisionRows.map((row, index) => {
    const values = exact(row, 4, 'DRAFT_DECISION_SHAPE', `standardPlanDraft.decisions[${index}]`);
    return [values[0], { decision: values[1], basisIds: values[2], tradeoff: values[3] }];
  }));

  const standardPlan = {
    schemaVersion: 1,
    promptVersion: STANDARD_PLAN_PROMPT_VERSION,
    planKind: 'standard_master_plan',
    styleId: style.id,
    variantOf: null,
    title: summary[0],
    designIntent: summary[1],
    briefResponse: {
      briefId: brief.id,
      acknowledgedFactIds: brief.knownFacts.map((fact) => fact.id),
      unresolvedInputIds: brief.unresolvedInputIds,
      resolutionNote: summary[2],
    },
    styleGrounding: {
      profileSource: 'curated_estimate',
      evidenceBoundary: 'reference_only',
      sourceIds: style.sourceIds,
      caseIds: references.map((item) => item.caseId),
      layoutAnchor: style.characteristics.layout,
      paletteAnchors: style.characteristics.palette.slice(0, 3),
      materialAnchors: style.characteristics.materials.slice(0, 3),
      avoidAnchors: style.characteristics.avoid.slice(0, 2),
    },
    spatialPlan: {
      wholeHome: spatial[0], circulation: spatial[1], privacy: spatial[2], scaleFit: spatial[3],
      rooms: draftRooms.map((room) => ({
        ...room,
        existingRefs: scene.objects.filter((object) => object.roomId === room.roomId).map((object) => object.id),
      })),
    },
    renovationPlan: { walls: renovation[0], floors: renovation[1], ceilings: renovation[2], fixedAndOpenings: renovation[3] },
    furniturePlan: { placementAndScale: furniture[0], softFurnishings: furniture[1], avoid: furniture[2] },
    lightingPlan: { daylight: lighting[0], layers: lighting[1], glareAndMaintenance: lighting[2] },
    materialPlan: { palette: materials[0], materials: materials[1], maintenance: materials[2] },
    storagePlan: { wholeHome: storage[0], roomPriorities: storage[1] },
    designDecisions: decisions,
    ruleStrategy: [...standardPlanRuleIds(scene)],
    unknowns: [...STANDARD_PLAN_UNKNOWN_IDS],
    boundaries: [...STANDARD_PLAN_BOUNDARIES],
  };
  return { response: { toolCalls: [], standardPlan }, errors };
}

export function validateStandardDesignPlan(plan, { style, scene, brief: rawBrief = STANDARD_PLAN_BASELINE_BRIEF, cases = designStyleCases } = {}) {
  const errors = [];
  if (!isRecord(plan)) return { ok: false, errors: [{ code: 'INVALID_ROOT', path: '$', message: 'Expected a standard plan object.' }] };
  rejectUnknown(errors, plan, ['schemaVersion', 'promptVersion', 'planKind', 'styleId', 'variantOf', 'title', 'designIntent', 'briefResponse', 'styleGrounding', 'spatialPlan', 'renovationPlan', 'furniturePlan', 'lightingPlan', 'materialPlan', 'storagePlan', 'designDecisions', 'ruleStrategy', 'unknowns', 'boundaries'], '$');
  let resolvedStyle;
  try {
    resolvedStyle = style ?? standardPlanStyle(plan.styleId);
  } catch {
    issue(errors, 'STYLE_UNKNOWN', 'styleId', 'Plan styleId is not a canonical style ID.');
    resolvedStyle = style ?? designStyleCorpus.styles[0];
  }
  const roomIds = scene.rooms.map((room) => room.id);
  const ruleIds = standardPlanRuleIds(scene);
  const allowedCaseIds = referencesFor(resolvedStyle.id, cases).map((item) => item.caseId);
  const brief = normalizeBrief(rawBrief);
  const basisIds = allowedBasisIds(resolvedStyle, scene, brief);

  if (plan.schemaVersion !== 1 || plan.promptVersion !== STANDARD_PLAN_PROMPT_VERSION || plan.planKind !== 'standard_master_plan' || plan.variantOf !== null) issue(errors, 'INVALID_IDENTITY', '$', `Identity must be schemaVersion=1, promptVersion=${STANDARD_PLAN_PROMPT_VERSION}, planKind=standard_master_plan, variantOf=null.`);
  if (plan.styleId !== resolvedStyle.id) issue(errors, 'STYLE_MISMATCH', 'styleId', 'Plan style must match the requested style.');
  if (!isText(plan.title) || !isText(plan.designIntent)) issue(errors, 'EMPTY_SUMMARY', '$', 'Title and design intent are required.');

  rejectUnknown(errors, plan.briefResponse, ['briefId', 'acknowledgedFactIds', 'unresolvedInputIds', 'resolutionNote'], 'briefResponse');
  if (!isRecord(plan.briefResponse) || plan.briefResponse.briefId !== brief.id || !sameSet(plan.briefResponse.acknowledgedFactIds, brief.knownFacts.map((fact) => fact.id)) || !sameSet(plan.briefResponse.unresolvedInputIds, brief.unresolvedInputIds) || !isText(plan.briefResponse.resolutionNote)) issue(errors, 'BRIEF_GROUNDING', 'briefResponse', 'Brief identity, known facts, and unresolved inputs must match the supplied brief.');

  const grounding = plan.styleGrounding;
  rejectUnknown(errors, grounding, ['profileSource', 'evidenceBoundary', 'sourceIds', 'caseIds', 'layoutAnchor', 'paletteAnchors', 'materialAnchors', 'avoidAnchors'], 'styleGrounding');
  if (!isRecord(grounding) || grounding.profileSource !== 'curated_estimate' || grounding.evidenceBoundary !== 'reference_only') issue(errors, 'GROUNDING_BOUNDARY', 'styleGrounding', 'profileSource must be curated_estimate and evidenceBoundary must be reference_only.');
  if (!sameSet(grounding?.sourceIds, resolvedStyle.sourceIds) || !sameSet(grounding?.caseIds, allowedCaseIds)) issue(errors, 'GROUNDING_SOURCE', 'styleGrounding', 'Style source or case IDs differ from the supplied evidence.');
  if (grounding?.layoutAnchor !== resolvedStyle.characteristics.layout || !sameSet(grounding?.paletteAnchors, resolvedStyle.characteristics.palette.slice(0, 3)) || !sameSet(grounding?.materialAnchors, resolvedStyle.characteristics.materials.slice(0, 3)) || !sameSet(grounding?.avoidAnchors, resolvedStyle.characteristics.avoid.slice(0, 2))) issue(errors, 'GROUNDING_ANCHOR', 'styleGrounding', 'Style anchors must be copied from the requested corpus profile.');

  const spatial = plan.spatialPlan;
  rejectUnknown(errors, spatial, ['wholeHome', 'circulation', 'privacy', 'scaleFit', 'rooms'], 'spatialPlan');
  if (!textFields(spatial, ['wholeHome', 'circulation', 'privacy', 'scaleFit']) || !Array.isArray(spatial?.rooms)) issue(errors, 'SPATIAL_PLAN_EMPTY', 'spatialPlan', 'Whole-home and room plans are required.');
  else {
    const actualRoomIds = spatial.rooms.map((room) => room.roomId);
    if (!sameSet(actualRoomIds, roomIds)) issue(errors, 'ROOM_COVERAGE', 'spatialPlan.rooms', 'Every canonical room must appear exactly once.');
    spatial.rooms.forEach((room, index) => {
      rejectUnknown(errors, room, ['roomId', 'existingRefs', 'intent', 'envelope', 'furnitureAndStorage', 'lighting'], `spatialPlan.rooms[${index}]`);
      const expectedRefs = scene.objects.filter((object) => object.roomId === room.roomId).map((object) => object.id);
      if (!sameSet(room.existingRefs, expectedRefs)) issue(errors, 'ROOM_FACT_DRIFT', `spatialPlan.rooms[${index}].existingRefs`, 'Existing room object references must match the canonical scene exactly.');
      if (!textFields(room, ['intent', 'envelope', 'furnitureAndStorage', 'lighting'])) issue(errors, 'ROOM_PLAN_EMPTY', `spatialPlan.rooms[${index}]`, 'Each room requires envelope, furniture/storage, and lighting direction.');
    });
  }
  rejectUnknown(errors, plan.renovationPlan, ['walls', 'floors', 'ceilings', 'fixedAndOpenings'], 'renovationPlan');
  rejectUnknown(errors, plan.furniturePlan, ['placementAndScale', 'softFurnishings', 'avoid'], 'furniturePlan');
  rejectUnknown(errors, plan.lightingPlan, ['daylight', 'layers', 'glareAndMaintenance'], 'lightingPlan');
  rejectUnknown(errors, plan.materialPlan, ['palette', 'materials', 'maintenance'], 'materialPlan');
  rejectUnknown(errors, plan.storagePlan, ['wholeHome', 'roomPriorities'], 'storagePlan');
  if (!textFields(plan.renovationPlan, ['walls', 'floors', 'ceilings', 'fixedAndOpenings'])) issue(errors, 'RENOVATION_PLAN_EMPTY', 'renovationPlan', 'Wall, floor, ceiling, and fixed-installation direction is required.');
  if (!textFields(plan.furniturePlan, ['placementAndScale', 'softFurnishings', 'avoid'])) issue(errors, 'FURNITURE_PLAN_EMPTY', 'furniturePlan', 'Furniture direction is required.');
  if (!textFields(plan.lightingPlan, ['daylight', 'layers', 'glareAndMaintenance'])) issue(errors, 'LIGHTING_PLAN_EMPTY', 'lightingPlan', 'Lighting direction is required.');
  if (!isRecord(plan.materialPlan) || !['palette', 'materials', 'maintenance'].every((key) => Array.isArray(plan.materialPlan[key]) && plan.materialPlan[key].length >= 1 && plan.materialPlan[key].every(isToken))) issue(errors, 'MATERIAL_PLAN_EMPTY', 'materialPlan', 'Material plan requires a non-empty string array per section.');
  if (!isRecord(plan.storagePlan) || !isText(plan.storagePlan.wholeHome) || !Array.isArray(plan.storagePlan.roomPriorities) || plan.storagePlan.roomPriorities.length < 1 || !plan.storagePlan.roomPriorities.every(isText)) issue(errors, 'STORAGE_PLAN_EMPTY', 'storagePlan', 'Storage strategy is incomplete.');

  const decisions = isRecord(plan.designDecisions) ? plan.designDecisions : {};
  rejectUnknown(errors, decisions, STANDARD_PLAN_DECISION_AREAS, 'designDecisions');
  for (const area of STANDARD_PLAN_DECISION_AREAS) {
    const decision = decisions[area];
    rejectUnknown(errors, decision, ['decision', 'basisIds', 'tradeoff'], `designDecisions.${area}`);
    const cited = Array.isArray(decision.basisIds) ? decision.basisIds : [];
    if (!isText(decision?.decision) || !isText(decision?.tradeoff) || cited.length < 2 || cited.some((id) => !basisIds.has(id)) || !cited.some((id) => id.startsWith(`style:${resolvedStyle.id}:`)) || !cited.some((id) => !id.startsWith('style:'))) issue(errors, 'DECISION_GROUNDING', `designDecisions.${area}`, 'Each design decision needs one style basis, one factual basis, and an explicit tradeoff.');
  }
  if (!isRecord(plan.designDecisions) || !sameSet(Object.keys(plan.designDecisions), STANDARD_PLAN_DECISION_AREAS)) issue(errors, 'DECISION_COVERAGE', 'designDecisions', 'Design decisions must cover spatial, envelope, furniture, and lighting exactly once.');

  const strategies = Array.isArray(plan.ruleStrategy) ? plan.ruleStrategy : [];
  if (!sameSet(strategies, ruleIds)) issue(errors, 'RULE_COVERAGE', 'ruleStrategy', 'Every deterministic rule ID must be acknowledged exactly once.');
  if (!sameSet(plan.unknowns, STANDARD_PLAN_UNKNOWN_IDS)) issue(errors, 'UNKNOWNS_INCOMPLETE', 'unknowns', 'All enterprise and professional unknowns must remain explicit.');
  if (!sameSet(plan.boundaries, STANDARD_PLAN_BOUNDARIES)) issue(errors, 'BOUNDARIES_INCOMPLETE', 'boundaries', 'All product boundaries must remain explicit.');

  const designContent = JSON.stringify({
    title: plan.title,
    designIntent: plan.designIntent,
    spatialPlan: plan.spatialPlan,
    renovationPlan: plan.renovationPlan,
    furniturePlan: plan.furniturePlan,
    lightingPlan: plan.lightingPlan,
    materialPlan: plan.materialPlan,
    storagePlan: plan.storagePlan,
    designDecisions: plan.designDecisions,
    ruleStrategy: plan.ruleStrategy,
  });
  const unsupportedClaims = unsupportedClaimsIn(designContent);
  if (unsupportedClaims.length) issue(errors, 'UNSUPPORTED_CLAIM', '$', `Remove unsupported claims: ${unsupportedClaims.join(', ')}`);

  return { ok: errors.length === 0, errors };
}

function creativeSentences(plan) {
  const text = JSON.stringify({
    designIntent: plan?.designIntent,
    spatialPlan: plan?.spatialPlan,
    renovationPlan: plan?.renovationPlan,
    furniturePlan: plan?.furniturePlan,
    lightingPlan: plan?.lightingPlan,
    storagePlan: plan?.storagePlan,
    designDecisions: plan?.designDecisions,
  });
  return new Set(text.split(/[。！？；]/).map((item) => item.replace(/[\s"{},:[\]]/g, '')).filter((item) => item.length >= 14));
}

export function validateStandardPlanDiversity(entries, { maxSharedSentences = 3 } = {}) {
  const errors = [];
  for (let left = 0; left < entries.length; left += 1) {
    const a = creativeSentences(entries[left]?.plan);
    for (let right = left + 1; right < entries.length; right += 1) {
      const b = creativeSentences(entries[right]?.plan);
      const shared = [...a].filter((sentence) => b.has(sentence));
      if (shared.length > maxSharedSentences) issue(errors, 'TEMPLATE_SIMILARITY', `[${left},${right}]`, `Plans share ${shared.length} long design sentences.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateStandardDesignPlanResponse(response, context) {
  if (!isRecord(response) || !Array.isArray(response.toolCalls) || response.toolCalls.length !== 0) {
    return { ok: false, errors: [{ code: 'WRITE_TOOL_NOT_ALLOWED', path: 'toolCalls', message: 'Standard plans must not call tools.' }] };
  }
  const errors = [];
  rejectUnknown(errors, response, ['toolCalls', 'standardPlan'], '$');
  const planResult = validateStandardDesignPlan(response.standardPlan, context);
  return { ok: errors.length === 0 && planResult.ok, errors: [...errors, ...planResult.errors] };
}

export function validateStandardDesignPlanSet(entries, { scene, corpus = designStyleCorpus, cases = designStyleCases } = {}) {
  const errors = [];
  if (!Array.isArray(entries)) return { ok: false, errors: [{ code: 'INVALID_SET', path: '$', message: 'Expected a plan array.' }] };
  const expectedIds = corpus.styles.map((style) => style.id);
  const actualIds = entries.map((entry) => entry?.plan?.styleId);
  if (!sameSet(actualIds, expectedIds)) issue(errors, 'STYLE_COVERAGE', '$', 'Expected exactly one provider plan for each corpus style.');
  entries.forEach((entry, index) => {
    if (entry?.source !== 'provider' || entry?.fallbackReason !== null || entry?.providerReplyIssue !== null || entry?.promptVersion !== STANDARD_PLAN_PROMPT_VERSION) issue(errors, 'PROVIDER_REQUIRED', `[${index}]`, 'Local fallback, stale prompt output, or provider failure does not count.');
    const style = corpus.styles.find((item) => item.id === entry?.plan?.styleId);
    if (style) validateStandardDesignPlan(entry.plan, { style, scene, cases }).errors.forEach((error) => issue(errors, error.code, `[${index}].${error.path}`, error.message));
  });
  return { ok: errors.length === 0, errors };
}
