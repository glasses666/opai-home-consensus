import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoScene } from '../src/domain/demo-scene.js';
import { projectOppeinSceneToPascal } from '../src/pascal/oppein-to-pascal.js';
import { isFabPresentation } from '../src/pascal/studio-assets.js';

test('Fab normalized geometry is opt-in and follows canonical dimensions without changing identity',()=>{
  const scene=createDemoScene();
  const sofa=scene.objects.find(object=>object.model3D?.src==='/assets/models/sofa.glb');
  assert.ok(sofa);
  sofa.model3D.src='/assets/models/fab/sofa.glb';
  const before=JSON.stringify(scene);
  const {sceneGraph,mapping}=projectOppeinSceneToPascal(scene);
  for(const obj of scene.objects){
    if(!isFabPresentation(obj.model3D?.src))continue;
    const node=sceneGraph.nodes[mapping.canonicalToPascal.object[obj.id]];
    const expected=[obj.dimensions.width/1000,obj.dimensions.height/1000,obj.dimensions.depth/1000];
    assert.ok(node.asset.scale.every((value,i)=>Math.abs(value-expected[i])<1e-10));
    assert.deepEqual(node.scale,[1,1,1]);
    assert.equal(node.asset.src,obj.model3D.src);
  }
  assert.equal(JSON.stringify(scene),before);
});

test('clean canonical projection uses tracked studio assets rather than unshipped Fab paths',()=>{
  const scene=createDemoScene();
  const {sceneGraph,mapping}=projectOppeinSceneToPascal(scene);
  for(const obj of scene.objects){
    const node=sceneGraph.nodes[mapping.canonicalToPascal.object[obj.id]];
    assert.equal(node.asset.src.includes('/assets/models/fab/'),false,obj.id);
  }
});
