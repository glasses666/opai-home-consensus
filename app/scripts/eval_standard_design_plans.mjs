#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { callAily } from '../server/feishu.mjs';
import { runLarkCli } from '../server/lark-cli.mjs';
import {
  buildStandardDesignPlanSegmentPrompt,
  materializeStandardDesignPlanSegments,
  STANDARD_PLAN_BASELINE_BRIEF,
  STANDARD_PLAN_PROMPT_VERSION,
  STANDARD_PLAN_SEGMENTS,
  validateStandardDesignPlanResponse,
  validateStandardDesignPlanSegmentResponse,
  validateStandardDesignPlanSet,
  validateStandardPlanDiversity,
} from '../src/agent/standard-design-plan.js';
import {
  STANDARD_PLAN_ACCEPTANCE_CASES,
  STANDARD_PLAN_DEVELOPMENT_CASES,
  publicStandardPlanBrief,
  validateStandardPlanAcceptance,
} from '../src/agent/standard-design-plan-eval.js';
import { designStyleCorpus } from '../src/catalog/design-style-corpus.js';
import { designStyleCases } from '../src/catalog/design-style-cases.js';
import { createDemoScene } from '../src/domain/demo-scene.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const argValue = (prefix) => process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
const live = args.has('--live');
const publish = args.has('--publish');
const resume = args.has('--resume');
const onlyStyle = argValue('--style=');
const onlyCase = argValue('--case=');
const suite = argValue('--suite=') ?? 'baseline';
if (!['baseline', 'development', 'acceptance'].includes(suite)) throw new Error(`STANDARD_PLAN_SUITE_UNKNOWN:${suite}`);
const checkpointTarget = onlyCase ?? onlyStyle;
const checkpointPath = resolve(root, `.data/gate31-${suite}${checkpointTarget ? `-${checkpointTarget}` : ''}-standard-design-plans.json`);
const publishPath = resolve(root, 'src/catalog/standard-design-plans-v2.json');
const scene = createDemoScene();
const runAilyCli = (args) => runLarkCli(args, { timeoutMs: 25_000 });

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmp, path);
}

function validateRecord(record, target) {
  if (!record?.plan) {
    const errors = Array.isArray(record?.errors) && record.errors.length
      ? record.errors
      : [{ code: record?.error ?? 'STANDARD_PLAN_MISSING' }];
    return { ok: false, errors };
  }
  const style = designStyleCorpus.styles.find((item) => item.id === target.styleId);
  const planResult = style
    ? validateStandardDesignPlanResponse({ toolCalls: [], standardPlan: record.plan }, { scene, style, brief: target.brief })
    : { ok: false, errors: [{ code: 'STANDARD_PLAN_MISSING' }] };
  const acceptance = target.evalCase && record?.plan ? validateStandardPlanAcceptance(record.plan, target.evalCase) : { ok: true, errors: [] };
  return { ok: planResult.ok && acceptance.ok, errors: [...planResult.errors, ...acceptance.errors] };
}

