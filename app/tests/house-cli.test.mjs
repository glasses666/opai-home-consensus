import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import { runAgentTurn } from '../src/agent/harness.js';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { createSceneStore, serializeScene } from '../src/domain/scene.js';
import {
  applyAgentProposal,
  compareHouseTreeVersions,
  initializeHouseTree,
  readHouseTree,
  renderHouseTree,
  saveAgentProposal,
  sceneHash,
  validateHouseTree,
} from '../src/cli/house-tree.js';

const execFileAsync = promisify(execFile);

test('house tree round-trips the canonical scene and exposes every coordinate domain', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oppein-house-tree-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scene = createDemoScene();
  await initializeHouseTree(root, scene, { now: () => '2026-08-12T00:00:00.000Z' });

  const current = await readHouseTree(root);
  assert.equal(serializeScene(current.scene), serializeScene(scene));
  const validation = await validateHouseTree(root);
  assert.deepEqual(
    { rooms: validation.rooms, walls: validation.walls, floors: validation.floors, ceilings: validation.ceilings },
    {
      rooms: scene.rooms.length,
      walls: scene.surfaces.filter((surface) => surface.kind === 'wall').length,
      floors: scene.rooms.length,
      ceilings: scene.rooms.length,
    },
  );
  const tree = renderHouseTree(current.scene, { versionId: current.versionId, roomId: 'room-living-dining' });
  assert.match(tree, /X\[0,11000\] Y\[0,2800\] Z\[0,8000\]/);
  assert.match(tree, /surface-floor-living-dining/);
  assert.match(tree, /surface-wall-living-south · U\[0,7600\] V\[0,2800\]/);
  assert.match(tree, /object-sofa · global\(2200,0,5600\) · room\(2200,0,2400\)/);
});

test('agent proposal leaves current untouched until an atomic apply creates a new version', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oppein-house-proposal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scene = createDemoScene();
  await initializeHouseTree(root, scene);
  const base = await readHouseTree(root);
  const baseStore = createSceneStore(base.scene);
  const turn = await runAgentTurn({ store: baseStore, input: '把沙发向右移动20厘米' });
  const proposal = await saveAgentProposal(root, {
    id: 'proposal-sofa-move',
    baseVersionId: base.versionId,
    baseSceneSha256: sceneHash(base.scene),
    input: '把沙发向右移动20厘米',
    provider: 'local',
    commands: turn.store.commands.slice(baseStore.cursor),
    trace: turn.trace,
  });

  assert.equal((await readHouseTree(root)).scene.objects.find((object) => object.id === 'object-sofa').transform.x, 2200);
  const applied = await applyAgentProposal(root, proposal.id, { now: () => '2026-08-12T00:01:00.000Z' });
  assert.equal(applied.versionId, 'v0002');
  assert.equal((await readHouseTree(root)).scene.objects.find((object) => object.id === 'object-sofa').transform.x, 2400);
  assert.equal((await readHouseTree(root, 'v0001')).scene.objects.find((object) => object.id === 'object-sofa').transform.x, 2200);
  const diff = await compareHouseTreeVersions(root, 'v0001', 'v0002');
  assert.deepEqual(diff.objectDiffs.map(({ kind, objectId }) => ({ kind, objectId })), [{ kind: 'transform', objectId: 'object-sofa' }]);
  await assert.rejects(() => applyAgentProposal(root, proposal.id), /PROPOSAL_NOT_PENDING/);
});

test('CLI runs without loading the browser editor', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oppein-house-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('../scripts/home-cli.mjs', import.meta.url));
  await execFileAsync(process.execPath, [cli, 'init', '--root', root]);
  const { stdout } = await execFileAsync(process.execPath, [cli, 'tree', '--room', 'room-primary-bedroom', '--root', root]);
  assert.match(stdout, /Primary Bedroom/);
  assert.match(stdout, /object-primary-bed/);
  assert.doesNotMatch(stdout, /Open Living Dining/);
  await execFileAsync(process.execPath, [cli, 'edit', 'object-sofa', 'move', '--dx', '100', '--apply', '--root', root]);
  const shown = await execFileAsync(process.execPath, [cli, 'show', 'object-sofa', '--root', root]);
  assert.equal(JSON.parse(shown.stdout).transform.x, 2300);
  await assert.rejects(
    () => execFileAsync(process.execPath, [cli, 'edit', 'object-primary-wardrobe', 'move', '--dx', '100', '--root', root]),
    /OBJECT_NOT_MOVABLE/,
  );
});

test('CLI research exposes cited style evidence without initializing a house tree', async () => {
  const cli = fileURLToPath(new URL('../scripts/home-cli.mjs', import.meta.url));
  const { stdout } = await execFileAsync(process.execPath, [cli, 'research', '小户型北欧风但收纳不能少', '--json']);
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'ready');
  assert.equal(result.results[0].styleId, 'scandinavian');
  assert.ok(result.results.every(({ citation }) => citation.url.startsWith('https://')));

  const blocked = JSON.parse((await execFileAsync(process.execPath, [cli, 'research', '根据案例给出精确每平方造价', '--json'])).stdout);
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.results, []);
});
