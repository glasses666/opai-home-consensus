import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

import { compareSceneVersions } from '../domain/design-version.js';
import {
  assertValidScene,
  createSceneStore,
  deserializeScene,
  dispatchSceneCommand,
  serializeScene,
} from '../domain/scene.js';

const FORMAT = 'oppein-house-tree';
const FORMAT_VERSION = 1;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const RECORD_KEYS = ['rooms', 'surfaces', 'openings', 'objects', 'materials', 'rules', 'cameraPresets', 'clearanceZones'];

const pretty = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sceneHash = (scene) => createHash('sha256').update(serializeScene(scene)).digest('hex');
const safeSegment = (id) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) && id !== '..'
  ? id
  : `id-${Buffer.from(id).toString('base64url')}`;

async function readJson(path) {
  const metadata = await stat(path);
  if (metadata.size > MAX_JSON_BYTES) throw new Error(`TREE_JSON_TOO_LARGE: ${path}`);
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, pretty(value), { flag: 'wx' });
  await rename(temporary, path);
}

function resolveInside(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || isAbsolute(relativePath)) throw new Error('TREE_PATH_INVALID');
  const target = resolve(root, relativePath);
  if (target !== resolve(root) && !target.startsWith(`${resolve(root)}${sep}`)) throw new Error('TREE_PATH_INVALID');
  return target;
}

const recordPath = (record, roomIds) => {
  const filename = safeSegment(record.id);
  if (record.roomId && roomIds.has(record.roomId)) {
    const room = safeSegment(record.roomId);
    if (record.kind === 'floor' || record.kind === 'wall' || record.kind === 'ceiling') return `spaces/${room}/surfaces/${filename}.surface.json`;
    if (record.transform) return `spaces/${room}/objects/${filename}.object.json`;
    if (record.polygon && record.minimumMm) return `spaces/${room}/zones/${filename}.zone.json`;
  }
  if (record.polygon && record.adjacentRoomIds) return `spaces/${filename}/room.json`;
  if (record.hostSurfaceId) return `structure/openings/${filename}.opening.json`;
  if (record.position && record.target) return `cameras/${filename}.camera.json`;
  if (record.severity) return `rules/${filename}.rule.json`;
  return `materials/${filename}.material.json`;
};

