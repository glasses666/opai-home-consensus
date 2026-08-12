#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { runAgentTurn } from '../src/agent/harness.js';
import { callAily } from '../server/feishu.mjs';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createDesignBrief } from '../src/domain/design-brief.js';
import { retrieveStyleCases } from '../src/catalog/style-retrieval.js';
import { createSceneStore, deserializeScene, dispatchSceneCommand } from '../src/domain/scene.js';
import {
  applyAgentProposal,
  compareHouseTreeVersions,
  createTreeVersionHistory,
  initializeHouseTree,
  inspectTreeEntity,
  readDesignBrief,
  readHouseTree,
  renderHouseTree,
  saveAgentProposal,
  saveDesignBrief,
  sceneHash,
  validateHouseTree,
} from '../src/cli/house-tree.js';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultRoot = process.env.OPPEIN_HOME_TREE ?? join(appRoot, '.data', 'house-cli');
const help = `欧派房屋 CLI（无渲染）

用法：
  home init [--scene scene.json] [--root path]
  home tree [--room room-id] [--json] [--root path]
  home show <entity-id> [--root path]
  home validate [--root path]
  home research <风格、房间或家庭需求> [--json]
  home edit <entity-id> move [--x mm] [--z mm] [--dx mm] [--dz mm] [--apply]
  home edit <object-id> rotate --deg number [--apply]
  home edit <object-id> resize [--width mm] [--depth mm] [--height mm] [--apply]
  home edit <entity-id> material <material-id> [--apply]
  home agent <自然语言> [--selected id] [--room id] [--aily] [--apply] [--json] [--root path]
  home apply <proposal-id|latest> [--json] [--root path]
  home diff <before-version> [after-version] [--json] [--root path]
`;

const options = {
  root: { type: 'string', default: defaultRoot },
  scene: { type: 'string' },
  room: { type: 'string' },
  selected: { type: 'string' },
  x: { type: 'string' },
  z: { type: 'string' },
  dx: { type: 'string' },
  dz: { type: 'string' },
  deg: { type: 'string' },
  width: { type: 'string' },
  depth: { type: 'string' },
  height: { type: 'string' },
  aily: { type: 'boolean', default: false },
  apply: { type: 'boolean', default: false },
  json: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
};

function output(value, json = false) {
  if (typeof value === 'string' && !json) console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}

function numberOption(values, key, { integer = true } = {}) {
  if (values[key] === undefined) return undefined;
  const value = Number(values[key]);
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) throw new Error(`ARG_INVALID: --${key}`);
  return value;
}

