import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWorkbenchDiff } from '../src/workbench-diff.js';

test('actual material and geometry diffs are readable without guessing missing names', () => {
  assert.equal(describeWorkbenchDiff({kind:'material',before:'old',after:'new'}, [{id:'old',name:'暖白'}], [{id:'new',name:'灰绿'}]), '暖白 → 灰绿');
  assert.equal(describeWorkbenchDiff({kind:'material',before:'unknown',after:'new'}, [], []), 'unknown → new');
  assert.match(describeWorkbenchDiff({kind:'transform',before:{x:10,y:0,z:20,rotationY:0},after:{x:110,y:0,z:20,rotationY:Math.PI/2}}), /x 10.*→ x 110.*90°/);
  assert.equal(describeWorkbenchDiff({kind:'dimensions',before:{width:10,depth:20,height:30},after:{width:11,depth:20,height:30}}), '10 × 20 × 30 mm → 11 × 20 × 30 mm（宽×深×高）');
});
