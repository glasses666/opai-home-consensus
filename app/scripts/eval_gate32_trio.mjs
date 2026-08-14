#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { callAily } from '../server/feishu.mjs';
import {
  buildStandardDesignPlanSegmentPrompt,
  materializeStandardDesignPlanResponse,
  materializeStandardDesignPlanSegments,
  STANDARD_PLAN_PROMPT_VERSION,
  STANDARD_PLAN_SEGMENTS,
  validateStandardDesignPlanSegmentResponse,
  validateStandardDesignPlanResponse,
} from '../src/agent/standard-design-plan.js';
import { designStyleCorpus } from '../src/catalog/design-style-corpus.js';
import { createDemoScene } from '../src/domain/demo-scene.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scene = createDemoScene();
const args = process.argv.slice(2);
const argValue = (prefix) => args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
const onlyStyle = argValue('--style=');
const onlyVariant = argValue('--variant=');
const retryFrom = argValue('--retry-from=');
const concurrency = Math.max(1, Math.min(6, Number(argValue('--concurrency=') ?? 4)));
const seed = String(argValue('--seed=') ?? Date.now());
const startedAt = new Date().toISOString();
const runId = `gate32-${startedAt.replace(/[-:TZ.]/g, '').slice(0, 14)}-${seed.replace(/[^A-Za-z0-9_-]/g, '_')}`;
const runDir = resolve(root, `evals/gate32/${runId}`);
const recordsDir = resolve(runDir, 'records');
const agentId = process.env.AILY_AGENT_ID;
if (!agentId) throw new Error('AILY_AGENT_ID_MISSING');

const fixedLayouts = Object.freeze([
  Object.freeze({
    id: 'fixed-baseline-family',
    kind: 'fixed',
    seed: null,
    residentRequest: '两位成人和一名儿童共同居住，重视耐用、易维护、收纳和通畅动线。请基于当前固定户型给出方案，不改房间边界、门窗、结构或机电。',
    knownFacts: Object.freeze([
      Object.freeze({ id: 'household:two-adults-one-child', text: '住户为两位成人和一名儿童' }),
      Object.freeze({ id: 'priority:durability', text: '耐用性优先' }),
      Object.freeze({ id: 'priority:maintainability', text: '易维护性优先' }),
      Object.freeze({ id: 'priority:storage', text: '收纳能力优先' }),
      Object.freeze({ id: 'priority:clear-circulation', text: '通畅动线优先' }),
    ]),
    unresolvedInputIds: Object.freeze([]),
  }),
  Object.freeze({
    id: 'fixed-family-flex-work',
    kind: 'fixed',
    seed: null,
    residentRequest: '两位成人和一名儿童共同居住，其中一人在家办公。希望空间耐用、易维护，保留清楚的工作与活动边界，收纳不能牺牲日常动线。请基于当前固定户型给出方案，不改房间边界、门窗、结构或机电。',
    knownFacts: Object.freeze([
      Object.freeze({ id: 'household:two-adults-one-child', text: '住户为两位成人和一名儿童' }),
      Object.freeze({ id: 'household:home-office', text: '一位成人有稳定的居家办公需求' }),
      Object.freeze({ id: 'priority:maintainability', text: '高频区域易维护' }),
      Object.freeze({ id: 'priority:storage', text: '收纳能力不能被工作区挤占' }),
      Object.freeze({ id: 'priority:clear-circulation', text: '工作、活动和通行边界清楚' }),
    ]),
    unresolvedInputIds: Object.freeze([]),
  }),
]);

const variantDefinitions = Object.freeze([
  Object.freeze({ id: 'balanced', label: '平衡取舍', instruction: '在风格表达、耐用维护、收纳和通行动线之间做平衡，不让单一目标吞掉其他目标。' }),
  Object.freeze({ id: 'budget-maintenance', label: '预算与维护优先', instruction: '优先选择克制、耐用、易维护的方向，减少高维护或只承担装饰的表达，但仍保留该风格可辨识的核心锚点。不要编造价格。' }),
  Object.freeze({ id: 'family-storage', label: '家庭收纳与成长优先', instruction: '优先保证家庭收纳、儿童活动和未来变化的弹性；不要把空间变成展厅，也不要改变固定户型事实。' }),
]);

