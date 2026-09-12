import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { deserializeVersionHistory } from '../src/domain/design-version.js';
import { formatExperienceHandoff } from '../src/experience-handoff.js';

// Local acceptance export. Explicit allowlist: never copy bearer tokens,
// credentials, private request receipts, or raw provider envelopes.
const [projectId, outputPath] = process.argv.slice(2);
if (!/^exp-[a-f0-9-]{36}$/.test(projectId??'') || !outputPath) throw Error('Usage: node scripts/capture-experience-proof.mjs exp-UUID output.json');
const directory=resolve(process.env.OPAI_EXPERIENCE_DATA_DIR||'.data/experience-candidate');
const s=JSON.parse(readFileSync(join(directory,'projects',projectId+'.json'),'utf8'));
const h=deserializeVersionHistory(s.versionHistory);
const family=JSON.parse(readFileSync(join(directory,'discussions.json'),'utf8'));
const discussions=family.discussions.filter(d=>d.projectId===projectId);
const paths=['server/experience-runtime.mjs','server/experience-routes.mjs','server/experience-store.mjs','server/house-knowledge.mjs','server/family-discussion.mjs','server/feishu.mjs','server/consensus-secretary.mjs','server/deepseek.mjs','src/agent/dialogue.js','src/agent/harness.js','src/agent/evidence.js','src/App.jsx','src/ExperienceDiscussion.jsx','src/ExperienceDocuments.jsx','src/PascalStage.jsx','src/conversation-presentation.js','src/experience-handoff.js','src/pascal/studio-finish.js','src/domain/reference-home.js','src/domain/scene.js'];
const files=Object.fromEntries(paths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const provenance=trace=>({provider:trace?.provider,model:trace?.model,requestedModel:trace?.requestedModel,endpoint:trace?.endpoint,requestId:trace?.requestId,usage:trace?.usage,parameters:trace?.parameters});
const proof={schemaVersion:1,recordedAt:new Date().toISOString(),environment:'isolated-local-candidate',
  projectId,houseId:s.houseId,revision:s.revision,currentVersionId:h.currentVersionId,
  workspace:{head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),files,hashMeaning:'Files at export time; use the accompanying ledger to identify which interactions ran before a change.'},
  requirements:s.requirements,
  versions:h.versions.map(v=>({id:v.id,parentVersionId:v.parentVersionId,createdAt:v.createdAt,summary:v.summary,
    objects:v.scene.objects.map(o=>({id:o.id,materialId:o.materialId,transform:o.transform,dimensions:o.dimensions})),
    surfaces:v.scene.surfaces.map(o=>({id:o.id,materialId:o.materialId}))})),
  turns:s.conversation.filter(v=>v.trace).map(v=>{const t=v.trace;return{
    requestId:t.requestId,input:t.input,assistantReply:t.assistantReply,source:t.source,provider:t.provider,model:t.model,
    elapsedMs:t.elapsedMs,terminationReason:t.terminationReason,rolledBack:t.rolledBack,
    providerTrace:provenance(t.providerTrace),modelRequests:(t.modelRequests??[]).map(r=>({...r,providerTrace:provenance(r.providerTrace)})),
    toolCalls:t.toolCalls,steps:t.steps,validationFeedback:t.validationFeedback,reasons:t.reasons,retrieval:t.retrieval,requirements:t.requirements,
  };}),
  discussions:discussions.map(d=>({id:d.id,baseVersionId:d.baseVersionId,status:d.status,opinionSlots:d.opinionSlots,opinions:d.opinions,summary:d.summary,summaryAttempts:d.summaryAttempts,adoption:d.adoption,outcomeVersionId:d.outcomeVersionId})),
  familyEvents:family.events.filter(e=>discussions.some(d=>d.id===e.discussionId)).map(e=>({eventId:e.eventId,type:e.payload?.type,sync:e.sync,result:e.payload?.result})),
  boundaries:['Synthetic acceptance inputs, not customer data','No production publish or group messages','Export is not by itself a visual acceptance assertion'],
};
const target=resolve(outputPath);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(proof,null,2)+'\n',{mode:0o600});
if(process.env.OPAI_PROOF_API_ORIGIN){
  const origin=new URL(process.env.OPAI_PROOF_API_ORIGIN);
  if(!['127.0.0.1','localhost'].includes(origin.hostname))throw Error('Proof export only accepts a local acceptance server');
  const response=await fetch(`${origin.origin}/api/experience/projects/${projectId}/handoff`,{headers:{authorization:`Bearer ${s.accessToken}`}});
  if(!response.ok)throw Error('Handoff read failed: '+response.status);
  const data=await response.json();if(data.projectId!==projectId||data.versionId!==h.currentVersionId)throw Error('Handoff version mismatch');
  writeFileSync(target.replace(/\.json$/,'.md'),formatExperienceHandoff(data),{mode:0o600});
}
console.log(JSON.stringify({output:target,projectId,turns:proof.turns.length,versions:proof.versions.length,containsAccessToken:false}));
