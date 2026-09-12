#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const playwrightModule = process.env.OPAI_PLAYWRIGHT_MODULE
  ?? '/Users/dracoglasser/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightModule));

const baseUrl = process.env.OPAI_QA_URL ?? 'http://127.0.0.1:5184';
const outputDir = process.env.OPAI_QA_OUTPUT ?? '/tmp/opai-product-qa/live';
const maxLiveTurns = Number(process.env.OPAI_QA_MAX_LIVE_TURNS ?? 3);
const finalFlow = process.env.OPAI_QA_FINAL_FLOW === '1';
const headless = process.env.OPAI_QA_HEADLESS !== '0';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless });
const results = [];
const liveTurns = [];
const record = (id, passed, details = {}) => results.push({ id, passed: Boolean(passed), ...details });
const textOf = (value) => typeof value === 'string' ? value : value?.text ?? '';
const listText = (items) => (items ?? []).map(textOf).filter(Boolean);
const sceneHash = (scene) => JSON.stringify(scene);

async function freshContext(viewport = { width: 1440, height: 1000 }) {
  return browser.newContext({ viewport, locale: 'zh-CN' });
}

async function openProject({ context = null, viewport, url = `${baseUrl}/project/demo?style=agent-canvas` } = {}) {
  const ownedContext = !context;
  const activeContext = context ?? await freshContext(viewport);
  const page = await activeContext.newPage();
  const diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on('console', message => { if (message.type() === 'error') diagnostics.consoleErrors.push(message.text()); });
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', request => diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByRole('heading', { name: '我的生活空间' }).waitFor({ timeout: 30_000 });
  const projectId = new URL(page.url()).searchParams.get('project');
  if (!projectId) throw new Error('FRESH_PROJECT_ID_MISSING');
  return { context: activeContext, ownedContext, page, projectId, diagnostics };
}