const hash = (value) => Number.parseInt(createHash('sha256').update(String(value)).digest('hex').slice(0, 8), 16) >>> 0;
const nextRandom = (state) => {
  let value = state >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return [value >>> 0, (value >>> 0) / 0x1_0000_0000];
};
const pick = (state, list) => {
  const [next, unit] = nextRandom(state);
  return [next, list[Math.min(list.length - 1, Math.floor(unit * list.length))]];
};

function makeRandomLayout(index) {
  let state = hash(`${seed}:layout:${index}`);
  const householdOptions = [
    ['一位成人和一名儿童', 'household:one-adult-one-child', '住户为一位成人和一名儿童'],
    ['两位成人和一只宠物', 'household:two-adults-pet', '住户为两位成人和一只宠物'],
    ['两位成人和一位长辈', 'household:two-adults-senior', '住户包含两位成人和一位长辈'],
    ['两位成人和两名儿童', 'household:two-adults-two-children', '住户为两位成人和两名儿童'],
  ];
  const priorityOptions = [
    ['收纳优先', 'priority:storage', '收纳能力优先'],
    ['安静和私密优先', 'priority:quiet-privacy', '安静与私密优先'],
    ['容易打理优先', 'priority:maintainability', '高频区域易维护'],
    ['活动弹性优先', 'priority:flexibility', '家具和活动区域需要可变'],
  ];
  const constraintOptions = [
    ['自然采光一般', 'site:limited-daylight', '住宅自然采光一般'],
    ['临街窗户需要隐私', 'site:street-facing-window', '住宅窗户临街且需要隐私'],
    ['不接受全屋高饱和色', 'avoid:high-saturation', '避免全屋高饱和色'],
    ['预算暂未确定', 'budget:unknown', '预算尚未确定'],
  ];
  let household; [state, household] = pick(state, householdOptions);
  let priority; [state, priority] = pick(state, priorityOptions);
  let constraint; [state, constraint] = pick(state, constraintOptions);
  return Object.freeze({
    id: `random-${index + 1}-${seed}`,
    kind: 'random',
    seed,
    randomState: state,
    residentRequest: `${household[0]}居住，希望${priority[0]}；${constraint[0]}。请基于当前固定户型给出方案，不改房间边界、门窗、结构或机电。`,
    knownFacts: Object.freeze([
      Object.freeze({ id: household[1], text: household[2] }),
      Object.freeze({ id: priority[1], text: priority[2] }),
      Object.freeze({ id: constraint[1], text: constraint[2] }),
    ]),
    unresolvedInputIds: Object.freeze(constraint[1] === 'budget:unknown' ? ['budget:unknown'] : []),
  });
}

const layouts = Object.freeze([...fixedLayouts, makeRandomLayout(0), makeRandomLayout(1)]);
const variants = variantDefinitions.filter((variant) => !onlyVariant || variant.id === onlyVariant);
const styles = designStyleCorpus.styles.filter((style) => !onlyStyle || style.id === onlyStyle);
if (!styles.length) throw new Error(`GATE32_STYLE_NOT_FOUND:${onlyStyle}`);
if (!variants.length) throw new Error(`GATE32_VARIANT_NOT_FOUND:${onlyVariant}`);
const allTargetList = styles.flatMap((style) => variants.flatMap((variant) => layouts.map((layout) => ({ style, variant, layout }))));

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

const briefFor = (layout) => ({ id: layout.id, residentRequest: layout.residentRequest, knownFacts: layout.knownFacts, unresolvedInputIds: layout.unresolvedInputIds });

function buildPrompt(target, segment) {
  const base = buildStandardDesignPlanSegmentPrompt({ segment, styleId: target.style.id, scene, brief: briefFor(target.layout) });
  return `${base}\n本轮是 Gate 32 三重奏黑盒测试。当前变体：${target.variant.id}（${target.variant.label}）。只在设计取舍上落实下列目标：${target.variant.instruction}\n同一风格、同一固定户型和当前家庭布局必须保持事实一致；不要输出 variant 字段，不要写工具，不要调用本地 Harness，不要把变体目标当成房屋现状。测试重点是观察你在不同家庭条件下是否会露出事实漂移、风格混淆、空泛模板或过度承诺。仍严格返回当前片段合同。`;
}