function versionNumber(id) {
  const match = /^v(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

const nextVersionId = (manifest) => `v${String(Math.max(0, ...manifest.versions.map((entry) => versionNumber(entry.id))) + 1).padStart(4, '0')}`;

async function treeManifest(root) {
  const manifest = await readJson(join(root, 'manifest.json'));
  if (manifest.format !== FORMAT || manifest.formatVersion !== FORMAT_VERSION || !Array.isArray(manifest.versions)) {
    throw new Error('TREE_FORMAT_UNSUPPORTED');
  }
  return manifest;
}

async function writeVersionDirectory(root, versionId, scene) {
  assertValidScene(scene);
  const versionsRoot = join(root, 'versions');
  const finalRoot = join(versionsRoot, versionId);
  const stagingRoot = join(versionsRoot, `.staging-${versionId}-${randomUUID()}`);
  const roomIds = new Set(scene.rooms.map((room) => room.id));
  const index = Object.fromEntries(RECORD_KEYS.map((key) => [key, []]));
  try {
    await mkdir(stagingRoot, { recursive: true });
    for (const key of RECORD_KEYS) {
      for (const record of scene[key]) {
        const path = recordPath(record, roomIds);
        index[key].push({ id: record.id, path });
        await writeJsonAtomic(join(stagingRoot, path), record);
      }
    }
    await writeJsonAtomic(join(stagingRoot, 'home.json'), {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      scene: {
        id: scene.id,
        schemaVersion: scene.schemaVersion,
        floorPlan: scene.floorPlan,
      },
      records: index,
    });
    const assembled = await readVersionDirectory(stagingRoot);
    if (serializeScene(assembled) !== serializeScene(scene)) throw new Error('TREE_ROUND_TRIP_MISMATCH');
    await rename(stagingRoot, finalRoot);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

async function readVersionDirectory(versionRoot) {
  const home = await readJson(join(versionRoot, 'home.json'));
  if (home.format !== FORMAT || home.formatVersion !== FORMAT_VERSION || !home.scene?.floorPlan) throw new Error('TREE_VERSION_INVALID');
  const scene = { ...home.scene };
  for (const key of RECORD_KEYS) {
    const entries = home.records?.[key];
    if (!Array.isArray(entries)) throw new Error(`TREE_RECORD_INDEX_INVALID: ${key}`);
    scene[key] = [];
    for (const entry of entries) {
      const record = await readJson(resolveInside(versionRoot, entry.path));
      if (record.id !== entry.id) throw new Error(`TREE_RECORD_ID_MISMATCH: ${entry.id}`);
      scene[key].push(record);
    }
  }
  return deserializeScene(serializeScene(scene));
}

async function withTreeLock(root, task) {
  const lock = join(root, '.write-lock');
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('TREE_WRITE_LOCKED');
    throw error;
  }
  try {
    return await task();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

export async function initializeHouseTree(root, scene, { now = () => new Date().toISOString() } = {}) {
  assertValidScene(scene);
  await mkdir(root, { recursive: true });
  const entries = await readdir(root);
  if (entries.length) throw new Error('TREE_ROOT_NOT_EMPTY');
  const versionId = 'v0001';
  await writeVersionDirectory(root, versionId, scene);
  await writeJsonAtomic(join(root, 'manifest.json'), {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    currentVersionId: versionId,
    versions: [{ id: versionId, parentVersionId: null, source: 'import', createdAt: now(), sceneSha256: sceneHash(scene) }],
  });
  return { root, versionId, sceneSha256: sceneHash(scene) };
}

export async function readHouseTree(root, versionId = null) {
  const manifest = await treeManifest(root);
  const targetId = versionId ?? manifest.currentVersionId;
  if (!manifest.versions.some((entry) => entry.id === targetId)) throw new Error(`TREE_VERSION_NOT_FOUND: ${targetId}`);
  const scene = await readVersionDirectory(join(root, 'versions', targetId));
  const expectedHash = manifest.versions.find((entry) => entry.id === targetId)?.sceneSha256;
  if (expectedHash !== sceneHash(scene)) throw new Error(`TREE_VERSION_HASH_MISMATCH: ${targetId}`);
  return { manifest, versionId: targetId, scene };
}

export async function validateHouseTree(root) {
  const { manifest, versionId, scene } = await readHouseTree(root);
  return {
    ok: true,
    versionId,
    versions: manifest.versions.length,
    sceneId: scene.id,
    rooms: scene.rooms.length,
    walls: scene.surfaces.filter((surface) => surface.kind === 'wall').length,
    floors: scene.surfaces.filter((surface) => surface.kind === 'floor').length,
    ceilings: scene.surfaces.filter((surface) => surface.kind === 'ceiling').length,
    objects: scene.objects.length,
    sceneSha256: sceneHash(scene),
  };
}

export async function saveAgentProposal(root, proposal) {
  const value = {
    ...proposal,
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    id: proposal.id ?? `proposal-${randomUUID()}`,
    status: 'pending',
    createdAt: proposal.createdAt ?? new Date().toISOString(),
  };
  await writeJsonAtomic(join(root, 'proposals', `${safeSegment(value.id)}.proposal.json`), value);
  return value;
}

export async function readAgentProposal(root, proposalId) {
  if (proposalId !== 'latest') return readJson(join(root, 'proposals', `${safeSegment(proposalId)}.proposal.json`));
  // ponytail: proposal counts are tiny in the local CLI; add an index only if scans become measurable.
  const files = (await readdir(join(root, 'proposals'))).filter((name) => name.endsWith('.proposal.json'));
  const proposals = await Promise.all(files.map((name) => readJson(join(root, 'proposals', name))));
  const latest = proposals.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt))).at(-1);
  if (!latest) throw new Error('PROPOSAL_NOT_FOUND');
  return latest;
}

export async function applyAgentProposal(root, proposalId, { now = () => new Date().toISOString() } = {}) {
  return withTreeLock(root, async () => {
    const proposal = await readAgentProposal(root, proposalId);
    if (proposal.status !== 'pending') throw new Error(`PROPOSAL_NOT_PENDING: ${proposal.id}`);
    if (!Array.isArray(proposal.commands) || proposal.commands.length === 0) throw new Error(`PROPOSAL_NO_COMMANDS: ${proposal.id}`);
    const current = await readHouseTree(root);
    if (proposal.baseVersionId !== current.versionId || proposal.baseSceneSha256 !== sceneHash(current.scene)) {
      throw new Error(`PROPOSAL_BASE_CHANGED: ${proposal.id}`);
    }
    let store = createSceneStore(current.scene);
    for (const command of proposal.commands) store = dispatchSceneCommand(store, command);
    const versionId = nextVersionId(current.manifest);
    await writeVersionDirectory(root, versionId, store.currentScene);
    const appliedAt = now();
    const manifest = {
      ...current.manifest,
      currentVersionId: versionId,
      versions: [...current.manifest.versions, {
        id: versionId,
        parentVersionId: current.versionId,
        proposalId: proposal.id,
        source: proposal.provider === 'aily' ? 'aily' : proposal.provider === 'manual' ? 'manual' : 'agent-local',
        createdAt: appliedAt,
        sceneSha256: sceneHash(store.currentScene),
      }],
    };
    await writeJsonAtomic(join(root, 'manifest.json'), manifest);
    await writeJsonAtomic(join(root, 'proposals', `${safeSegment(proposal.id)}.proposal.json`), {
      ...proposal,
      status: 'applied',
      appliedAt,
      appliedVersionId: versionId,
    });
    return { proposalId: proposal.id, versionId, scene: store.currentScene };
  });
}

export async function saveDesignBrief(root, brief) {
  await writeJsonAtomic(join(root, 'state', 'design-brief.json'), brief);
}

export async function readDesignBrief(root) {
  try {
    return await readJson(join(root, 'state', 'design-brief.json'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

const roomBounds = (room) => ({
  x: Math.min(...room.polygon.map((point) => point.x)),
  z: Math.min(...room.polygon.map((point) => point.z)),
});
const wallLength = (surface) => Math.round(Math.hypot(surface.edge.end.x - surface.edge.start.x, surface.edge.end.z - surface.edge.start.z));
const degrees = (radians) => Math.round(radians * 180 / Math.PI);

function objectLabel(object, room) {
  const origin = roomBounds(room);
  return `${object.name} · ${object.id} · global(${object.transform.x},${object.transform.y},${object.transform.z}) · room(${object.transform.x - origin.x},${object.transform.y},${object.transform.z - origin.z}) · r${degrees(object.transform.rotationY)}°`;
}

const node = (label, children = []) => ({ label, children });

function drawTree(root) {
  const lines = [root.label];
  const visit = (entry, prefix, last) => {
    lines.push(`${prefix}${last ? '└── ' : '├── '}${entry.label}`);
    entry.children.forEach((child, index) => visit(child, `${prefix}${last ? '    ' : '│   '}`, index === entry.children.length - 1));
  };
  root.children.forEach((child, index) => visit(child, '', index === root.children.length - 1));
  return lines.join('\n');
}

export function renderHouseTree(scene, { versionId = 'current', roomId = null } = {}) {
  const rooms = roomId ? scene.rooms.filter((room) => room.id === roomId) : scene.rooms;
  if (roomId && !rooms.length) throw new Error(`ROOM_NOT_FOUND: ${roomId}`);
  const roomNodes = rooms.map((room) => {
    const surfaces = scene.surfaces.filter((surface) => surface.roomId === room.id);
    const wallIds = new Set(surfaces.filter((surface) => surface.kind === 'wall').map((surface) => surface.id));
    const surfaceNodes = surfaces.map((surface) => {
      if (surface.kind === 'wall') return node(`墙面 · ${surface.id} · U[0,${wallLength(surface)}] V[0,${surface.height}] · (${surface.edge.start.x},${surface.edge.start.z})→(${surface.edge.end.x},${surface.edge.end.z})`);
      if (surface.kind === 'ceiling') return node(`顶面 · ${surface.id} · y=${surface.elevation} · polygon:${surface.polygon.length}`);
      return node(`地面 · ${surface.id} · y=0 · polygon:${surface.polygon.length}`);
    });
    const openingNodes = scene.openings.filter((opening) => wallIds.has(opening.hostSurfaceId)).map((opening) => node(`${opening.kind} · ${opening.id} · host=${opening.hostSurfaceId} · U[${opening.offset},${opening.offset + opening.width}] V[${opening.sillHeight},${opening.sillHeight + opening.height}]`));
    const objects = scene.objects.filter((object) => object.roomId === room.id);
    const fixed = objects.filter((object) => object.hierarchy.layer === 'fixed_installation').map((object) => node(objectLabel(object, room)));
    const furniture = objects.filter((object) => object.hierarchy.layer !== 'fixed_installation').map((object) => node(objectLabel(object, room)));
    const zones = scene.clearanceZones.filter((zone) => zone.roomId === room.id).map((zone) => node(`${zone.label} · ${zone.id} · ${zone.valueMm}mm / min ${zone.minimumMm}mm`));
    return node(`${room.name} · ${room.id} · floor-domain:${room.polygon.length} points`, [
      node('表面', surfaceNodes),
      node('门窗', openingNodes),
      node('固定装修', fixed),
      node('家具', furniture),
      node('保护区', zones),
    ]);
  });
  const bounds = scene.floorPlan.bounds;
  return drawTree(node(`${scene.id} · ${versionId} · X[0,${bounds.width}] Y[0,${bounds.height}] Z[0,${bounds.depth}] mm`, roomNodes));
}

export function inspectTreeEntity(scene, id) {
  if (scene.floorPlan.id === id) return scene.floorPlan;
  for (const key of RECORD_KEYS) {
    const record = scene[key].find((candidate) => candidate.id === id);
    if (!record) continue;
    if (key === 'objects') {
      const room = scene.rooms.find((candidate) => candidate.id === record.roomId);
      const origin = roomBounds(room);
      return { ...record, coordinateView: { global: record.transform, roomRelative: { x: record.transform.x - origin.x, y: record.transform.y, z: record.transform.z - origin.z } } };
    }
    if (key === 'surfaces' && record.kind === 'wall') return { ...record, coordinateView: { u: [0, wallLength(record)], v: [0, record.height], origin: record.edge.start } };
    return record;
  }
  throw new Error(`ENTITY_NOT_FOUND: ${id}`);
}

export async function compareHouseTreeVersions(root, beforeId, afterId = null) {
  const before = await readHouseTree(root, beforeId);
  const after = await readHouseTree(root, afterId);
  return compareSceneVersions(
    { id: before.versionId, scene: before.scene },
    { id: after.versionId, scene: after.scene },
  );
}

export async function createTreeVersionHistory(root) {
  const manifest = await treeManifest(root);
  const versions = [];
  for (const entry of manifest.versions) {
    const { scene } = await readHouseTree(root, entry.id);
    versions.push({
      id: entry.id,
      parentVersionId: entry.parentVersionId,
      source: entry.source,
      status: entry.id === manifest.currentVersionId ? 'current' : 'saved',
      label: entry.id,
      summary: entry.proposalId ?? entry.source,
      scene,
      createdAt: entry.createdAt,
    });
  }
  return {
    id: 'history-house-cli',
    initialVersionId: versions[0]?.id ?? null,
    currentVersionId: manifest.currentVersionId,
    confirmedVersionId: null,
    versions,
  };
}

export { sceneHash };
