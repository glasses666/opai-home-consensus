#!/usr/bin/env node
/** Explicit opt-in, synthetic cases only, bounded REAL DeepSeek requests. Never a mock fallback. */
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sourceFingerprint } from '../server/source-fingerprint.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { createExperienceScene } from '../server/experience-store.mjs';
import { callDesignDeepSeek } from '../server/deepseek.mjs';
import { runDesignDialogue as candidateRun, emptyRequirements } from '../src/agent/dialogue.js';
import { createSceneStore, serializeScene, undoSceneCommand } from '../src/domain/scene.js';
import { createVersionHistory, saveSceneVersion, serializeVersionHistory, deserializeVersionHistory, sceneStoreForVersion } from '../src/domain/design-version.js';
import { reviewDesignDecision } from '../src/agent/design-quality.js';
import { loadQualityCases, checkMechanics, sanitize, summarizeRequests } from './harness-eval-support.mjs';

const baselineRef='fc742b7bd8f1fcf44dcce3a33d6dafb04dde0b1b';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const flag=name=>process.argv.includes('--'+name),option=(name,fallback)=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3)??fallback;
const output=resolve(option('out',join(app,'.data','harness-eval',`${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}`)));
mkdirSync(output,{recursive:true,mode:0o700});
const append=(file,data)=>appendFileSync(join(output,file),JSON.stringify(sanitize(data))+'\n',{mode:0o600});
const requests=[],outcomes=[];
const candidateSourceFingerprint=sourceFingerprint();
let tempBaseline=null,stoppedReason=null;
const variants=option('variants','AB').split('');
const selectedIds=option('cases','core-repro,d-desk-retain,h-flex-rest').split(',');
const maxRequests=Number(option('max-requests','40'));
const maxSteps=Number(option('max-steps','6'));
let current={};
async function invoke(args){
  if(requests.length>=maxRequests)throw Error('EVALUATION_REQUEST_BUDGET');
  const started=Date.now(),record={...current,number:requests.length+1,purpose:args.purpose??'baseline_plan',startedAt:new Date().toISOString(),
    inputSha256:createHash('sha256').update(args.prompt??'').digest('hex'),inputCharacters:args.prompt?.length??0};
  requests.push(record);append('requests.jsonl',{...record,outcome:'started'});
  try{
    const response=await callDesignDeepSeek(args,{model:'deepseek-v4-flash'});
    Object.assign(record,{outcome:'response',elapsedMs:Date.now()-started,providerTrace:response.providerTrace,
      response:JSON.parse(JSON.stringify(response))});append('requests.jsonl',record);return response;
  }catch(error){Object.assign(record,{outcome:'error',elapsedMs:Date.now()-started,error:error.message,providerTrace:error.providerTrace??null});append('requests.jsonl',record);throw error;}
}
function baselineApp(){
  tempBaseline=mkdtempSync(join(tmpdir(),'opai-baseline-'));
  const archive=spawnSync('git',['archive',baselineRef,'app/src','app/server','app/package.json'],{cwd:app,maxBuffer:32*1024*1024});
  if(archive.status!==0)throw Error('BASELINE_GIT_OBJECT_MISSING: fetch the named handoff branch locally; A/B must use its real source, not a disabled B guard');
  const extract=spawnSync('tar',['-x','-C',tempBaseline],{input:archive.stdout});
  if(extract.status!==0)throw Error('BASELINE_EXTRACT_FAILED');
  return join(tempBaseline,'app');
}
try{
  if(!variants.length||variants.some(v=>!['A','B'].includes(v))||new Set(variants).size!==variants.length)throw Error('VARIANTS_INVALID');
  if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>120||!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>8)throw Error('EVAL_BUDGET_INVALID');
  const cases=loadQualityCases().filter(c=>selectedIds.includes(c.id));
  if(cases.length!==new Set(selectedIds).size)throw Error('EVAL_CASE_UNKNOWN');
  if(!flag('live'))throw Error('LIVE_OPT_IN_REQUIRED');
  if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY_MISSING');
  // Use only the official origin. No user data, Feishu calls, alternate providers or publishing.
  if(process.env.DEEPSEEK_BASE_URL&&new URL(process.env.DEEPSEEK_BASE_URL).origin!=='https://api.deepseek.com')throw Error('OFFICIAL_DEEPSEEK_ORIGIN_REQUIRED');
  const runners={B:candidateRun};if(variants.includes('A'))runners.A=(await import(pathToFileURL(join(baselineApp(),'src/agent/dialogue.js')))).runDesignDialogue;
  append('run.jsonl',{type:'started',live:true,variants,cases:cases.map(c=>({id:c.id,split:c.split})),baselineRef,maxRequests,maxSteps,
    provider:'deepseek',requestedModel:'deepseek-v4-flash',thinking:'enabled',reasoningEffort:'high',firstFailuresPreserved:true});
  for(const c of cases){
    for(const variant of (cases.indexOf(c)%2?[...variants].reverse():variants)){
      let store=createSceneStore(createExperienceScene()),requirements=emptyRequirements(),conversation=[],history=createVersionHistory(store);
      for(let turn=0;turn<c.turns.length;turn++){
        if(requests.length>=maxRequests)throw Error('EVALUATION_REQUEST_BUDGET');
        const sample=c.turns[turn],before=store.currentScene,at=Date.now();current={caseId:c.id,split:c.split,variant,turn:turn+1};
        try{
          const result=await runners[variant]({store,input:sample.input,requirements,conversation,provider:invoke,requestId:`eval-${c.id}-${turn+1}`,
            deadlineMs:120000,maxSteps,maxModelRequests:12,onProgress:event=>append('progress.jsonl',{...current,...event})});
          append('traces.jsonl',{...current,live:true,input:sample.input,trace:result.trace});
          const mechanics=checkMechanics(before,result,sample.expected);
          // Same separate review for A and B; data contains no variant or harness verdict.
          const judge=await reviewDesignDecision({input:sample.input,conversation,before,after:result.store.currentScene,
            previousRequirements:requirements,turnStartRequirements:requirements,requirements:result.requirements,
            draft:{action:mechanics.preview?'preview':result.trace.mode==='clarify'?'clarify':result.trace.mode==='unsupported'?'unsupported':'answer',
              assistantReply:result.trace.assistantReply,reasons:result.trace.reasons}},(_purpose,args)=>invoke({...args,purpose:'blind_final_review'}));
          let restore={tested:false};
          if(mechanics.preview){
            let retracted=result.store;while(retracted.cursor>store.cursor)retracted=undoSceneCommand(retracted);
            const undoExact=serializeScene(retracted.currentScene)===serializeScene(before);
            history=saveSceneVersion(history,result.store,{source:'agent-provider',summary:'Synthetic evaluator retain/save'});
            const reopened=sceneStoreForVersion(deserializeVersionHistory(serializeVersionHistory(history)));
            restore={tested:true,undoExact,reopenExact:serializeScene(reopened.currentScene)===serializeScene(result.store.currentScene)};
            if(!undoExact||!restore.reopenExact){mechanics.passed=false;mechanics.failures.push('UNDO_OR_REOPEN_MISMATCH');}
            store=reopened;
          }
          requirements=result.requirements;conversation.push({role:'user',text:sample.input},{role:'assistant',text:result.trace.assistantReply,trace:result.trace});
          const record={...current,status:'evaluated',elapsedMs:Date.now()-at,mechanics,blindReview:judge,restore,
            firstCandidate:result.trace.candidateHistory?.[0]??null,firstModelRequest:result.trace.modelRequests?.[0]??null,
            repairedCandidate:result.trace.candidateHistory?.at(-1)??null,
            automatedPass:mechanics.passed&&judge.accepted&&result.trace.mode!=='failed',browserAcceptance:'not_tested_by_this_runner'};
          outcomes.push(record);append('outcomes.jsonl',record);
        }catch(error){
          const record={...current,status:'failed',error:error.message,elapsedMs:Date.now()-at,firstFailuresPreserved:true};
          outcomes.push(record);append('outcomes.jsonl',record);if(error.trace)append('traces.jsonl',{...current,live:true,trace:error.trace});
          if(error.message==='EVALUATION_REQUEST_BUDGET')throw error;break;
        }
      }
    }
  }
}catch(error){stoppedReason=error.message;append('run.jsonl',{type:'blocked_or_stopped',reason:error.message,live:requests.length>0,providerRequests:requests.length});process.exitCode=2;}
finally{
  if(tempBaseline)rmSync(tempBaseline,{recursive:true,force:true});
  const summary={live:requests.length>0,candidateSourceFingerprint,blockedOrStoppedReason:stoppedReason,baselineRef,variants,selectedIds,...summarizeRequests(requests),
    evaluated:outcomes.filter(o=>o.status==='evaluated').length,automatedPass:outcomes.filter(o=>o.automatedPass).length,
    failures:outcomes.filter(o=>o.status!=='evaluated'||!o.automatedPass).map(o=>({caseId:o.caseId,variant:o.variant,turn:o.turn,error:o.error??o.mechanics?.failures})),
    browserAcceptance:'not_run',userDesignAcceptance:'not_run',completeLedgerAcceptance:false,
    caution:'A blind review is still a model judgement, not independent human design acceptance. No retry replaces its first record.'};
  writeFileSync(join(output,'summary.json'),JSON.stringify(sanitize(summary),null,2)+'\n',{mode:0o600});
  if(summary.failures.length)process.exitCode??=1;
  console.log(JSON.stringify({output,...summary},null,2));
}