const normalizeError = (error) => ({
  name: error?.name ?? 'Error',
  message: error?.message ?? String(error),
  retryable: error?.retryable === true,
  evaluator: error?.evaluator === true,
  validationErrors: error?.validationErrors ?? null,
  rawResponse: typeof error?.rawResponse === 'string' ? error.rawResponse : null,
  providerTrace: error?.providerTrace ?? null,
});

async function runOne(target) {
  const id = `${target.style.id}__${target.variant.id}__${target.layout.id}`;
  const prompts = Object.fromEntries(STANDARD_PLAN_SEGMENTS.map((segment) => [segment, buildPrompt(target, segment)]));
  const started = Date.now();
  let serviceRetries = 0;
  let lastError = null;
  const segments = {};
  const providerTrace = {};
  const segmentRecords = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      for (const segment of STANDARD_PLAN_SEGMENTS) {
        const response = await callAily({ prompt: prompts[segment], tools: [] }, { agentId, timeoutMs: 240_000, maxAttempts: 1 });
        let segmentValidation;
        try {
          segmentValidation = validateStandardDesignPlanSegmentResponse(response, { segment, scene, style: target.style, brief: briefFor(target.layout) });
        } catch (error) {
          throw Object.assign(new Error('EVALUATOR_EXCEPTION'), {
            evaluator: true,
            validationErrors: [{ code: 'EVALUATOR_EXCEPTION', path: '$', message: error?.message ?? String(error) }],
          });
        }
        segmentRecords.push({ segment, source: 'provider', providerTrace: response.providerTrace ?? null, response, validation: { ok: segmentValidation.ok, errors: segmentValidation.errors } });
        if (!segmentValidation.ok) throw Object.assign(new Error('PROVIDER_CONTRACT_FAILURE'), { validationErrors: segmentValidation.errors });
        segments[segment] = segmentValidation.value;
        providerTrace[segment] = response.providerTrace ?? null;
      }
      let assembled;
      try {
        assembled = materializeStandardDesignPlanSegments(segments, { scene, style: target.style, brief: briefFor(target.layout) });
      } catch (error) {
        throw Object.assign(new Error('EVALUATOR_EXCEPTION'), {
          evaluator: true,
          validationErrors: [{ code: 'EVALUATOR_EXCEPTION', path: '$', message: error?.message ?? String(error) }],
        });
      }
      let contract;
      try {
        contract = validateStandardDesignPlanResponse(assembled.response, { scene, style: target.style, brief: briefFor(target.layout) });
      } catch (error) {
        throw Object.assign(new Error('EVALUATOR_EXCEPTION'), {
          evaluator: true,
          validationErrors: [{ code: 'EVALUATOR_EXCEPTION', path: '$', message: error?.message ?? String(error) }],
        });
      }
      const validation = { ok: assembled.errors.length === 0 && contract.ok, errors: [...assembled.errors, ...contract.errors] };
      return { id, styleId: target.style.id, variantId: target.variant.id, layoutId: target.layout.id, layoutKind: target.layout.kind, layoutSeed: target.layout.seed, attempt, serviceRetries, source: 'provider', providerTrace, prompts, segmentRecords, validation, plan: validation.ok ? assembled.response.standardPlan : null, latencyMs: Date.now() - started, completedAt: new Date().toISOString() };
    } catch (error) {
      lastError = normalizeError(error);
      const retryable = error?.retryable === true || /^AILY_(?:TIMEOUT|RUN_|CHAT_)/.test(error?.message ?? '');
      if (!retryable || attempt === 2) break;
      serviceRetries += 1;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 3000));
    }
  }
  const source = lastError?.evaluator
    ? 'evaluator_error'
    : lastError?.message === 'PROVIDER_CONTRACT_FAILURE'
      ? 'provider_contract_failure'
      : 'provider_error';
  return { id, styleId: target.style.id, variantId: target.variant.id, layoutId: target.layout.id, layoutKind: target.layout.kind, layoutSeed: target.layout.seed, attempt: serviceRetries + 1, serviceRetries, source, prompts, segmentRecords, error: lastError, validation: { ok: false, errors: lastError?.validationErrors ?? [{ code: lastError?.message ?? 'AILY_ERROR', path: '$' }] }, plan: null, latencyMs: Date.now() - started, completedAt: new Date().toISOString() };
}

