import {
  buildStandardDesignPlanSegmentPrompt,
  materializeStandardDesignPlanSegments,
  STANDARD_PLAN_PROMPT_VERSION,
  STANDARD_PLAN_SEGMENTS,
  standardPlanStyle,
  validateStandardDesignPlanResponse,
  validateStandardDesignPlanSegmentResponse,
} from './standard-design-plan.js';
import { normalizeProjectSetup, serializeProjectSetup } from '../domain/project-setup.js';

export const FIRST_PLAN_STAGES = Object.freeze([
  Object.freeze({ id: 'setup', label: '读取家庭与户型需求' }),
  Object.freeze({ id: 'overview', label: '建立整屋策略' }),
  Object.freeze({ id: 'rooms', label: '规划各房间方向' }),
  Object.freeze({ id: 'decisions', label: '核对设计依据与取舍' }),
  Object.freeze({ id: 'validation', label: '验证规则与交付边界' }),
]);

const MEMBER_LABELS = {
  self: '本人',
  partner: '伴侣',
  child: '孩子',
  parent: '父母',
  pet: '宠物',
};

const BUDGET_PREFERENCES = {
  '20 万以内': '预算取向克制，优先基础功能与易维护',
  '20–35 万': '预算取向适中，重视性价比与长期维护',
  '35–50 万': '预算允许兼顾材料品质与易维护',
  '50 万以上': '预算取向品质，仍需避免无效堆叠',
  '暂时没有概念': '预算尚未确定，先给出可分阶段的设计方向',
};

const stageState = () => FIRST_PLAN_STAGES.map((stage) => ({ ...stage, status: 'pending', attempts: 0 }));
const setStage = (stages, id, patch) => Object.assign(stages.find((stage) => stage.id === id), patch);

function firstPlanError(code, stages, { retryable = true, details = [] } = {}) {
  const error = new Error(code);
  error.code = code;
  error.retryable = retryable;
  error.details = details;
  error.stages = stages;
  return error;
}

function validateReadySetup(value) {
  const setup = normalizeProjectSetup(value);
  if (!setup.ready || setup.step !== 'summary' || !setup.sourceType || !setup.floorplanConfirmed || !setup.budget || !setup.members.length || setup.styles.length < 2) {
    throw firstPlanError('PROJECT_SETUP_INCOMPLETE', stageState(), { retryable: false });
  }
  try {
    setup.styles.forEach((styleId) => standardPlanStyle(styleId));
  } catch {
    throw firstPlanError('PROJECT_SETUP_STYLE_INVALID', stageState(), { retryable: false });
  }
  return setup;
}

export function firstPlanBriefFromSetup(value) {
  const setup = validateReadySetup(value);
  const styles = setup.styles.map((styleId) => standardPlanStyle(styleId).names.zh);
  const household = setup.members.map((member) => MEMBER_LABELS[member] ?? member).join('、');
  const details = Object.entries(setup.memberDetails).map(([member, detail]) => `${MEMBER_LABELS[member] ?? member}：${detail}`);
  const budget = BUDGET_PREFERENCES[setup.budget] ?? '预算边界待确认';
  return Object.freeze({
    setup,
    setupFingerprint: serializeProjectSetup(setup),
    styleId: setup.styles[0],
    brief: Object.freeze({
      id: `project-setup-${setup.styles[0]}`,
      residentRequest: [
        `家庭成员：${household}`,
        ...details,
        budget,
        `主风格：${styles[0]}；辅助偏好：${styles.slice(1).join('、')}`,
        '基于已确认的当前户型建立首版全屋方案，不改变房间边界、门窗、结构或机电',
      ].join('；'),
      knownFacts: Object.freeze([
        Object.freeze({ id: 'household:setup', text: `家庭成员为${household}${details.length ? `，${details.join('，')}` : ''}` }),
        Object.freeze({ id: 'budget:preference', text: budget }),
        Object.freeze({ id: 'style:secondary-preferences', text: `主风格为${styles[0]}，辅助偏好为${styles.slice(1).join('、')}` }),
      ]),
      unresolvedInputIds: Object.freeze([
        ...(setup.floorplanNote === '需要复核' ? ['site_measurement'] : []),
        ...(setup.sourceType === 'upload' ? ['uploaded_floorplan_recognition'] : []),
        ...(setup.budget === '暂时没有概念' ? ['budget_range'] : []),
      ]),
    }),
    warnings: Object.freeze(setup.sourceType === 'upload' ? ['UPLOAD_USES_CONFIRMED_DEMO_CANONICAL_SCENE'] : []),
  });
}

