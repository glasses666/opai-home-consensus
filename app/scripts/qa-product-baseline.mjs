#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const playwrightModule = process.env.OPAI_PLAYWRIGHT_MODULE
  ?? '/Users/dracoglasser/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightModule));

const baseUrl = process.env.OPAI_QA_URL ?? 'http://127.0.0.1:5180';
const outputDir = process.env.OPAI_QA_OUTPUT ?? '/tmp/opai-product-qa';
const strict = process.argv.includes('--strict');
await mkdir(outputDir, { recursive: true });

const results = [];
const record = (id, passed, details = {}) => results.push({ id, passed, ...details });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function freshContext(viewport = { width: 1440, height: 1000 }) {
  // Every Playwright BrowserContext has a fresh cookie/localStorage partition.
  // Keeping that partition intact across reloads is required for save/reopen QA.
  return browser.newContext({ viewport, locale: 'zh-CN' });
}

async function openWorkbench({ viewport, interceptAgent = true } = {}) {
  const context = await freshContext(viewport);
  if (interceptAgent) {
    await context.route(/\/api\/(?:agent\/turn|experience\/projects\/[^/]+\/turn)(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'QA_OFFLINE_PROVIDER' }),
      });
    });
  }
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.goto(`${baseUrl}/project/demo?style=agent-canvas`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  try {
    await page.getByRole('heading', { name: '\u57ce\u5e02\u4e09\u53e3\u4e4b\u5bb6' }).waitFor({ timeout: 30_000 });
  } catch (error) {
    const diagnostics = {
      url: page.url(),
      body: (await page.locator('body').innerText().catch(() => '')).slice(0, 1000),
      consoleErrors,
      pageErrors,
      failedRequests: failedRequests.slice(0, 20),
    };
    await page.screenshot({ path: `${outputDir}/entry-failure.png`, fullPage: false }).catch(() => {});
    throw new Error(`WORKBENCH_ENTRY_FAILED ${JSON.stringify(diagnostics)}`, { cause: error });
  }
  return { context, page, consoleErrors, pageErrors, failedRequests };
}

async function sendPrompt(page, input) {
  const userMessages = page.locator('.agent-message[data-role="user"]');
  const assistantMessages = page.locator('.agent-message[data-role="assistant"]:not([data-busy="true"])');
  const beforeUsers = await userMessages.count();
  const beforeAssistants = await assistantMessages.count();
  const composer = page.getByRole('textbox', { name: '\u544a\u8bc9 Agent \u4f60\u7684\u8bbe\u8ba1\u9700\u6c42' });
  await composer.fill(input);
  await page.getByRole('button', { name: '\u53d1\u9001\u7ed9 Agent' }).click();
  await page.waitForFunction(
    ({ users, assistants }) => document.querySelectorAll('.agent-message[data-role="user"]').length > users
      && document.querySelectorAll('.agent-message[data-role="assistant"]:not([data-busy="true"])').length > assistants,
    { users: beforeUsers, assistants: beforeAssistants },
    { timeout: 45_000 },
  );
  const last = assistantMessages.last();
  return {
    text: (await last.locator('p').innerText()).trim(),
    source: (await last.locator('.agent-message__meta small').count())
      ? (await last.locator('.agent-message__meta small').innerText()).trim()
      : null,
    tools: await last.locator('.agent-message__tools span').allTextContents(),
  };
}

const desktop = await openWorkbench();
try {
  const { page } = desktop;
  const title = await page.title();
  const mainText = (await page.locator('main.project-demo').innerText()).slice(0, 1200);
  record('page-identity', page.url().startsWith(`${baseUrl}/project/demo`) && title.length > 0, { url: page.url(), title });
  record('meaningful-screen', mainText.includes('\u57ce\u5e02\u4e09\u53e3\u4e4b\u5bb6') && mainText.includes('\u8bbe\u8ba1\u52a9\u7406'), { excerpt: mainText.slice(0, 240) });
  record('no-framework-overlay', await page.locator('vite-error-overlay, nextjs-portal').count() === 0);

  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
  record('desktop-real-3d-visible', await canvas.isVisible().catch(() => false), { canvasCount: await page.locator('canvas').count() });
  await page.screenshot({ path: `${outputDir}/baseline-desktop.png`, fullPage: false });
  record('desktop-console-health', desktop.consoleErrors.length === 0 && desktop.pageErrors.length === 0, {
    consoleErrors: desktop.consoleErrors,
    pageErrors: desktop.pageErrors,
    failedRequests: desktop.failedRequests.slice(0, 12),
  });
} finally {
  await desktop.context.close();
}

const vagueCases = [
  {
    id: 'vague-discomfort-targeted-question',
    input: '\u8fd9\u4e2a\u5ba2\u5385\u8ba9\u6211\u4e0d\u60f3\u5f85',
    acceptable: (reply) => /\uff1f|\?|\u4f60\u66f4|\u6700\u56f0\u6270|\u4ec0\u4e48\u65f6\u5019|\u54ea\u4e2a/.test(reply.text),
  },
  {
    id: 'vague-premium-targeted-question',
    input: '\u60f3\u9ad8\u7ea7\u4e00\u70b9\u4f46\u8bf4\u4e0d\u4e0a\u6765',
    acceptable: (reply) => /\uff1f|\?|\u4f60\u66f4|\u54ea\u79cd|\u4f11\u606f|\u5f85\u5ba2|\u5ba1\u7f8e/.test(reply.text),
  },
  {
    id: 'goal-based-workday-targeted-question',
    input: '\u4e0b\u73ed\u4e86\u8fd8\u50cf\u5750\u5728\u5de5\u4f4d',
    acceptable: (reply) => /\uff1f|\?|\u5de5\u4f5c|\u653e\u677e|\u4f11\u606f|\u684c|\u706f/.test(reply.text) && !/2D \/ 3D \u672a\u4fee\u6539/.test(reply.text),
  },
];