function summarize(records) {
  const failureCodes = {};
  for (const record of records) for (const error of record.validation?.errors ?? []) {
    const code = error.code ?? record.error?.message ?? 'UNKNOWN';
    failureCodes[code] = (failureCodes[code] ?? 0) + 1;
  }
  return {
    total: records.length,
    providerResponses: records.filter((record) => record.source === 'provider').length,
    providerContractPasses: records.filter((record) => record.source === 'provider' && record.validation?.ok).length,
    providerContractFailures: records.filter((record) => record.source === 'provider_contract_failure' || (record.source === 'provider' && !record.validation?.ok)).length,
    evaluatorFailures: records.filter((record) => record.source === 'evaluator_error').length,
    serviceFailures: records.filter((record) => record.source === 'provider_error').length,
    byVariant: Object.fromEntries(variants.map((variant) => [variant.id, records.filter((record) => record.variantId === variant.id && record.validation?.ok).length])),
    byLayout: Object.fromEntries(layouts.map((layout) => [layout.id, records.filter((record) => record.layoutId === layout.id && record.validation?.ok).length])),
    failureCodes,
  };
}

async function main() {
  let targetList = allTargetList;
  let retrySource = null;
  if (retryFrom) {
    retrySource = JSON.parse(await readFile(resolve(retryFrom), 'utf8'));
    const retryIds = new Set(retrySource.records.filter((record) => record.source === 'provider_error').map((record) => record.id));
    targetList = allTargetList.filter((target) => retryIds.has(`${target.style.id}__${target.variant.id}__${target.layout.id}`));
    if (!targetList.length) throw new Error('GATE32_RETRY_EMPTY');
  }
  await mkdir(recordsDir, { recursive: true });
  await writeJson(resolve(runDir, 'layouts.json'), { seed, fixed: fixedLayouts, random: layouts.filter((layout) => layout.kind === 'random'), all: layouts });
  await writeJson(resolve(runDir, 'variants.json'), variants);
  await writeJson(resolve(runDir, 'run.json'), { runId, seed, startedAt, promptVersion: STANDARD_PLAN_PROMPT_VERSION, inputContract: 'gate31-segment-contract-v1', testMode: retryFrom ? 'black_box_service_retry_no_harness_adjustment' : 'black_box_no_harness_adjustment', retryFrom: retryFrom ?? null, retrySourceRunId: retrySource?.runId ?? null, styleCount: styles.length, variantCount: variants.length, layoutCount: layouts.length, expectedCalls: targetList.length, concurrency, fixedLayoutIds: fixedLayouts.map((layout) => layout.id), randomLayoutIds: layouts.filter((layout) => layout.kind === 'random').map((layout) => layout.id) });
  const records = [];
  let cursor = 0;
  async function worker(workerId) {
    while (true) {
      const target = targetList[cursor++];
      if (!target) return;
      const record = await runOne(target);
      records.push(record);
      await writeJson(resolve(recordsDir, `${record.id}.json`), record);
      await writeJson(resolve(runDir, 'progress.json'), { runId, completed: records.length, expected: targetList.length, last: record.id, summary: summarize(records) });
      console.log(`[worker ${workerId}] ${records.length}/${targetList.length} ${record.id} ${record.source}:${record.validation.ok ? 'pass' : 'fail'}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targetList.length) }, (_, index) => worker(index + 1)));
  records.sort((a, b) => a.id.localeCompare(b.id));
  const report = { runId, seed, promptVersion: STANDARD_PLAN_PROMPT_VERSION, inputContract: 'gate31-segment-contract-v1', testMode: retryFrom ? 'black_box_service_retry_no_harness_adjustment' : 'black_box_no_harness_adjustment', retryFrom: retryFrom ?? null, retrySourceRunId: retrySource?.runId ?? null, completedAt: new Date().toISOString(), layouts, variants, records, summary: summarize(records) };
  await writeJson(resolve(runDir, 'report.json'), report);
  console.log(JSON.stringify({ runId, runDir, ...report.summary }, null, 2));
  if (report.summary.serviceFailures === report.summary.total) process.exitCode = 1;
}

main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