const repairPrompt = (base, errors) => `${base}\n上一次输出未通过本地合同校验。只重新生成当前片段；错误代码与路径：${errors.map((error) => `${error.code}:${error.path ?? '$'}`).slice(0, 20).join(', ')}。不要猜测校验器，不要复用上一次输出。`;

const segmentForError = (errors, repaired) => STANDARD_PLAN_SEGMENTS.find((segment) => {
  if (repaired.has(segment)) return false;
  if (segment === 'decisions') return errors.some((error) => /DECISION|BRIEF_FACT/.test(error.code) || /designDecisions/.test(error.path ?? ''));
  if (segment === 'rooms') return errors.some((error) => /ROOM/.test(error.code) || /spatialPlan\.rooms/.test(error.path ?? ''));
  return errors.some((error) => !/DECISION|BRIEF_FACT|ROOM/.test(error.code));
});

export async function generateFirstPlan({ scene, setup: rawSetup, provider, maxAttempts = 3 } = {}) {
  const stages = stageState();
  const { setup, setupFingerprint, styleId, brief, warnings } = firstPlanBriefFromSetup(rawSetup);
  setStage(stages, 'setup', { status: 'completed' });
  if (!scene?.rooms?.length) throw firstPlanError('FIRST_PLAN_SCENE_INVALID', stages, { retryable: false });
  if (typeof provider !== 'function') throw firstPlanError('AILY_UNAVAILABLE', stages);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw firstPlanError('FIRST_PLAN_ATTEMPTS_INVALID', stages, { retryable: false });

  const style = standardPlanStyle(styleId);
  const segments = {};
  const providerTrace = {};
  const generateSegment = async (segment, contractErrors = []) => {
    const stage = stages.find((candidate) => candidate.id === segment);
    setStage(stages, segment, { status: 'running' });
    const basePrompt = buildStandardDesignPlanSegmentPrompt({ segment, styleId, scene, brief });
    let errors = contractErrors;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      stage.attempts += 1;
      let response;
      try {
        response = await provider({ prompt: errors.length ? repairPrompt(basePrompt, errors) : basePrompt, tools: [] });
      } catch (error) {
        if (attempt === maxAttempts || !error?.retryable) {
          setStage(stages, segment, { status: 'failed' });
          throw firstPlanError(error?.message?.startsWith('AILY_') ? error.message : 'AILY_UNAVAILABLE', stages);
        }
        continue;
      }
      const validation = validateStandardDesignPlanSegmentResponse(response, { segment, scene, style, brief });
      if (validation.ok) {
        segments[segment] = validation.value;
        providerTrace[segment] = response.providerTrace ?? null;
        setStage(stages, segment, { status: 'completed' });
        return;
      }
      errors = validation.errors;
      if (attempt === maxAttempts) {
        setStage(stages, segment, { status: 'failed' });
        throw firstPlanError('FIRST_PLAN_CONTRACT_INVALID', stages, { details: errors });
      }
    }
  };

  for (const segment of STANDARD_PLAN_SEGMENTS) await generateSegment(segment);
  setStage(stages, 'validation', { status: 'running' });
  const repaired = new Set();
  let assembled;
  let validation;
  let finalErrors = [];
  for (let attempt = 0; attempt <= STANDARD_PLAN_SEGMENTS.length; attempt += 1) {
    assembled = materializeStandardDesignPlanSegments(segments, { scene, style, brief });
    validation = validateStandardDesignPlanResponse(assembled.response, { scene, style, brief });
    const errors = [...assembled.errors, ...validation.errors];
    finalErrors = errors;
    if (!errors.length) break;
    const segment = segmentForError(errors, repaired);
    if (!segment) {
      setStage(stages, 'validation', { status: 'failed', attempts: attempt + 1 });
      throw firstPlanError('FIRST_PLAN_CONTRACT_INVALID', stages, { details: errors });
    }
    repaired.add(segment);
    await generateSegment(segment, errors);
  }
  if (finalErrors.length) {
    setStage(stages, 'validation', { status: 'failed', attempts: repaired.size + 1 });
    throw firstPlanError('FIRST_PLAN_CONTRACT_INVALID', stages, { details: finalErrors });
  }
  setStage(stages, 'validation', { status: 'completed', attempts: repaired.size + 1 });
  return Object.freeze({
    setup,
    setupFingerprint,
    styleId,
    brief,
    warnings,
    plan: assembled.response.standardPlan,
    promptVersion: STANDARD_PLAN_PROMPT_VERSION,
    providerTrace,
    stages,
  });
}
