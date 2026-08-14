import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStandardDesignPlanPrompt,
  buildStandardDesignPlanSegmentPrompt,
  materializeStandardDesignPlanResponse,
  materializeStandardDesignPlanSegments,
  STANDARD_PLAN_BASELINE_BRIEF,
  STANDARD_PLAN_BOUNDARIES,
  STANDARD_PLAN_DECISION_AREAS,
  STANDARD_PLAN_PROMPT_VERSION,
  STANDARD_PLAN_SEGMENTS,
  STANDARD_PLAN_UNKNOWN_IDS,
  standardPlanRuleIds,
  standardPlanStyle,
  validateStandardDesignPlan,
  validateStandardDesignPlanResponse,
  validateStandardDesignPlanSegmentResponse,
  validateStandardDesignPlanSet,
  validateStandardPlanDiversity,
} from '../src/agent/standard-design-plan.js';
import { STANDARD_PLAN_DIAGNOSTIC_CASES, publicStandardPlanBrief } from '../src/agent/standard-design-plan-eval.js';
import { designStyleCases } from '../src/catalog/design-style-cases.js';
import { designStyleCorpus } from '../src/catalog/design-style-corpus.js';
import { createDemoScene } from '../src/domain/demo-scene.js';

const scene = createDemoScene();

function samplePlan(styleId = 'scandinavian') {
  const style = standardPlanStyle(styleId);
  const rooms = scene.rooms.map((room) => ({
    roomId: room.id,
    existingRefs: scene.objects.filter((object) => object.roomId === room.id).map((object) => object.id),
    intent: `${room.name}按${style.names.zh}建立可维护的日常使用秩序。`,
    envelope: '墙地顶使用定性材料方向并保留专业复核。',
    furnitureAndStorage: '家具和收纳保持通道与尺度优先。',
    lighting: '照明分为自然光、基础光和任务光。',
  }));
  return {
    schemaVersion: 1,
    promptVersion: STANDARD_PLAN_PROMPT_VERSION,
    planKind: 'standard_master_plan',
    styleId,
    variantOf: null,
    title: `${style.names.zh}标准母方案`,
    designIntent: '围绕固定户型建立可执行的整体设计方向，不写入 scene。',
    briefResponse: {
      briefId: STANDARD_PLAN_BASELINE_BRIEF.id,
      acknowledgedFactIds: STANDARD_PLAN_BASELINE_BRIEF.knownFacts.map((fact) => fact.id),
      unresolvedInputIds: [],
      resolutionNote: '已按已知家庭事实规划，其他条件继续保留为未知项。',
    },
    styleGrounding: {
      profileSource: 'curated_estimate',
      evidenceBoundary: 'reference_only',
      sourceIds: style.sourceIds,
      caseIds: designStyleCases.cases.filter((item) => item.styleId === styleId).slice(0, 2).map((item) => item.id),
      layoutAnchor: style.characteristics.layout,
      paletteAnchors: style.characteristics.palette.slice(0, 3),
      materialAnchors: style.characteristics.materials.slice(0, 3),
      avoidAnchors: style.characteristics.avoid.slice(0, 2),
    },
    spatialPlan: {
      wholeHome: '保持整屋动线连续，公共区开敞，私密区收束。',
      circulation: '主通道优先满足现有净距规则。',
      privacy: '卧室与卫生间区域保留更高私密度。',
      scaleFit: '所有方向以当前 canonical 户型和房间边界为准。',
      rooms,
    },
    renovationPlan: {
      walls: '公共区采用风格化但低维护的墙面方向。',
      floors: '主要空间使用统一耐维护地面方向。',
      ceilings: '顶面保持暖白连续基底并减少复杂造型。',
      fixedAndOpenings: '门窗和固定安装不改变结构，落地前需要专业复核。',
    },
    furniturePlan: {
      placementAndScale: '家具按房间体量布置并保留通道。',
      softFurnishings: '软装只作为风格提示，不覆盖硬约束。',
      avoid: '不要用过多主题化单品替代空间比例。',
    },
    lightingPlan: {
      daylight: '尽量保留窗边自然光。',
      layers: '基础光、任务光和重点光保持清楚层次。',
      glareAndMaintenance: '灯具和反光材质需便于清洁并控制眩光。',
    },
    materialPlan: {
      palette: style.characteristics.palette.slice(0, 2),
      materials: style.characteristics.materials.slice(0, 2),
      maintenance: ['潮湿区域材料需易清洁。', '高频接触面避免难维护表面。'],
    },
    storagePlan: {
      wholeHome: '玄关、卧室和儿童房优先建立封闭收纳。',
      roomPriorities: ['玄关集中鞋服收纳。', '卧室衣物收纳靠墙组织。'],
    },
    designDecisions: Object.fromEntries(STANDARD_PLAN_DECISION_AREAS.map((area) => [area, {
      decision: `${style.names.zh}在${area}采用明确且可维护的设计选择。`,
      basisIds: [`style:${styleId}:layout`, 'brief:priority:durability'],
      tradeoff: '优先长期使用秩序，减少短期装饰表达。',
    }])),
    ruleStrategy: [...standardPlanRuleIds(scene)],
    unknowns: STANDARD_PLAN_UNKNOWN_IDS,
    boundaries: STANDARD_PLAN_BOUNDARIES,
  };
}

