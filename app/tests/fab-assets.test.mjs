import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { projectOppeinSceneToPascal } from '../src/pascal/oppein-to-pascal.js';
import { isFabPresentation } from '../src/pascal/studio-assets.js';

test('Fab normalized geometry follows canonical dimensions without changing identity',()=>{
  const scene=createDemoScene(), before=JSON.stringify(scene);
  const {sceneGraph,mapping}=projectOppeinSceneToPascal(scene);
  for(const obj of scene.objects){
    if(!isFabPresentation(obj.model3D?.src))continue;
    const node=sceneGraph.nodes[mapping.canonicalToPascal.object[obj.id]];
    const expected=[obj.dimensions.width/1000,obj.dimensions.height/1000,obj.dimensions.depth/1000];
    assert.ok(node.asset.scale.every((value,i)=>Math.abs(value-expected[i])<1e-10));
    assert.deepEqual(node.scale,[1,1,1]);
    assert.equal(node.asset.src,obj.model3D.src.replace('/models/','/models/fab/'));
  }
  assert.equal(JSON.stringify(scene),before);
});

test('Fab build inputs have embedded textures and bounded total size',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../../design-lab/ue-furniture-import/web-manifest.json',import.meta.url)));
  let total=0;
  for(const name of Object.keys(manifest)){
    const b=readFileSync(new URL('../public/assets/models/fab/'+name+'.glb',import.meta.url));
    assert.equal(b.readUInt32LE(8),b.length);
    const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
    assert.deepEqual(j.asset.extras.normalizedBounds,[1,1,1]);
    assert.ok(j.images.length>0);
    assert.ok(j.images.every(i=>i.bufferView!==undefined&&!i.uri));
    assert.ok(j.buffers.every(i=>!i.uri));
    total+=b.length;
  }
  assert.ok(total<3_000_000,total);
});