for (const candidate of vagueCases) {
  const run = await openWorkbench();
  try {
    const reply = await sendPrompt(run.page, candidate.input);
    record(candidate.id, candidate.acceptable(reply), { input: candidate.input, reply });
  } finally {
    await run.context.close();
  }
}

const correction = await openWorkbench();
try {
  const first = await sendPrompt(correction.page, '\u4e0b\u73ed\u4e86\u8fd8\u50cf\u5750\u5728\u5de5\u4f4d');
  const second = await sendPrompt(correction.page, '\u6ca1\u6709\u5fc3\u7406\u539f\u56e0\uff0c\u6211\u53ea\u662f\u4e0d\u559c\u6b22\u73b0\u5728\u7684\u989c\u8272');
  const brief = await correction.page.evaluate(() => {
    const raw = localStorage.getItem('oppein.project-demo.design-brief.v1');
    return raw ? JSON.parse(raw) : null;
  });
  const serializedBrief = JSON.stringify(brief ?? {});
  record('correction-updates-state', /\u989c\u8272|\u8272\u5f69|\u98ce\u683c/.test(second.text + serializedBrief)
    && !/\u5fc3\u7406/.test(serializedBrief), { first, second, brief });
} finally {
  await correction.context.close();
}

const constraint = await openWorkbench();
try {
  const first = await sendPrompt(constraint.page, '\u5de5\u4f5c\u684c\u5fc5\u987b\u4fdd\u7559\uff0c\u4e0d\u65b0\u589e\u5927\u4ef6');
  const briefBeforeReload = await constraint.page.evaluate(() => {
    const raw = localStorage.getItem('oppein.project-demo.design-brief.v1');
    return raw ? JSON.parse(raw) : null;
  });
  await constraint.page.reload({ waitUntil: 'domcontentloaded' });
  await constraint.page.getByRole('heading', { name: '\u57ce\u5e02\u4e09\u53e3\u4e4b\u5bb6' }).waitFor();
  const briefAfterReload = await constraint.page.evaluate(() => {
    const raw = localStorage.getItem('oppein.project-demo.design-brief.v1');
    return raw ? JSON.parse(raw) : null;
  });
  const hard = briefAfterReload?.hardConstraints ?? [];
  record('hard-constraint-persists', hard.some((item) => /\u5de5\u4f5c\u684c|\u4e66\u684c/.test(item))
    && hard.some((item) => /\u4e0d\u65b0\u589e\u5927\u4ef6|\u5927\u4ef6/.test(item)), { reply: first, briefBeforeReload, briefAfterReload });
} finally {
  await constraint.context.close();
}

const exact = await openWorkbench();
try {
  const reply = await sendPrompt(exact.page, '\u6c99\u53d1\u5411\u53f3\u79fb\u52a820\u5398\u7c73');
  const review = exact.page.locator('.agent-review');
  const hasPreview = await review.isVisible().catch(() => false);
  record('exact-command-real-preview', hasPreview && /\u9884\u89c8|\u79fb\u52a8/.test(reply.text), { reply, hasPreview });
  if (hasPreview) {
    await review.getByRole('button', { name: '\u64a4\u9500\u9884\u89c8' }).click();
    const status = (await exact.page.locator('.project-edit__feedback').innerText()).trim();
    record('preview-undo-visible', /\u64a4\u9500/.test(status), { status });
  } else {
    record('preview-undo-visible', false, { reason: 'no preview to undo' });
  }
  await exact.page.screenshot({ path: `${outputDir}/baseline-exact-command.png`, fullPage: false });
} finally {
  await exact.context.close();
}

const mobile = await openWorkbench({ viewport: { width: 390, height: 844 } });
try {
  const { page } = mobile;
  const enter3d = page.getByRole('button', { name: '\u8fdb\u5165\u5b9e\u65f6 3D' }).first();
  const hadLightweightGate = await enter3d.isVisible().catch(() => false);
  if (hadLightweightGate) await enter3d.click();
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  record('mobile-entry-and-3d', await page.locator('canvas').first().isVisible().catch(() => false), { hadLightweightGate, layout });
  record('mobile-no-horizontal-overflow', layout.scrollWidth <= layout.clientWidth + 1, layout);
  record('mobile-console-health', mobile.consoleErrors.length === 0 && mobile.pageErrors.length === 0, {
    consoleErrors: mobile.consoleErrors,
    pageErrors: mobile.pageErrors,
    failedRequests: mobile.failedRequests.slice(0, 12),
  });
  await page.screenshot({ path: `${outputDir}/baseline-mobile.png`, fullPage: false });
} finally {
  await mobile.context.close();
}

await browser.close();

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  browserPath: 'regular Playwright (Browser plugin not available)',
  paidProviderCalls: 0,
  total: results.length,
  passed: results.filter((item) => item.passed).length,
  failed: results.filter((item) => !item.passed).length,
  results,
};
await writeFile(`${outputDir}/baseline.json`, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && summary.failed) process.exitCode = 1;
