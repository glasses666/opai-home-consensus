// Controlled replay: read a local snapshot without writing its project or printing credentials.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { callDesignDeepSeek } from '../server/deepseek.mjs';
import { runDesignDialogue, emptyRequirements } from '../src/agent/dialogue.js';
import { deserializeVersionHistory, sceneStoreForVersion } from '../src/domain/design-version.js';

if (process.argv.includes('--existing-opai-provider')) {
  const output = execFileSync('ssh', ['-o', 'BatchMode=yes', 'ailcloud-esc',
    `python3 -c 'import json; print(json.dumps({k:v for k,v in (l.strip().split("=",1) for l in open("/opt/opai/shared/app.env") if l.startswith("DEEPSEEK_"))}))'`],
  { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'inherit'] });
  for (const [key, value] of Object.entries(JSON.parse(output))) if (key.startsWith('DEEPSEEK_')) process.env[key] = value;
}
const snapshotPath = process.argv[process.argv.indexOf('--snapshot') + 1];
if (!process.argv.includes('--snapshot') || !snapshotPath) throw Error('Provide --snapshot PATH');
const snapshot = readFileSync(snapshotPath);
const project = JSON.parse(snapshot);
const conversation = project.conversation;
const lastUserIndex = conversation.findLastIndex(message => message.role === 'user');
if (lastUserIndex < 0) throw Error('NO_USER_TURN');
const prior = conversation.slice(0, lastUserIndex);
const requirements = prior.findLast(message => message.role === 'assistant')?.trace?.requirements ?? emptyRequirements();
const versionHistory = deserializeVersionHistory(project.versionHistory);
const store = sceneStoreForVersion(versionHistory);
const results = [];
for (const thinking of ['disabled', 'enabled']) {
  const promptHashes = [];
  const started = Date.now();
  try {
    const result = await runDesignDialogue({
      store: structuredClone(store), requirements: structuredClone(requirements), conversation: structuredClone(prior),
      input: conversation[lastUserIndex].text,
      selectedObjectId: 'surface-floor-living-dining', activeRoomId: 'room-living-dining',
      projectId: project.projectId, houseId: project.houseId, versionHistory, designBrief: project.designBrief,
      requestId: 'reasoning-controlled-replay',
      provider: context => {
        promptHashes.push(createHash('sha256').update(context.prompt).digest('hex'));
        return callDesignDeepSeek(context, { thinking, reasoningEffort: 'high' });
      },
    });
    results.push({ thinking, elapsedMs: Date.now() - started, promptHashes,
      reply: result.trace.assistantReply, terminationReason: result.trace.terminationReason,
      modelRequests: result.trace.modelRequests, steps: result.trace.steps,
      changedScene: JSON.stringify(result.store.currentScene) !== JSON.stringify(store.currentScene),
      validationFeedback: result.trace.validationFeedback,
    });
  } catch (error) {
    results.push({ thinking, elapsedMs: Date.now() - started, promptHashes, error: error.message });
  }
}
const checks = {
  bothCompleted: results.length === 2 && results.every(result => !result.error),
  sameInitialPrompt: !!results[0]?.promptHashes[0] && results[0].promptHashes[0] === results[1]?.promptHashes[0],
  bothActualDeepSeek: results.every(result => result.modelRequests?.length > 0
    && result.modelRequests.every(request => request.providerTrace?.provider === 'deepseek')),
  enabledObserved: results.find(result => result.thinking === 'enabled')?.modelRequests?.some(request =>
    request.providerTrace?.parameters?.thinking === 'enabled' && request.providerTrace?.reasoning?.observed === true) ?? false,
  disabledObserved: results.find(result => result.thinking === 'disabled')?.modelRequests?.every(request =>
    request.providerTrace?.parameters?.thinking === 'disabled' && request.providerTrace?.reasoning?.observed === false) ?? false,
  sourceProjectUnchanged: readFileSync(snapshotPath).equals(snapshot),
};
const experimentValid = Object.values(checks).every(Boolean);
console.log(JSON.stringify({
  suite: 'reasoning-same-dialogue-ab', at: new Date().toISOString(),
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries(['server/deepseek.mjs', 'src/agent/dialogue.js'].map(path => [path, createHash('sha256').update(readFileSync(new URL('../' + path, import.meta.url))).digest('hex')])),
  snapshotHash: createHash('sha256').update(snapshot).digest('hex'),
  experimentValid, checks,
  input: conversation[lastUserIndex].text, results,
}, null, 2));
// Experiment validity is not a judgment that reasoning improved the reply.
if (!experimentValid) process.exitCode = 1;
