import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, BoxGeometry, MeshStandardMaterial, Texture } from 'three';
import { applyStudioFinish, disposeStudioFinishes, isStudioFinishMesh } from '../src/pascal/studio-finish.js';

test('Fab finishes preserve authored default and restore it after an edit', () => {
  const original = new MeshStandardMaterial();
  original.map = new Texture();
  const mesh = new Mesh(new BoxGeometry(), original);
  mesh.userData.fabDefaultMaterial = 'default';
  const owned = new Map();
  applyStudioFinish(mesh, {id:'default',color:'#cccccc'}, 'sofa', owned);
  assert.equal(mesh.material, original);
  applyStudioFinish(mesh, {id:'edited',color:'#456789'}, 'sofa', owned);
  assert.equal(mesh.material.color.getHexString(), '456789');
  assert.equal(mesh.material.map, null, 'a chosen finish must not be multiplied by the original brown base-color image');
  assert.ok(original.map, 'shared authored texture remains untouched for undo and other instances');
  applyStudioFinish(mesh, {id:'default',color:'#cccccc'}, 'sofa', owned);
  assert.equal(mesh.material, original);
  assert.equal(owned.size, 0);
});

test('studio upholstery colors are per-instance and retain authored textures', () => {
  const authored = new MeshStandardMaterial({ color: '#ffffff' });
  authored.map = new Texture();
  const mesh = new Mesh(new BoxGeometry(), authored);
  mesh.name = 'CANONICAL_seat';
  const sibling = mesh.clone();
  const owned = new Map();
  applyStudioFinish(mesh, { color: '#456789', kind: 'fabric' }, 'sofa', owned);
  assert.notEqual(mesh.material, authored);
  assert.equal(sibling.material.color.getHexString(), 'ffffff');
  assert.equal(mesh.material.color.getHexString(), '456789');
  assert.equal(mesh.material.map, authored.map);
  assert.equal(mesh.material.roughness, 0.92);
  const firstClone = mesh.material;
  applyStudioFinish(mesh, { color: '#987654', kind: 'fabric' }, 'sofa', owned);
  assert.equal(mesh.material, firstClone);
  assert.equal(mesh.material.color.getHexString(), '987654');
  disposeStudioFinishes(owned);
  assert.equal(mesh.material, authored);
  assert.equal(owned.size, 0);
});

test('upholstery edits preserve chair timber, accents and imported mesh roles', () => {
  const mesh = new Mesh();
  for (const name of ['CANONICAL oak leg', 'CANONICAL_oak_rail']) {
    mesh.name = name;
    assert.equal(isStudioFinishMesh(mesh, 'dining-chair'), false);
    assert.equal(isStudioFinishMesh(mesh, 'dining-table'), true);
  }
  for (const name of ['ACCENT brass', 'Imported mesh']) {
    mesh.name = name;
    assert.equal(isStudioFinishMesh(mesh, 'sofa'), false);
  }
});

test('Pascal material replacement releases old clones without disposing shared input', () => {
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  mesh.name = 'CANONICAL case';
  const owned = new Map();
  const finish = { color: '#c7b49a', kind: 'wood' };
  applyStudioFinish(mesh, finish, 'fixed-cabinet', owned);
  let released = 0;
  mesh.material.addEventListener('dispose', () => released++);
  const next = new MeshStandardMaterial();
  mesh.material = next;
  applyStudioFinish(mesh, finish, 'fixed-cabinet', owned);
  assert.equal(released, 1);
  assert.equal(mesh.material.roughness, 0.62);
  disposeStudioFinishes(owned);
  assert.equal(mesh.material, next);
});