async function main(argv) {
  const command = argv[0];
  const { values, positionals } = parseArgs({ args: argv.slice(1), allowPositionals: true, options, strict: true });
  const root = resolve(values.root);
  if (!command || values.help) {
    console.log(help);
    return;
  }

  if (command === 'init') {
    const scene = values.scene
      ? deserializeScene(await readFile(resolve(values.scene), 'utf8'))
      : createDemoScene();
    output(await initializeHouseTree(root, scene), values.json);
    return;
  }

  if (command === 'tree') {
    const current = await readHouseTree(root);
    output(values.json ? current.scene : renderHouseTree(current.scene, { versionId: current.versionId, roomId: values.room ?? null }), values.json);
    return;
  }

  if (command === 'show') {
    if (positionals.length !== 1) throw new Error('USAGE: home show <entity-id>');
    const current = await readHouseTree(root);
    output(inspectTreeEntity(current.scene, positionals[0]), true);
    return;
  }

  if (command === 'validate') {
    output(await validateHouseTree(root), true);
    return;
  }

  if (command === 'research') {
    const input = positionals.join(' ').trim();
    if (!input) throw new Error('USAGE: home research <需求>');
    const result = retrieveStyleCases(input, { limit: 4 });
    output(values.json ? result : [
      `检索：${result.status}${result.boundary ? ` · ${result.boundary}` : ''}`,
      result.message,
      ...result.results.flatMap((item, index) => [
        `${index + 1}. ${item.title} · ${item.styleId} · ${item.context.dwellingType}`,
        `   命中：${item.matched.join(' · ') || '文本相似'}`,
        `   可用：${item.evidence.applicability.join('；')}`,
        `   风险：${item.evidence.risks.join('；')}`,
        `   来源：${item.citation.url}`,
      ]),
    ].join('\n'), values.json);
    return;
  }

  if (command === 'edit') {
    const [entityId, action, materialId] = positionals;
    if (!entityId || !action) throw new Error('USAGE: home edit <entity-id> <move|rotate|resize|material>');
    const current = await readHouseTree(root);
    const object = current.scene.objects.find((candidate) => candidate.id === entityId);
    const surface = current.scene.surfaces.find((candidate) => candidate.id === entityId);
    let commandValue;
    if (action === 'move') {
      if (!object) throw new Error(`OBJECT_NOT_FOUND: ${entityId}`);
      const x = numberOption(values, 'x');
      const z = numberOption(values, 'z');
      const dx = numberOption(values, 'dx');
      const dz = numberOption(values, 'dz');
      if ([x, z, dx, dz].every((value) => value === undefined)) throw new Error('ARG_INVALID: move requires --x/--z or --dx/--dz');
      commandValue = { type: 'object.setTransform', objectId: entityId, transform: { x: x ?? object.transform.x + (dx ?? 0), z: z ?? object.transform.z + (dz ?? 0) } };
    } else if (action === 'rotate') {
      if (!object) throw new Error(`OBJECT_NOT_FOUND: ${entityId}`);
      const degreeValue = numberOption(values, 'deg', { integer: false });
      if (degreeValue === undefined) throw new Error('ARG_INVALID: rotate requires --deg');
      commandValue = { type: 'object.setTransform', objectId: entityId, transform: { rotationY: object.transform.rotationY + degreeValue * Math.PI / 180 } };
    } else if (action === 'resize') {
      if (!object) throw new Error(`OBJECT_NOT_FOUND: ${entityId}`);
      const dimensions = Object.fromEntries(['width', 'depth', 'height'].map((key) => [key, numberOption(values, key)]).filter(([, value]) => value !== undefined));
      if (!Object.keys(dimensions).length) throw new Error('ARG_INVALID: resize requires --width/--depth/--height');
      commandValue = { type: 'object.setDimensions', objectId: entityId, dimensions };
    } else if (action === 'material') {
      if (!materialId) throw new Error('ARG_INVALID: material id required');
      if (!object && !surface) throw new Error(`ENTITY_NOT_FOUND: ${entityId}`);
      commandValue = object
        ? { type: 'object.setMaterial', objectId: entityId, materialId }
        : { type: 'surface.setMaterial', surfaceId: entityId, materialId };
    } else {
      throw new Error(`EDIT_ACTION_UNKNOWN: ${action}`);
    }
    const checked = createSceneStore(current.scene);
    const next = dispatchSceneCommand(checked, commandValue);
    const proposal = await saveAgentProposal(root, {
      baseVersionId: current.versionId,
      baseSceneSha256: sceneHash(current.scene),
      input: `manual:${action}:${entityId}`,
      provider: 'manual',
      commands: next.commands,
      trace: { source: 'manual', toolCalls: [], steps: [{ ok: true, command: commandValue }], rolledBack: false },
    });
    const applied = values.apply ? await applyAgentProposal(root, proposal.id) : null;
    output(values.json ? { proposal, applied } : applied ? `已应用 ${proposal.id} → ${applied.versionId}` : `提案：${proposal.id}\n应用：home apply ${proposal.id}`, values.json);
    return;
  }

  if (command === 'agent') {
    const input = positionals.join(' ').trim();
    if (!input) throw new Error('USAGE: home agent <自然语言>');
    const current = await readHouseTree(root);
    const versionHistory = await createTreeVersionHistory(root);
    const currentBrief = await readDesignBrief(root) ?? createDesignBrief();
    let provider = null;
    if (values.aily) {
      if (!process.env.AILY_AGENT_ID && !process.env.AILY_APP_ID) throw new Error('AILY_AGENT_ID_MISSING');
      provider = (context) => callAily(context, {
        agentId: process.env.AILY_AGENT_ID,
        appId: process.env.AILY_APP_ID,
        timeoutMs: 35_000,
        maxAttempts: 1,
      });
    }
    const baseStore = createSceneStore(current.scene);
    const result = await runAgentTurn({
      store: baseStore,
      input,
      selectedObjectId: values.selected ?? null,
      activeRoomId: values.room ?? null,
      provider,
      versionHistory,
      designBrief: currentBrief,
      timeoutMs: values.aily ? 38_000 : 1_500,
    });
    const commands = result.store.commands.slice(baseStore.cursor);
    const proposal = await saveAgentProposal(root, {
      baseVersionId: current.versionId,
      baseSceneSha256: sceneHash(current.scene),
      input,
      selectedObjectId: values.selected ?? null,
      activeRoomId: values.room ?? null,
      provider: result.trace.source === 'provider' ? 'aily' : 'local',
      commands,
      trace: result.trace,
    });
    await saveDesignBrief(root, result.trace.designBrief);
    const applied = values.apply && commands.length ? await applyAgentProposal(root, proposal.id) : null;
    output(values.json ? { proposal, applied } : [
      `提案：${proposal.id} · ${proposal.provider} · ${commands.length} 条命令`,
      result.trace.assistantReply || 'Harness 未生成解释文本。',
      ...commands.map((entry) => `  ${JSON.stringify(entry)}`),
      applied ? `已应用：${applied.versionId}` : commands.length ? `应用：home apply ${proposal.id}` : '场景未改变。',
    ].join('\n'), values.json);
    return;
  }

  if (command === 'apply') {
    if (positionals.length !== 1) throw new Error('USAGE: home apply <proposal-id|latest>');
    const result = await applyAgentProposal(root, positionals[0]);
    output(values.json ? result : `已应用 ${result.proposalId} → ${result.versionId}`, values.json);
    return;
  }

  if (command === 'diff') {
    if (positionals.length < 1 || positionals.length > 2) throw new Error('USAGE: home diff <before-version> [after-version]');
    const result = await compareHouseTreeVersions(root, positionals[0], positionals[1] ?? null);
    output(result, true);
    return;
  }

  throw new Error(`COMMAND_UNKNOWN: ${command}`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