function validateReport(report, targets, { partialStyleId = null } = {}) {
  if (report?.promptVersion !== STANDARD_PLAN_PROMPT_VERSION) {
    return { passed: false, styleCount: 0, passedCount: 0, errors: ['STANDARD_PLAN_PROMPT_VERSION_STALE'] };
  }
  const records = report.records ?? [];
  if (partialStyleId) {
    const record = records.find((item) => item.styleId === partialStyleId);
    const target = targets.find((item) => item.styleId === partialStyleId);
    const result = target ? validateRecord(record, target) : { ok: false, errors: [{ code: 'STANDARD_PLAN_MISSING' }] };
    const passed = Boolean(record?.source === 'provider' && record.fallbackReason === null && record.providerReplyIssue === null && record.promptVersion === STANDARD_PLAN_PROMPT_VERSION && result.ok);
    return {
      passed,
      styleCount: record ? 1 : 0,
      passedCount: passed ? 1 : 0,
      errors: passed ? [] : [...new Set([record?.providerReplyIssue, record?.error, ...result.errors.map((error) => error.code)].filter(Boolean))],
    };
  }
  if (suite !== 'baseline') {
    const results = targets.map((target) => {
      const record = records.find((item) => item.caseId === target.id);
      return { target, record, validation: validateRecord(record, target) };
    });
    const errors = results.flatMap(({ target, record, validation }) => validation.ok && record?.source === 'provider' ? [] : validation.errors.map((error) => `${target.id}:${error.code}`));
    return {
      passed: records.length === targets.length && errors.length === 0,
      styleCount: records.length,
      passedCount: results.filter(({ record, validation }) => record?.source === 'provider' && validation.ok).length,
      firstPassCount: results.filter(({ record, validation }) => record?.source === 'provider' && validation.ok && record.providerRepairCount === 0).length,
      factDriftCount: errors.filter((error) => /ROOM_FACT_DRIFT|FORBIDDEN_ASSUMPTION|UNSUPPORTED_CLAIM/.test(error)).length,
      errors,
    };
  }
  const entries = records.filter((record) => record.ok).map((record) => ({
    promptVersion: record.promptVersion,
    source: record.source,
    fallbackReason: record.fallbackReason,
    providerReplyIssue: record.providerReplyIssue,
    plan: record.plan,
  }));
  const setResult = validateStandardDesignPlanSet(entries, { scene });
  const diversity = validateStandardPlanDiversity(entries);
  return {
    passed: setResult.ok && diversity.ok && records.length === designStyleCorpus.styles.length && records.every((record) => record.source === 'provider' && record.ok && record.providerReplyIssue === null),
    styleCount: records.length,
    passedCount: records.filter((record) => record.ok).length,
    errors: [...setResult.errors, ...diversity.errors, ...records.flatMap((record) => record.ok ? [] : [`${record.styleId}:${record.error}`])],
  };
}

function repairSegmentPrompt(target, segment, errors) {
  const errorRefs = errors.map((error) => typeof error === 'string' ? error.split(':').slice(0, 2).join(':') : `${error.code}:${error.path}`).slice(0, 20);
  return `${buildStandardDesignPlanSegmentPrompt({ segment, styleId: target.styleId, scene, brief: target.brief })}\n上一次响应未通过。只依据原始上下文重新生成该片段；错误代码与路径：${errorRefs.join(', ')}。不要猜测校验器的目标词，也不要复用上一次响应。`;
}

function repairSegmentsFor(errors) {
  const segments = new Set();
  for (const error of errors) {
    if (/DECISION|BRIEF_FACT/.test(error.code) || /designDecisions/.test(error.path ?? '')) segments.add('decisions');
    else if (/ROOM/.test(error.code) || /spatialPlan\.rooms/.test(error.path ?? '')) segments.add('rooms');
    else segments.add('overview');
  }
  return STANDARD_PLAN_SEGMENTS.filter((segment) => segments.has(segment));
}