test('standard design prompt covers the selected style and every demo rule', () => {
  const prompt = buildStandardDesignPlanPrompt({ styleId: 'scandinavian', scene });
  assert.match(prompt, /standardPlanDraft/);
  assert.match(prompt, /scandinavian/);
  assert.match(prompt, /禁止颜色号、色温、照度、尺寸数值/);
  assert.doesNotMatch(prompt, /requiredAny|forbiddenTerms/);
  const context = JSON.parse(prompt.match(/上下文：(.+)\n严格输出形状：/s)[1]);
  const shape = JSON.parse(prompt.match(/严格输出形状：(.+)$/s)[1]);
  assert.equal(context.house.rooms.length, scene.rooms.length);
  assert.equal(context.house.objects.length, scene.objects.length);
  assert.equal('ruleIds' in context.house, false);
  assert.deepEqual(shape.standardPlanDraft[2].map((room) => room[0]), scene.rooms.map((room) => room.id));
  assert.equal(prompt.includes('specific design choice, not generic praise'), false);
});

test('standard plan adapter injects fixed scene facts without asking Aily to repeat them', () => {
  const plan = samplePlan();
  const draft = [
    [plan.title, plan.designIntent, plan.briefResponse.resolutionNote],
    [plan.spatialPlan.wholeHome, plan.spatialPlan.circulation, plan.spatialPlan.privacy, plan.spatialPlan.scaleFit],
    plan.spatialPlan.rooms.map((room) => [room.roomId, room.intent, room.envelope, room.furnitureAndStorage, room.lighting]),
    [plan.renovationPlan.walls, plan.renovationPlan.floors, plan.renovationPlan.ceilings, plan.renovationPlan.fixedAndOpenings],
    [plan.furniturePlan.placementAndScale, plan.furniturePlan.softFurnishings, plan.furniturePlan.avoid],
    [plan.lightingPlan.daylight, plan.lightingPlan.layers, plan.lightingPlan.glareAndMaintenance],
    [plan.materialPlan.palette, plan.materialPlan.materials, plan.materialPlan.maintenance],
    [plan.storagePlan.wholeHome, plan.storagePlan.roomPriorities],
    STANDARD_PLAN_DECISION_AREAS.map((area) => [area, plan.designDecisions[area].decision, plan.designDecisions[area].basisIds, plan.designDecisions[area].tradeoff]),
  ];
  const style = standardPlanStyle('scandinavian');
  const assembled = materializeStandardDesignPlanResponse({ toolCalls: [], standardPlanDraft: draft }, { style, scene });
  assert.deepEqual(assembled.errors, []);
  assert.equal(validateStandardDesignPlanResponse(assembled.response, { style, scene }).ok, true);
  assert.deepEqual(assembled.response.standardPlan.spatialPlan.rooms[0].existingRefs, plan.spatialPlan.rooms[0].existingRefs);
  assert.deepEqual(assembled.response.standardPlan.ruleStrategy, standardPlanRuleIds(scene));
});

