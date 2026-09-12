import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateScene } from '../src/domain/scene.js';
import { evaluateDesignRules } from '../src/domain/design-rules.js';
import { candidateFacts } from '../src/agent/spatial-observation.js';
export function loadQualityCases(){
  const root=new URL('../evals/harness-quality/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
  const cases=[];
  for(const split of ['development','holdout']){
    const file=readFileSync(new URL(split+'.json',root));
    if(createHash('sha256').update(file).digest('hex')!==manifest.files[split+'.json'])throw Error('EVAL_SPLIT_CHANGED_AFTER_FREEZE');
    cases.push(...JSON.parse(file).cases.map(c=>({...c,split})));
  }
  const r=JSON.parse(readFileSync(new URL('../../docs/gptpro-handoff-20260910/REPRO-TRACE.json',import.meta.url),'utf8'));
  return [{id:'core-repro',split:'reproduction',coverage:['original_failure'],turns:[{input:r.input,expected:{preserved:['object-flex-desk'],noNewObjects:true,forbidKindsFor:{'object-flex-desk':['lock_transform','lock_object']},poseIfPreview:['object-flex-desk','object-flex-bed']}}]},...cases];
}
export function checkMechanics(before,result,expected={}){
  const after=result.store.currentScene,trace=result.trace,needs=result.requirements,failures=[];
  const get=(s,id)=>s.objects.find(o=>o.id===id),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const preview=trace.mode==='execute'&&!trace.rolledBack,delta=candidateFacts(before,after),changed=delta.facts;
  if(!validateScene(after).ok||evaluateDesignRules(after).status==='blocked')failures.push('SCENE_INVALID');
  if(expected.previewRequired&&!preview)failures.push('PREVIEW_REQUIRED');
  if(expected.readOnly&&!same(before,after))failures.push('READ_ONLY_VIOLATED');
  if(!preview&&!same(before,after))failures.push('FAILED_OR_READ_ONLY_CANDIDATE_LEAK');
  for(const id of expected.preserved??[])if(!get(after,id))failures.push('PRESERVE:'+id);
  if(expected.noNewObjects&&after.objects.some(o=>!get(before,o.id)))failures.push('NEW_OBJECT');
  for(const id of expected.lockPose??[])if(!same(get(before,id)?.transform,get(after,id)?.transform))failures.push('POSE_LOCK:'+id);
  for(const id of expected.lockObject??[])if(!same(get(before,id),get(after,id)))failures.push('FULL_LOCK:'+id);
  if(expected.allPosesFixed&&before.objects.some(o=>!same(o.transform,get(after,o.id)?.transform)))failures.push('ALL_POSES_FIXED');
  for(const [id,kinds] of Object.entries(expected.forbidKindsFor??{}))if(needs?.hardConstraints?.some(r=>kinds.includes(r.kind)&&(!r.objectIds?.length||r.objectIds.includes(id))))failures.push('OVER_CONSTRAINED:'+id);
  if(preview&&expected.poseIfPreview&&!changed.some(f=>f.kind==='pose'&&expected.poseIfPreview.includes(f.entityId)))failures.push('SPATIAL_GOAL_NOT_ADDRESSED_BY_POSE');
  if(preview&&expected.changedIfPreview){
    if(!expected.changedIfPreview.some(id=>changed.some(f=>f.entityId===id)))failures.push('REQUESTED_TARGET_UNCHANGED');
    if(changed.some(f=>!expected.changedIfPreview.includes(f.entityId)))failures.push('UNREQUESTED_TARGET_CHANGED');
  }
  if(expected.noRejectedReasons){const rejected=new Set(needs?.rejected?.map(r=>r.id));if(trace.reasons?.some(r=>rejected.has(r.requirementId)))failures.push('REJECTED_REASON_REUSED');}
  return {passed:!failures.length,failures,preview,changedFacts:changed,
    scope:'Deterministic mechanics only. Psychology, named-room question value and design quality require the separate blind review and browser/user judgement.'};
}
export function sanitize(value){
  if(Array.isArray(value))return value.map(sanitize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(api.?key|access.?token|authorization|password|secret|reasoning_content)/i.test(k)).map(([k,v])=>[k,sanitize(v)]));
  if(typeof value==='string')return value.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[redacted]');
  return value;
}
export function summarizeRequests(requests){
  const usage={promptTokens:0,completionTokens:0,reasoningTokens:0,requestsWithUnknownUsage:0};
  for(const r of requests){const u=r.providerTrace?.usage;if(!u){usage.requestsWithUnknownUsage++;continue;}
    usage.promptTokens+=u.prompt_tokens??0;usage.completionTokens+=u.completion_tokens??0;usage.reasoningTokens+=u.completion_tokens_details?.reasoning_tokens??0;}
  return {requests:requests.length,providerErrors:requests.filter(r=>r.outcome==='error').length,
    observedModels:[...new Set(requests.map(r=>r.providerTrace?.model).filter(Boolean))],usage};
}