async function generateSegment(target, segment, attempts, initialErrors = [], resumedTarget = false) {
  let prompt = initialErrors.length
    ? repairSegmentPrompt(target, segment, initialErrors)
    : buildStandardDesignPlanSegmentPrompt({ segment, styleId: target.styleId, scene, brief: target.brief });
  let attemptKind = initialErrors.length ? 'contract_repair' : resumedTarget ? 'resume_repair' : 'generate';
  let transportRetries = 0;
  let resumeChatId = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const callIndex = attempts.filter((item) => item.segment === segment).length + 1;
    const attemptStartedAt = Date.now();
    try {
      const result = await callAily({ prompt, tools: [] }, {
        agentId: process.env.AILY_AGENT_ID,
        appId: process.env.AILY_APP_ID,
        run: runAilyCli,
        timeoutMs: 240_000,
        maxAttempts: 1,
        resumeChatId,
      });
      await writeJson(resolve(root, `.data/gate31-${suite}-${target.id}-${segment}-attempt-${callIndex}.json`), result);
      const style = designStyleCorpus.styles.find((item) => item.id === target.styleId);
      const validation = validateStandardDesignPlanSegmentResponse(result, { segment, scene, style, brief: target.brief });
      const validationErrors = validation.errors.map((error) => `${error.code}:${error.path}`);
      attempts.push({ segment, attempt: callIndex, roundAttempt: attempt, kind: attemptKind, latencyMs: Date.now() - attemptStartedAt, ok: validation.ok, errors: validationErrors });
      console.log(`${target.id}:${segment}: attempt ${attempt} ${validation.ok ? 'valid' : validationErrors.join(',')}`);
      if (validation.ok) return { content: validation.value, trace: result.providerTrace ?? null };
      prompt = repairSegmentPrompt(target, segment, validation.errors);
      attemptKind = 'repair';
      resumeChatId = null;
    } catch (error) {
      resumeChatId = error.providerTrace?.provider === 'aily_team' ? error.providerTrace.chatId : null;
      attempts.push({ segment, attempt: callIndex, roundAttempt: attempt, kind: error.rawResponse ? 'repair_invalid_json' : `${attemptKind}_transport`, latencyMs: Date.now() - attemptStartedAt, ok: false, errors: [error.message] });
      console.log(`${target.id}:${segment}: attempt ${attempt} ${error.message}`);
      if (attempt === 3 || (!error.rawResponse && (!error.retryable || transportRetries >= 1))) throw error;
      if (error.rawResponse) {
        resumeChatId = null;
        await writeFile(resolve(root, `.data/gate31-${suite}-${target.id}-${segment}-attempt-${callIndex}-invalid-response.txt`), error.rawResponse);
        prompt = repairSegmentPrompt(target, segment, [{ code: 'AILY_RESPONSE_INVALID', path: '$' }]);
        attemptKind = 'repair';
      } else {
        transportRetries += 1;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 3_000));
      }
    }
  }
  throw new Error(`STANDARD_PLAN_SEGMENT_INVALID:${segment}`);
}