test('standard plan adapter rejects malformed compact rows instead of repairing provider output', () => {
  const style = standardPlanStyle('scandinavian');
  const assembled = materializeStandardDesignPlanResponse({
    toolCalls: [],
    standardPlanDraft: [['title', 'intent'], [], [['room-living-dining']], [], [], [], [], [], []],
  }, { style, scene });
  assert.equal(assembled.errors.some((error) => error.code === 'DRAFT_SUMMARY_SHAPE'), true);
  assert.equal(assembled.errors.some((error) => error.code === 'DRAFT_ROOM_SHAPE'), true);
  assert.equal(assembled.errors.some((error) => error.code === 'DRAFT_DECISIONS_SHAPE'), true);
});

test('segmented provider contract assembles three strict Aily fragments without adding design content', () => {
  const plan = samplePlan();
  const segments = {
    overview: [
      [plan.title, plan.designIntent, plan.briefResponse.resolutionNote],
      [plan.spatialPlan.wholeHome, plan.spatialPlan.circulation, plan.spatialPlan.privacy, plan.spatialPlan.scaleFit],
      [plan.renovationPlan.walls, plan.renovationPlan.floors, plan.renovationPlan.ceilings, plan.renovationPlan.fixedAndOpenings],
      [plan.furniturePlan.placementAndScale, plan.furniturePlan.softFurnishings, plan.furniturePlan.avoid],
      [plan.lightingPlan.daylight, plan.lightingPlan.layers, plan.lightingPlan.glareAndMaintenance],
      [plan.materialPlan.palette, plan.materialPlan.materials, plan.materialPlan.maintenance],
      [plan.storagePlan.wholeHome, plan.storagePlan.roomPriorities],
    ],
    rooms: plan.spatialPlan.rooms.map((room) => [room.roomId, room.intent, room.envelope, room.furnitureAndStorage, room.lighting]),
    decisions: STANDARD_PLAN_DECISION_AREAS.map((area) => [area, plan.designDecisions[area].decision, plan.designDecisions[area].basisIds.join('||'), plan.designDecisions[area].tradeoff]),
  };
  const payloads = {
    overview: [...segments.overview.slice(0, 5).flat(), ...segments.overview[5].map((items) => items.join('||')), segments.overview[6][0], segments.overview[6][1].join('||')]
      .map((value, index) => `${String(index + 1).padStart(2, '0')}##${value}`).join('@@'),
    rooms: segments.rooms.flatMap((row) => row.slice(1)).map((value, index) => `${String(index + 1).padStart(2, '0')}##${value}`).join('@@'),
    decisions: segments.decisions.flatMap((row) => row.slice(1)).map((value, index) => `${String(index + 1).padStart(2, '0')}##${value}`).join('@@'),
  };
  for (const segment of STANDARD_PLAN_SEGMENTS) {
    const prompt = buildStandardDesignPlanSegmentPrompt({ segment, styleId: 'scandinavian', scene });
    assert.match(prompt, new RegExp(`标准母方案的 ${segment} 片段`));
    if (segment === 'decisions') {
      assert.match(prompt, /X001=style:scandinavian:/);
      assert.doesNotMatch(prompt, /必须覆盖的住户事实短码：X\d{3}/);
    }
    const validation = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: payloads[segment] }, { segment, scene, style: standardPlanStyle('scandinavian') });
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.value, segments[segment]);
  }
  const style = standardPlanStyle('scandinavian');
  const assembled = materializeStandardDesignPlanSegments(segments, { style, scene });
  assert.deepEqual(assembled.errors, []);
  assert.equal(validateStandardDesignPlanResponse(assembled.response, { style, scene }).ok, true);
});

test('segmented provider contract accepts an equivalent numeric record boundary', () => {
  const plan = samplePlan();
  const payload = plan.spatialPlan.rooms.flatMap((room) => [room.intent, room.envelope, room.furnitureAndStorage, room.lighting])
    .map((value, index) => `${String(index + 1).padStart(2, '0')}##${value}`).join('##');
  const result = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: payload }, { segment: 'rooms', scene, style: standardPlanStyle('scandinavian') });
  assert.equal(result.ok, true);
});