async function projectSnapshot(page, projectId) {
  return page.evaluate(async id => {
    const token = localStorage.getItem(`opai.experience.${id}.token`);
    const response = await fetch(`/api/experience/projects/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  }, projectId);
}

async function sendLivePrompt(page, input) {
  if (liveTurns.length >= maxLiveTurns) throw new Error('LIVE_TURN_BUDGET_EXHAUSTED');
  const beforeAssistantCount = await page.locator('.agent-message[data-role="assistant"]:not([data-busy="true"])').count();
  const responsePromise = page.waitForResponse(response => /\/api\/experience\/projects\/[^/]+\/turn$/.test(new URL(response.url()).pathname), { timeout: 115_000 });
  await page.getByRole('textbox', { name: '告诉 Agent 你的设计需求' }).fill(input);
  await page.getByRole('button', { name: '发送给 Agent' }).click();
  const response = await responsePromise;
  const body = await response.json().catch(() => ({}));
  await page.waitForFunction(count => document.querySelectorAll('.agent-message[data-role="assistant"]:not([data-busy="true"])').length > count, beforeAssistantCount, { timeout: 115_000 });
  const assistant = page.locator('.agent-message[data-role="assistant"]:not([data-busy="true"])').last();
  const reply = {
    input,
    status: response.status(),
    text: (await assistant.locator('p').first().innerText()).trim(),
    sourceLabel: await assistant.locator('.agent-message__meta small').innerText().catch(() => null),
    tools: await assistant.locator('.agent-message__tools span').allTextContents(),
    trace: body.trace ?? null,
    commands: body.commands ?? [],
    revision: body.revision,
    requirements: body.requirements,
  };
  liveTurns.push(reply);
  return reply;
}

function providerIsDeepSeek(reply) {
  return reply.status === 200
    && reply.trace?.source === 'provider'
    && /deepseek/i.test(String(reply.trace?.provider))
    && /deepseek/i.test(String(reply.trace?.model));
}

const live = await openProject();
try {
  const { page, projectId, diagnostics } = live;
  const before = await projectSnapshot(page, projectId);
  record('fresh-project-entry', before.status === 200 && before.body.projectId === projectId && before.body.revision === 0, {
    projectId, revision: before.body.revision, url: page.url().replace(projectId, '<project>'),
  });
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
  record('desktop-real-3d-visible', await page.locator('canvas').first().isVisible().catch(() => false), {
    canvasCount: await page.locator('canvas').count(),
  });

  const first = await sendLivePrompt(page, '下班回家看到客厅还像在工位，我就不想进去。');
  record('held-out-vague-uses-real-deepseek', providerIsDeepSeek(first), {
    reply: first.text, provider: first.trace?.provider, model: first.trace?.model,
    terminationReason: first.trace?.terminationReason, tools: first.trace?.toolCalls?.map(call => call.tool),
  });
  record('held-out-vague-targeted-not-diagnostic', /(?:最不舒服|颜色|照明|工作桌|放松|坐下|进门|待客)/.test(first.text)
      && !/(?:心理问题|情绪障碍|需要治疗)/.test(first.text),
  { reply: first.text });

  const secondInput = finalFlow
    ? '不是心理问题，我只是讨厌现在的冷灰色。工作桌和现有大件必须保留，不要新增大件。我喜欢暖白色，直接做一个可撤销的小调整给我看。'
    : '不是心理问题，我只是讨厌现在的冷灰色。工作桌和现有大件必须保留，不要新增大件。';
  const second = await sendLivePrompt(page, secondInput);
  const secondReq = second.requirements ?? (await projectSnapshot(page, projectId)).body.requirements;
  const hard = listText(secondReq?.hardConstraints);
  const rejected = listText(secondReq?.rejected);
  const preferences = listText(secondReq?.preferences);
  record('correction-and-hard-constraints-structured', providerIsDeepSeek(second)
    && hard.some(value => /工作桌|现有大件/.test(value))
    && hard.some(value => /不.*新增.*大件|不要新增大件/.test(value))
    && [...rejected, ...preferences].some(value => /心理|冷灰|颜色/.test(value)), {
      provider: second.trace?.provider, model: second.trace?.model, hardConstraints: hard,
      rejected, preferences, reply: second.text,
    });

  const third = finalFlow ? second : await sendLivePrompt(page, '我想要偏暖、安静一点，你直接做一个可撤销的小调整给我看。');
  const hasReview = await page.locator('.agent-review').isVisible().catch(() => false);
  const afterPreview = await projectSnapshot(page, projectId);
  const previewObjects = afterPreview.body.versionHistory ? JSON.parse(afterPreview.body.versionHistory).versions.at(-1).scene.objects : [];
  const protectedDeskExists = previewObjects.some(object => /desk/i.test(object.id) || /书桌|工作桌/.test(object.name ?? ''));
  const addedObjectCommand = third.commands.some(command => /add|create/i.test(command.type ?? ''));
  record('preference-produces-reversible-real-preview', providerIsDeepSeek(third) && hasReview && third.commands.length > 0, {
    reply: third.text, provider: third.trace?.provider, model: third.trace?.model,
    commands: third.commands, terminationReason: third.trace?.terminationReason, hasReview,
  });
  record('hard-constraints-preserved-by-preview', hard.length > 0 && protectedDeskExists && !addedObjectCommand
    && !third.commands.some(command => command.type === 'object.delete' && /desk/i.test(command.objectId ?? '')), {
      protectedDeskExists, addedObjectCommand, hardConstraints: hard, commands: third.commands,
    });

  let savedVersionForDiscussion = JSON.parse(before.body.versionHistory).currentVersionId;
  if (hasReview) {
    await page.getByRole('button', { name: '保留这次调整' }).click();
    const saveResponsePromise = page.waitForResponse(response => /\/api\/experience\/projects\/[^/]+\/save$/.test(new URL(response.url()).pathname), { timeout: 30_000 });
    await page.getByRole('button', { name: '保存方案' }).click();
    const saveResponse = await saveResponsePromise;
    const saveBody = await saveResponse.json();
    const savedVersion = JSON.parse(saveBody.versionHistory).currentVersionId;
    savedVersionForDiscussion = savedVersion;
    const savedRevision = saveBody.revision;
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByRole('heading', { name: '我的生活空间' }).waitFor({ timeout: 30_000 });
    const reopened = await projectSnapshot(page, projectId);
    record('keep-save-reopen-same-version', saveResponse.status() === 200
      && reopened.status === 200
      && JSON.parse(reopened.body.versionHistory).currentVersionId === savedVersion
      && reopened.body.revision === savedRevision, {
        savedVersion, savedRevision, reopenedRevision: reopened.body.revision,
        conversationTurns: reopened.body.conversation?.length,
      });
  } else {
    record('keep-save-reopen-same-version', !finalFlow, { blocker: 'No preview was returned by the final design turn; initial saved version remains available for discussion.' });
  }

  if (finalFlow) {
    await page.locator('.project-sidebar__switch summary').click();
    await page.getByRole('button', { name: '切换到家庭意见' }).click();
    await page.getByRole('textbox', { name: '邀请讨论的称呼' }).fill('测试意见填写者');
    const createDiscussionResponse = page.waitForResponse(response => response.request().method() === 'POST'
      && /\/discussions$/.test(new URL(response.url()).pathname), { timeout: 95_000 });
    await page.getByRole('button', { name: '为当前方案发起讨论' }).click();
    const createdResponse = await createDiscussionResponse;
    const createdBody = await createdResponse.json().catch(() => ({}));
    const createdDiscussion = createdBody.discussion;
    record('family-discussion-bound-to-saved-version', createdResponse.status() === 201
      && createdDiscussion?.baseVersionId === savedVersionForDiscussion
      && createdDiscussion?.participants?.[0]?.label === '测试意见填写者', {
      status: createdResponse.status(), discussionId: createdDiscussion?.id,
      baseVersionId: createdDiscussion?.baseVersionId, expectedVersionId: savedVersionForDiscussion,
      participantLabels: createdDiscussion?.participants?.map(participant => participant.label),
      feishuSync: createdDiscussion?.feishuSync,
    });
    record('family-base-write-readback-live', createdDiscussion?.feishuSync?.status === 'synced'
      && createdDiscussion?.opinionSlots?.some(slot => slot.recordId && slot.recordUrl), {
      feishuSync: createdDiscussion?.feishuSync,
      slots: createdDiscussion?.opinionSlots?.map(slot => ({ participantLabel: slot.participantLabel, recordId: slot.recordId, hasRecordUrl: Boolean(slot.recordUrl) })),
    });

    if (createdResponse.ok()) {
      await page.getByRole('textbox', { name: '我的讨论意见' }).fill('【隔离验收】工作桌必须保留，希望视觉更温暖，不要新增大件。');
      const opinionResponsePromise = page.waitForResponse(response => /\/discussions\/[^/]+\/opinions$/.test(new URL(response.url()).pathname), { timeout: 95_000 });
      await page.getByRole('button', { name: '记录我的意见' }).click();
      const opinionResponse = await opinionResponsePromise;
      const opinionBody = await opinionResponse.json().catch(() => ({}));
      record('resident-opinion-keeps-source-and-version', opinionResponse.ok()
        && opinionBody.discussion?.opinions?.some(opinion => opinion.source?.kind === 'product_form'
          && opinion.versionId === savedVersionForDiscussion
          && opinion.text.includes('隔离验收')), {
        status: opinionResponse.status(), opinions: opinionBody.discussion?.opinions?.map(opinion => ({
          versionId: opinion.versionId, sourceKind: opinion.source?.kind, memberLabel: opinion.source?.memberLabel, text: opinion.text,
        })),
      });

      const summaryResponsePromise = page.waitForResponse(response => /\/discussions\/[^/]+\/summarize$/.test(new URL(response.url()).pathname), { timeout: 95_000 });
      await page.getByRole('button', { name: '请飞书 AI 整理意见' }).click();
      const summaryResponse = await summaryResponsePromise;
      const summaryBody = await summaryResponse.json().catch(() => ({}));
      const ailySummary = summaryBody.summary;
      record('real-aily-summary-with-opinion-provenance', summaryResponse.ok()
        && ailySummary?.provider === 'aily'
        && ailySummary?.status === 'ready'
        && ailySummary?.providerTrace?.provider
        && ailySummary?.sourceOpinionIds?.length > 0, {
        status: summaryResponse.status(), error: summaryBody.error,
        provider: ailySummary?.provider, providerTrace: ailySummary?.providerTrace,
        sourceOpinionIds: ailySummary?.sourceOpinionIds,
        groups: ailySummary ? { agreed: ailySummary.agreed, conflicts: ailySummary.conflicts, questions: ailySummary.questions } : null,
      });

      if (summaryResponse.ok() && await page.locator('.experience-discussion__summary input[type="checkbox"]').count()) {
        await page.locator('.experience-discussion__summary input[type="checkbox"]').first().check();
        const beforeAssistantCount = await page.locator('.agent-message[data-role="assistant"]:not([data-busy="true"])').count();
        const adoptResponsePromise = page.waitForResponse(response => /\/discussions\/[^/]+\/adopt$/.test(new URL(response.url()).pathname), { timeout: 95_000 });
        const adoptionTurnPromise = page.waitForResponse(response => /\/api\/experience\/projects\/[^/]+\/turn$/.test(new URL(response.url()).pathname), { timeout: 115_000 });
        await page.getByRole('button', { name: '将选中意见带回设计助理' }).click();
        const [adoptResponse, adoptionTurnResponse] = await Promise.all([adoptResponsePromise, adoptionTurnPromise]);
        const adoptionBody = await adoptResponse.json().catch(() => ({}));
        const adoptionTurnBody = await adoptionTurnResponse.json().catch(() => ({}));
        await page.waitForFunction(count => document.querySelectorAll('.agent-message[data-role="assistant"]:not([data-busy="true"])').length > count, beforeAssistantCount, { timeout: 115_000 });
        liveTurns.push({
          input: adoptionBody.adoption?.adjustmentRequest ?? '家庭讨论采纳回流', status: adoptionTurnResponse.status(),
          text: adoptionTurnBody.trace?.assistantReply ?? '', sourceLabel: '家庭意见回流', tools: [], trace: adoptionTurnBody.trace,
          commands: adoptionTurnBody.commands ?? [], revision: adoptionTurnBody.revision, requirements: adoptionTurnBody.requirements,
        });
        const adoptionPreview = await page.locator('.agent-review').isVisible().catch(() => false);
        record('selected-family-item-returns-through-same-harness', adoptResponse.ok()
          && providerIsDeepSeek(liveTurns.at(-1))
          && adoptionTurnBody.trace?.input?.includes('已保存版本')
          && adoptionPreview, {
          adoptStatus: adoptResponse.status(), turnStatus: adoptionTurnResponse.status(),
          provider: adoptionTurnBody.trace?.provider, model: adoptionTurnBody.trace?.model,
          terminationReason: adoptionTurnBody.trace?.terminationReason, commands: adoptionTurnBody.commands,
          adoptionPreview,
        });
        if (adoptionPreview) {
          await page.getByRole('button', { name: '保留这次调整' }).click();
          const outcomeResponsePromise = page.waitForResponse(response => /\/discussions\/[^/]+\/outcome$/.test(new URL(response.url()).pathname), { timeout: 35_000 });
          const saveResponsePromise = page.waitForResponse(response => /\/api\/experience\/projects\/[^/]+\/save$/.test(new URL(response.url()).pathname), { timeout: 35_000 });
          await page.getByRole('button', { name: '保存方案' }).click();
          const [outcomeResponse, familySaveResponse] = await Promise.all([outcomeResponsePromise, saveResponsePromise]);
          const outcomeBody = await outcomeResponse.json().catch(() => ({}));
          const familySaveBody = await familySaveResponse.json().catch(() => ({}));
          record('family-adoption-saves-new-linked-version', outcomeResponse.ok() && familySaveResponse.ok()
            && outcomeBody.discussion?.outcomeVersionId === JSON.parse(familySaveBody.versionHistory).currentVersionId
            && outcomeBody.discussion?.baseVersionId === savedVersionForDiscussion, {
            saveStatus: familySaveResponse.status(), outcomeStatus: outcomeResponse.status(),
            baseVersionId: outcomeBody.discussion?.baseVersionId,
            outcomeVersionId: outcomeBody.discussion?.outcomeVersionId,
            savedVersionId: familySaveBody.versionHistory ? JSON.parse(familySaveBody.versionHistory).currentVersionId : null,
          });
        } else record('family-adoption-saves-new-linked-version', false, { blocker: 'Adopted item did not produce a legal preview.' });
      } else {
        record('selected-family-item-returns-through-same-harness', false, { blocker: summaryBody.error ?? 'Aily summary produced no selectable items.' });
        record('family-adoption-saves-new-linked-version', false, { blocker: summaryBody.error ?? 'No selectable Aily summary.' });
      }
    }
    await page.screenshot({ path: `${outputDir}/family-flow.png`, fullPage: false });
  }

  await page.screenshot({ path: `${outputDir}/live-desktop.png`, fullPage: false });
  record('live-console-health', diagnostics.consoleErrors.length === 0 && diagnostics.pageErrors.length === 0, diagnostics);

  const otherContext = await freshContext();
  try {
    const other = await openProject({ context: otherContext });
    record('fresh-session-project-isolation', other.projectId !== projectId, { firstProjectId: projectId, secondProjectId: other.projectId });
    const forbidden = await other.page.evaluate(async id => {
      const response = await fetch(`/api/experience/projects/${encodeURIComponent(id)}`);
      return { status: response.status, body: await response.json() };
    }, projectId);
    record('cross-session-token-required', forbidden.status === 403 && forbidden.body.error === 'PROJECT_ACCESS_DENIED', {
      status: forbidden.status, error: forbidden.body.error,
    });
  } finally { await otherContext.close(); }
} finally {
  await live.context.close();
}

const offlineContext = await freshContext();
await offlineContext.route(/\/api\/experience\/projects\/[^/]+\/turn$/, route => route.fulfill({
  status: 503,
  contentType: 'application/json',
  body: JSON.stringify({ error: 'QA_OFFLINE_PROVIDER', message: '本次操作未完成；已保存的方案保持不变。' }),
}));
try {
  const offline = await openProject({ context: offlineContext });
  const before = await projectSnapshot(offline.page, offline.projectId);
  await offline.page.getByRole('textbox', { name: '告诉 Agent 你的设计需求' }).fill('把客厅全部改了');
  await offline.page.getByRole('button', { name: '发送给 Agent' }).click();
  await offline.page.getByText('这次设计请求未完成，可以重试。 房屋没有被修改。').waitFor({ timeout: 15_000 });
  const after = await projectSnapshot(offline.page, offline.projectId);
  record('offline-failure-is-explicit-and-atomic', sceneHash(before.body.versionHistory) === sceneHash(after.body.versionHistory)
    && before.body.revision === after.body.revision, {
      beforeRevision: before.body.revision, afterRevision: after.body.revision,
      visibleMessage: '这次设计请求未完成，可以重试。 房屋没有被修改。',
    });
} finally { await offlineContext.close(); }

const mobileContext = await freshContext({ width: 390, height: 844 });
try {
  const mobile = await openProject({ context: mobileContext });
  const gate = mobile.page.getByRole('button', { name: '进入实时 3D' });
  if (await gate.isVisible().catch(() => false)) await gate.click();
  await mobile.page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
  const layout = await mobile.page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    canvasVisible: Boolean([...document.querySelectorAll('canvas')].find(node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0)),
  }));
  record('mobile-entry-real-3d-no-overflow', layout.canvasVisible && layout.scrollWidth <= layout.clientWidth + 1, layout);
  await mobile.page.screenshot({ path: `${outputDir}/mobile.png`, fullPage: false });
} finally { await mobileContext.close(); }

await browser.close();

const sanitizeTurn = turn => ({
  input: turn.input,
  status: turn.status,
  text: turn.text,
  sourceLabel: turn.sourceLabel,
  tools: turn.tools,
  revision: turn.revision,
  commands: turn.commands,
  trace: turn.trace,
  requirements: turn.requirements,
});
const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browser: 'regular Playwright isolated BrowserContext',
  maxLiveTurns,
  liveTurnCount: liveTurns.length,
  results,
  liveTurns: liveTurns.map(sanitizeTurn),
  totals: { total: results.length, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length },
};
await writeFile(`${outputDir}/result.json`, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (summary.totals.failed) process.exitCode = 1;