async function main() {
  const suiteCases = suite === 'development' ? STANDARD_PLAN_DEVELOPMENT_CASES : suite === 'acceptance' ? STANDARD_PLAN_ACCEPTANCE_CASES : null;
  const targets = suiteCases
    ? suiteCases.filter((evalCase) => !onlyCase || evalCase.id === onlyCase).map((evalCase) => ({ id: evalCase.id, styleId: evalCase.styleId, brief: publicStandardPlanBrief(evalCase), evalCase }))
    : designStyleCorpus.styles.filter((style) => !onlyStyle || style.id === onlyStyle).map((style) => ({ id: style.id, styleId: style.id, brief: STANDARD_PLAN_BASELINE_BRIEF, evalCase: null }));
  if ((onlyStyle || onlyCase) && targets.length !== 1) throw new Error(`STANDARD_PLAN_TARGET_NOT_FOUND:${onlyStyle ?? onlyCase}`);

  if (!live) {
    const report = suite === 'baseline'
      ? await readJson(publishPath, null) ?? await readJson(checkpointPath, null)
      : await readJson(checkpointPath, null);
    if (!report) throw new Error('STANDARD_PLAN_REPORT_MISSING');
    const validation = validateReport(report, targets, { partialStyleId: onlyStyle });
    console.log(JSON.stringify({ suite: `gate31-${suite}-standard-design-plans`, live: false, ...validation }, null, 2));
    if (!validation.passed) process.exitCode = 1;
    return;
  }

  const savedReport = resume ? await readJson(checkpointPath, null) : null;
  const report = savedReport?.promptVersion === STANDARD_PLAN_PROMPT_VERSION ? savedReport : {
    suite: `gate31-${suite}-standard-design-plans`,
    promptVersion: STANDARD_PLAN_PROMPT_VERSION,
    source: 'provider',
    generatedAt: new Date().toISOString(),
    records: [],
  };
  const byTarget = new Map(report.records.map((record) => [record.caseId ?? record.styleId, record]));

  for (const target of targets) {
    const style = designStyleCorpus.styles.find((item) => item.id === target.styleId);
    const cached = byTarget.get(target.id);
    const cachedValidation = cached && validateRecord(cached, target);
    if (cached?.source === 'provider' && cached?.fallbackReason === null && cached?.providerReplyIssue === null && cachedValidation?.ok && cached?.promptVersion === STANDARD_PLAN_PROMPT_VERSION) {
      console.log(`${target.id}: cached`);
      continue;
    }
    const startedAt = Date.now();
    const attempts = Array.isArray(cached?.attempts) ? [...cached.attempts] : [];
    const resumedTarget = attempts.length > 0;
    try {
      const segments = {};
      const providerTrace = {};
      for (const segment of STANDARD_PLAN_SEGMENTS) {
        const generated = await generateSegment(target, segment, attempts, [], resumedTarget);
        segments[segment] = generated.content;
        providerTrace[segment] = generated.trace;
      }
      let assembled = materializeStandardDesignPlanSegments(segments, { scene, style, brief: target.brief });
      let result = assembled.response;
      let validation;
      const repairedSegments = new Set();
      for (let contractAttempt = 0; contractAttempt <= STANDARD_PLAN_SEGMENTS.length; contractAttempt += 1) {
        const contract = validateStandardDesignPlanResponse(result, { scene, style, brief: target.brief });
        const acceptance = target.evalCase && result.standardPlan ? validateStandardPlanAcceptance(result.standardPlan, target.evalCase) : { ok: true, errors: [] };
        validation = { ok: assembled.errors.length === 0 && contract.ok && acceptance.ok, errors: [...assembled.errors, ...contract.errors, ...acceptance.errors] };
        if (validation.ok) break;
        const segment = repairSegmentsFor(validation.errors).find((candidate) => !repairedSegments.has(candidate));
        if (!segment) break;
        repairedSegments.add(segment);
        console.log(`${target.id}: contract repair ${segment} ${validation.errors.map((error) => `${error.code}:${error.path}`).join(',')}`);
        const generated = await generateSegment(target, segment, attempts, validation.errors, resumedTarget);
        segments[segment] = generated.content;
        providerTrace[segment] = generated.trace;
        assembled = materializeStandardDesignPlanSegments(segments, { scene, style, brief: target.brief });
        result = assembled.response;
      }
      if (!validation?.ok) throw Object.assign(new Error('STANDARD_PLAN_INVALID'), { validationErrors: validation?.errors ?? [] });
      const record = {
        caseId: target.evalCase ? target.id : null,
        styleId: style.id,
        promptVersion: STANDARD_PLAN_PROMPT_VERSION,
        source: 'provider',
        fallbackReason: null,
        providerReplyIssue: validation.ok ? null : validation.errors.map((error) => error.code).join(','),
        providerTrace,
        latencyMs: Date.now() - startedAt,
        attempts,
        providerRepairCount: attempts.filter((item) => item.kind !== 'generate').length,
        ok: validation.ok,
        errors: validation.errors,
        plan: result.standardPlan,
      };
      byTarget.set(target.id, record);
      console.log(`${target.id}: ${record.ok ? 'passed' : `failed ${record.errors.map((error) => error.code).join(',')}`}`);
    } catch (error) {
      if (error.rawResponse) await writeFile(resolve(root, `.data/gate31-${suite}-${target.id}-final-invalid-response.txt`), error.rawResponse);
      byTarget.set(target.id, {
        caseId: target.evalCase ? target.id : null,
        styleId: style.id,
        promptVersion: STANDARD_PLAN_PROMPT_VERSION,
        source: 'provider_error',
        fallbackReason: null,
        providerReplyIssue: error.message,
        latencyMs: Date.now() - startedAt,
        attempts,
        ok: false,
        error: error.message,
        errors: error.validationErrors ?? [],
      });
      console.log(`${target.id}: error ${error.message}`);
    }
    report.records = targets.map((item) => byTarget.get(item.id)).filter(Boolean);
    await writeJson(checkpointPath, report);
  }

  report.generatedAt = new Date().toISOString();
  report.records = targets.map((target) => byTarget.get(target.id)).filter(Boolean);
  await writeJson(checkpointPath, report);

  const validation = validateReport(report, targets, { partialStyleId: onlyStyle });
  if (publish && suite === 'baseline' && !onlyStyle && validation.passed) await writeJson(publishPath, report);
  console.log(JSON.stringify({ suite: report.suite, live: true, publish, ...validation }, null, 2));
  if (!validation.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