test('segmented provider contract accepts newline-delimited numeric records', () => {
  const values = Array.from({ length: 22 }, (_, index) => `方向${String.fromCharCode(65 + (index % 20))}`);
  values[17] = '暖白||浅木';
  values[18] = '木饰面||亚麻';
  values[19] = '耐擦洗||易维护';
  values[21] = '玄关||客厅';
  const payload = values.map((value, index) => `${String(index + 1).padStart(2, '0')}##${value}`).join('\n');
  const result = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: payload }, { segment: 'overview', scene, style: standardPlanStyle('scandinavian') });
  assert.equal(result.ok, true);
});

test('segmented provider contract accepts directly adjacent numeric records', () => {
  const grouped = scene.rooms.map((room, index) => `${String(index + 1).padStart(2, '0')}##${room.name}意图##墙地顶方向##家具方向##照明方向`).join('');
  const result = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: grouped }, { segment: 'rooms', scene, style: standardPlanStyle('scandinavian') });
  assert.equal(result.ok, true);
});

test('segmented provider contract accepts grouped room fields separated by record tokens', () => {
  const grouped = scene.rooms.map((room, index) => `${String(index + 1).padStart(2, '0')}##${room.name}意图@@墙地顶方向@@家具方向@@照明方向`).join('@@');
  const result = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: grouped }, { segment: 'rooms', scene, style: standardPlanStyle('scandinavian') });
  assert.equal(result.ok, true);
});

test('segmented provider contract accepts lossless grouped room records', () => {
  const grouped = scene.rooms.map((room, roomIndex) => [
    `${String(roomIndex + 1).padStart(2, '0')}##${room.name}空间意图##墙地顶方向##家具与收纳方向##照明方向`,
  ]).flat().join('@@');
  const result = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: grouped }, { segment: 'rooms', scene, style: standardPlanStyle('scandinavian') });
  assert.equal(result.ok, true);
  assert.equal(result.value.length, scene.rooms.length);
  assert.deepEqual(result.value[0].slice(1), [`${scene.rooms[0].name}空间意图`, '墙地顶方向', '家具与收纳方向', '照明方向']);
});

test('segmented provider contract accepts lossless overview list separators', () => {
  const values = Array.from({ length: 22 }, (_, index) => `方向${String.fromCharCode(65 + (index % 20))}`);
  values[17] = '暖白##浅木##烟灰';
  values[18] = '木饰面、亚麻、哑光石材';
  values[19] = '耐擦洗｜｜易维护';
  values[21] = '玄关、客厅、主卧';
  const payload = values.map((value, index) => `${String(index + 1).padStart(2, '0')}##${value}`).join('@@');
  const result = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: payload }, { segment: 'overview', scene, style: standardPlanStyle('scandinavian') });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value[5][0], ['暖白', '浅木', '烟灰']);
  assert.deepEqual(result.value[6][1], ['玄关', '客厅', '主卧']);
});

test('segmented provider contract ignores only trailing empty decision fields', () => {
  const style = standardPlanStyle('scandinavian');
  const rows = STANDARD_PLAN_DECISION_AREAS.flatMap((area, areaIndex) => [
    `${area}决定`,
    `X${String(areaIndex + 1).padStart(3, '0')}||X009`,
    `${area}代价`,
  ]).map((value, index) => `${String(index + 1).padStart(2, '0')}##${value}##`).join('@@');
  const result = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: rows }, { segment: 'decisions', scene, style });
  assert.equal(result.ok, true);
});

test('segmented provider contract accepts codebook entries with their canonical IDs echoed', () => {
  const style = standardPlanStyle('scandinavian');
  const rows = STANDARD_PLAN_DECISION_AREAS.flatMap((area, areaIndex) => [
    `${area}决定`,
    `X${String(areaIndex + 1).padStart(3, '0')}=style:scandinavian:layout||X009=brief:household:two-adults-one-child`,
    `${area}代价`,
  ]).map((value, index) => `${String(index + 1).padStart(2, '0')}##${value}`).join('@@');
  const result = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: rows }, { segment: 'decisions', scene, style });
  assert.equal(result.ok, true);
});

test('segmented provider contract accepts only lossless decision grouping and basis separators', () => {
  const style = standardPlanStyle('scandinavian');
  const grouped = STANDARD_PLAN_DECISION_AREAS.map((area, index) => `${String(index + 1).padStart(2, '0')}##${area}决定##X${String(index + 1).padStart(3, '0')}##X009##${area}代价`).join('@@');
  const groupedResult = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: grouped }, { segment: 'decisions', scene, style });
  assert.equal(groupedResult.ok, true);

  const flat = STANDARD_PLAN_DECISION_AREAS.flatMap((area, index) => [`${area}决定`, `X${String(index + 1).padStart(3, '0')}##X009`, `${area}代价`])
    .map((value, index) => `${String(index + 1).padStart(2, '0')}##${value}`).join('@@');
  const flatResult = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: flat }, { segment: 'decisions', scene, style });
  assert.equal(flatResult.ok, true);

  const unsafe = grouped.replace('X009##spatial代价', '未登记依据##spatial代价');
  const unsafeResult = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: unsafe }, { segment: 'decisions', scene, style });
  assert.equal(unsafeResult.errors.some((error) => error.code === 'SEGMENT_DECISION_SHAPE'), true);
});

test('segmented provider contract rejects malformed DSL and unknown grounding IDs', () => {
  const style = standardPlanStyle('scandinavian');
  const malformed = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: 'summary##only-two-fields' }, { segment: 'overview', scene, style });
  assert.equal(malformed.errors.some((error) => error.code === 'SEGMENT_OVERVIEW_SHAPE'), true);

  const decisionRows = STANDARD_PLAN_DECISION_AREAS.flatMap(() => ['具体决定', 'style:scandinavian:palette||not-a-scene-id', '明确代价'])
    .map((value, index) => `${String(index + 1).padStart(2, '0')}##${value}`).join('@@');
  const ungrounded = validateStandardDesignPlanSegmentResponse({ toolCalls: [], standardPlanSegment: decisionRows }, { segment: 'decisions', scene, style });
  assert.equal(ungrounded.errors.some((error) => error.code === 'SEGMENT_DECISION_GROUNDING'), true);
});

test('standard design plan validator accepts a grounded provider response', () => {
  const response = { toolCalls: [], standardPlan: samplePlan() };
  assert.equal(validateStandardDesignPlanResponse(response, { scene }).ok, true);
  assert.equal(validateStandardDesignPlan(response.standardPlan, { scene }).ok, true);
});

test('standard design plan validator rejects provider drift and false claims', () => {
  const wrong = samplePlan();
  wrong.styleId = '北欧';
  wrong.styleGrounding.paletteAnchors = ['not in this style'];
  wrong.ruleStrategy.pop();
  wrong.renovationPlan.walls = '欧派真实 SKU 和精确报价已经完成。';
  const result = validateStandardDesignPlan(wrong, { scene });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === 'STYLE_UNKNOWN'), true);
  assert.equal(result.errors.some((error) => error.code === 'GROUNDING_ANCHOR'), true);
  assert.equal(result.errors.some((error) => error.code === 'RULE_COVERAGE'), true);
  assert.equal(result.errors.some((error) => error.code === 'UNSUPPORTED_CLAIM'), true);
});

test('standard design plan validator permits explicit no-demolition constraints', () => {
  const constrained = samplePlan();
  constrained.designDecisions.spatial.decision = '保持现有边界，不新增或拆除隔断，无需新建隔断。';
  constrained.renovationPlan.walls = '浅色墙面扩大空间感，不变动防水层，以屏风替代新建隔断而非封闭隔断，拒绝欧派 SKU，避免在固定结构上新增洞口或拆除隔断。';
  const result = validateStandardDesignPlan(constrained, { scene });
  assert.equal(result.errors.some((error) => error.code === 'UNSUPPORTED_CLAIM'), false);

  constrained.renovationPlan.walls = '扩大现有洞口。';
  assert.equal(validateStandardDesignPlan(constrained, { scene }).errors.some((error) => error.code === 'UNSUPPORTED_CLAIM'), true);

  constrained.renovationPlan.walls = '新增封闭隔断。';
  assert.equal(validateStandardDesignPlan(constrained, { scene }).errors.some((error) => error.code === 'UNSUPPORTED_CLAIM'), true);
});

test('standard design plan validator rejects undeclared fields and hidden writes', () => {
  const response = { toolCalls: [], standardPlan: samplePlan(), sceneCommand: { type: 'object.delete' } };
  response.standardPlan.pricing = { total: '已确认' };
  response.standardPlan.spatialPlan.rooms[0].sku = 'DEMO-01';
  const result = validateStandardDesignPlanResponse(response, { scene });
  assert.equal(result.ok, false);
  assert.equal(result.errors.filter((error) => error.code === 'UNKNOWN_FIELD').length, 3);
});

test('standard design plan set requires provider plans for all 28 corpus styles', () => {
  const entries = designStyleCorpus.styles.map((style) => ({
    promptVersion: STANDARD_PLAN_PROMPT_VERSION,
    source: 'provider',
    fallbackReason: null,
    providerReplyIssue: null,
    plan: samplePlan(style.id),
  }));
  assert.equal(validateStandardDesignPlanSet(entries, { scene }).ok, true);
  assert.equal(validateStandardDesignPlanSet(entries.slice(1), { scene }).errors.some((error) => error.code === 'STYLE_COVERAGE'), true);
  assert.equal(validateStandardDesignPlanSet([{ ...entries[0], promptVersion: 'old' }, ...entries.slice(1)], { scene }).errors.some((error) => error.code === 'PROVIDER_REQUIRED'), true);
  assert.equal(validateStandardDesignPlanSet([{ ...entries[0], fallbackReason: 'local' }, ...entries.slice(1)], { scene }).errors.some((error) => error.code === 'PROVIDER_REQUIRED'), true);
});

test('standard plan grounds decisions and separates existing room facts from proposals', () => {
  const wrong = samplePlan();
  wrong.spatialPlan.rooms[0].existingRefs = ['object-sofa'];
  wrong.designDecisions.spatial.basisIds = ['style:scandinavian:layout', 'brief:not-supplied'];
  const result = validateStandardDesignPlan(wrong, { scene });
  assert.equal(result.errors.some((error) => error.code === 'ROOM_FACT_DRIFT'), true);
  assert.equal(result.errors.some((error) => error.code === 'DECISION_GROUNDING'), true);
});

test('held-out expectations stay outside the prompt and catch false resident premises', () => {
  const evalCase = STANDARD_PLAN_DIAGNOSTIC_CASES.find((item) => item.id === 'holdout-contemporary-false-fireplace');
  const brief = publicStandardPlanBrief(evalCase);
  const prompt = buildStandardDesignPlanPrompt({ styleId: evalCase.styleId, scene, brief });
  const decisionPrompt = buildStandardDesignPlanSegmentPrompt({ segment: 'decisions', styleId: evalCase.styleId, scene, brief });
  assert.match(prompt, /resident-claim:fireplace-not-in-scene/);
  assert.doesNotMatch(prompt, /FORBIDDEN_ASSUMPTION|保留壁炉,原有壁炉/);
  assert.match(decisionPrompt, /必须覆盖的住户事实短码：X\d{3}/);

  const plan = samplePlan(evalCase.styleId);
  plan.briefResponse = {
    briefId: brief.id,
    acknowledgedFactIds: brief.knownFacts.map((fact) => fact.id),
    unresolvedInputIds: brief.unresolvedInputIds,
    resolutionNote: '住户提到的壁炉不在 scene 中，保持未决并等待核验。',
  };
  plan.renovationPlan.walls = '保留壁炉，并以当代材料更新其他墙面。';
  assert.equal(validateStandardDesignPlan(plan, { scene, brief }).errors.some((error) => error.code === 'UNSUPPORTED_CLAIM'), true);
});

test('diversity validator rejects repeated long-form templates without inspecting fixed IDs', () => {
  const duplicate = samplePlan();
  const result = validateStandardPlanDiversity([{ plan: duplicate }, { plan: structuredClone(duplicate) }]);
  assert.equal(result.errors.some((error) => error.code === 'TEMPLATE_SIMILARITY'), true);
});
