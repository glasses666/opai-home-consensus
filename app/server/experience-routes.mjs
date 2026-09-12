import { sourceFingerprint } from './source-fingerprint.mjs';
import { randomUUID } from 'node:crypto';
import { runDesignDialogue } from '../src/agent/dialogue.js';
import { deserializeVersionHistory, sceneStoreForVersion } from '../src/domain/design-version.js';
import { assertEvidenceConstraints } from '../src/agent/evidence.js';
import { validateClientHistory, validatedWorkingStore } from './experience-store.mjs';
import { callDesignDeepSeek } from './deepseek.mjs';

const send=(response,status,data)=>{if(response.destroyed)return;response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(data));};
async function bodyOf(req){let length=0;const chunks=[];for await(const c of req){length+=c.length;if(length>3*1024*1024)throw Error('REQUEST_TOO_LARGE');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw Error('REQUEST_JSON_INVALID');}}
// Expose a stable classification, never raw provider responses or arbitrary text.
const safeError=e=>String(e.message??'').match(/^[A-Z][A-Z0-9_]{2,80}(?=:|$)/)?.[0]??'REQUEST_FAILED';
const assertSavedProjectState=project=>{
  if(project.pendingPreview)throw Error('PREVIEW_DECISION_REQUIRED');
  if(project.workingDraft)throw Error('WORKING_DRAFT_SAVE_REQUIRED');
};

export function createExperienceRoutes({store,knowledge,family,provider=callDesignDeepSeek,reviewProvider=provider,now=()=>Date.now()}={}){
  const rate=new Map();
  const constraintsFor=project=>knowledge?.search({projectId:project.projectId,houseId:project.houseId,query:'已确认设计约束',limit:1}).evidenceConstraints??[];
  const admit=(key,max,window=60000)=>{const times=(rate.get(key)??[]).filter(t=>now()-t<window);if(times.length>=max)throw Error('RATE_LIMIT');times.push(now());rate.set(key,times);if(rate.size>2000)rate.delete(rate.keys().next().value);};
  return async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/api/experience/'))return false;
    let streaming=false,failureContext=null;
    const emit=frame=>{if(!res.destroyed)res.write(JSON.stringify(frame)+'\n');};
    try{
      if(url.pathname==='/api/experience/health'&&req.method==='GET'){
        send(res,200,{service:'opai-experience',contract:'harness-review/1',turnStream:'ndjson',sourceFingerprint:sourceFingerprint()});return true;
      }
      if(url.pathname==='/api/experience/projects'&&req.method==='POST'){
        admit(`create:${req.socket.remoteAddress}`,20);const body=await bodyOf(req);
        if(body.requestId!==undefined&&(typeof body.requestId!=='string'||body.requestId.length>160))throw Error('REQUEST_ID_INVALID');
        const result=store.create(body);send(res,201,result);return true;
      }
      const m=url.pathname.match(/^\/api\/experience\/projects\/(exp-[a-f0-9-]{36})(?:\/(.*))?$/);
      if(!m){send(res,404,{error:'NOT_FOUND'});return true;}
      const [,projectId,action='']=m,token=req.headers.authorization?.replace(/^Bearer /,'');
      const project=store.read(projectId,token); // Every path authorizes before touching resources.
      if(!action&&req.method==='GET'){send(res,200,{...project,evidenceConstraints:constraintsFor(project)});return true;}
      if(action==='turn'&&req.method==='POST'){
        const body=await bodyOf(req);admit(projectId,18);
        if(typeof body.input!=='string'||!body.input.trim()||body.input.length>4000)throw Error('INPUT_INVALID');
        if(project.pendingPreview)throw Error('PREVIEW_DECISION_REQUIRED');
        failureContext={projectId,token,requestId:body.requestId};
        const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
        if(res.destroyed)controller.abort();
        streaming=String(req.headers.accept??'').includes('application/x-ndjson');
        if(streaming){
          res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-accel-buffering':'no'});
          res.flushHeaders?.();emit({type:'progress',phase:'preparing',attempt:0,elapsedMs:0});
        }
        const result=await store.transact(projectId,token,{...body,operation:'turn',payload:{input:body.input,scene:body.scene,versionHistory:body.versionHistory,selectedObjectId:body.selectedObjectId,spaceId:body.spaceId}},async s=>{
          if(s.pendingPreview)throw Error('PREVIEW_DECISION_REQUIRED');
          const {history}=validateClientHistory(body.versionHistory??s.versionHistory,s);
          const saved=sceneStoreForVersion(history);
          const working=validatedWorkingStore(body.scene,history,s.requirements);
          assertEvidenceConstraints(sceneStoreForVersion(history).currentScene,working.currentScene,constraintsFor(s),{projectId,houseId:s.houseId});
          const knowledgeRevision=knowledge?.getStats({projectId,houseId:s.houseId}).indexRevision;
          const reply=await runDesignDialogue({store:working,input:body.input,requirements:s.requirements,conversation:s.conversation,
            provider,reviewProvider,knowledge,projectId,houseId:s.houseId,selectedObjectId:body.selectedObjectId,activeRoomId:body.spaceId,
            requestId:body.requestId,versionHistory:history,designBrief:s.designBrief,signal:controller.signal,
            onProgress:event=>{if(streaming)emit({type:'progress',...event});}});
          controller.signal.throwIfAborted();
          if(knowledge && knowledgeRevision!==knowledge.getStats({projectId,houseId:s.houseId}).indexRevision)throw Error('KNOWLEDGE_VERSION_CONFLICT');
          s.conversation.push({id:body.requestId,role:'user',text:body.input},
            {id:body.requestId+'-assistant',role:'assistant',text:reply.trace.assistantReply,source:reply.trace.source,trace:reply.trace});
          s.conversation=s.conversation.slice(-100);
          const previewCommands=reply.store.commands.slice(working.cursor);
          if(reply.trace.mode==='execute'&&previewCommands.length){
            s.pendingPreview={id:`preview-${randomUUID()}`,requestId:body.requestId,status:'pending',
              versionId:history.currentVersionId,startCursor:working.cursor,
              commands:reply.store.commands.slice(saved.cursor),previewCommands,
              scene:reply.store.currentScene,requirementsBefore:s.requirements,
              proposedRequirements:reply.requirements,createdAt:new Date(now()).toISOString()};
            const assistantEntry=s.conversation.at(-1);
            assistantEntry.trace={...assistantEntry.trace,preview:{id:s.pendingPreview.id,status:'pending'}};
          } else s.requirements=reply.requirements;
          return {requirements:reply.requirements,evidenceConstraints:constraintsFor(s),conversationDelta:s.conversation.slice(-2),
            scene:reply.store.currentScene,commands:previewCommands,preview:s.pendingPreview,trace:s.conversation.at(-1).trace};
        });if(streaming){emit({type:'result',data:result});res.end();}else send(res,200,result);return true;
      }
      const previewAction=action.match(/^previews\/([^/]+)\/(keep|discard)$/);
      if(previewAction&&req.method==='POST'){
        const [,previewId,decision]=previewAction;
        if(!/^preview-[A-Za-z0-9-]{1,180}$/.test(previewId))throw Error('PREVIEW_ID_INVALID');
        const body=await bodyOf(req);
        const result=await store.transact(projectId,token,{...body,operation:`preview_${decision}`,payload:{previewId}},s=>{
          if(!s.pendingPreview||s.pendingPreview.id!==previewId)throw Error('PREVIEW_NOT_FOUND');
          const preview=s.pendingPreview;
          if(decision==='keep'){
            s.requirements=preview.proposedRequirements??s.requirements;
            s.workingDraft={...preview,status:'kept',keptAt:new Date(now()).toISOString()};
          }
          const originatingEntry=s.conversation.findLast(item=>item.trace?.preview?.id===previewId);
          if(originatingEntry)originatingEntry.trace.preview={...originatingEntry.trace.preview,
            status:decision==='keep'?'kept':'discarded',decidedAt:new Date(now()).toISOString()};
          s.pendingPreview=null;
          const text=decision==='keep'
            ? '你已保留这次预览；它仍是未保存草稿，保存后才会成为新版本。'
            : '你已撤销这次预览；场景已回到预览前的状态。';
          const entry={id:`${body.requestId}-assistant`,role:'assistant',text,source:'preview-decision',
            previewDecision:{previewId,decision}};
          s.conversation.push(entry);s.conversation=s.conversation.slice(-100);
          return {pendingPreview:null,workingDraft:s.workingDraft??null,requirements:s.requirements,
            conversationDelta:[entry],previewDecision:{previewId,decision}};
        });
        send(res,200,result);return true;
      }
      if(action==='failed-attempts'&&req.method==='GET'){send(res,200,{attempts:store.failedAttempts?.(projectId,token)??[]});return true;}
      if(action==='save'&&req.method==='POST'){
        const body=await bodyOf(req),{store:next}=validateClientHistory(body.versionHistory,project);
        assertEvidenceConstraints(sceneStoreForVersion(deserializeVersionHistory(project.versionHistory)).currentScene,next.currentScene,constraintsFor(project),{projectId,houseId:project.houseId});
        send(res,200,await store.save(projectId,token,body));return true;
      }
      if(action==='documents'){
        if(!knowledge)throw Error('KNOWLEDGE_UNAVAILABLE');
        if(req.method==='GET'){send(res,200,url.searchParams.has('q')?knowledge.search({projectId,houseId:project.houseId,query:url.searchParams.get('q')}):{documents:knowledge.listDocuments({projectId,houseId:project.houseId}),evidenceConstraints:constraintsFor(project)});return true;}
        if(req.method==='POST'){const b=await bodyOf(req);if(typeof b.content!=='string'||b.content.length>200000)throw Error('DOCUMENT_CONTENT_INVALID');
          // No server filesystem paths or cross-project scope accepted from client.
          send(res,201,knowledge.importDocument({projectId,houseId:project.houseId,content:b.content,source:{...b.source,trust:'user_confirmed',authorization:'user_provided'},expectedRevision:b.expectedRevision}));return true;}
      }
      if(action==='handoff'&&req.method==='GET'){
        assertSavedProjectState(project);
        const h=deserializeVersionHistory(project.versionHistory);
        const scene=sceneStoreForVersion(h).currentScene;
        const current=h.versions.find(v=>v.id===h.currentVersionId);
        const before=current?.parentVersionId?sceneStoreForVersion(h,current.parentVersionId).currentScene:h.initialScene;
        const changes=[...scene.objects.map(o=>({kind:'object',id:o.id,name:o.name,before:before.objects.find(p=>p.id===o.id),after:o})),
          ...scene.surfaces.map(o=>({kind:'surface',id:o.id,name:o.name??o.id,before:before.surfaces.find(p=>p.id===o.id),after:o}))]
          .filter(c=>JSON.stringify(c.before)!==JSON.stringify(c.after))
          .map(c=>({kind:c.kind,id:c.id,name:c.name,before:c.before?{materialId:c.before.materialId,transform:c.before.transform,dimensions:c.before.dimensions}:null,
            after:{materialId:c.after.materialId,transform:c.after.transform,dimensions:c.after.dimensions}}));
        changes.push(...before.objects.filter(o=>!scene.objects.some(p=>p.id===o.id)).map(o=>({kind:'object',id:o.id,name:o.name,before:{materialId:o.materialId,transform:o.transform,dimensions:o.dimensions},after:null})));
        send(res,200,{projectId,versionId:h.currentVersionId,generatedAt:new Date().toISOString(),requirements:project.requirements,
          sceneFacts:{houseId:scene.id,units:'mm',rooms:scene.rooms.map(r=>({id:r.id,name:r.name})),objects:scene.objects.map(o=>({id:o.id,name:o.name,roomId:o.roomId,dimensions:o.dimensions,transform:o.transform,materialId:o.materialId})),materials:scene.materials.map(m=>({id:m.id,name:m.name,source:m.source??'demo'}))},changes,
          documents:knowledge?.listDocuments({projectId,houseId:project.houseId})??[],
          brief:{confirmed:project.requirements.confirmed,hardConstraints:project.requirements.hardConstraints,preferences:project.requirements.preferences,unresolved:project.requirements.unresolved},
          versions:h.versions.map(({id,parentVersionId,createdAt,summary})=>({id,parentVersionId,createdAt,summary})),
          traces:project.conversation.filter(v=>v.trace).map(v=>({requestId:v.trace.requestId,provider:v.trace.provider,model:v.trace.model,mode:v.trace.mode,reasons:v.trace.reasons,retrieval:v.trace.retrieval,terminationReason:v.trace.terminationReason,preview:v.trace.preview??null})),
          discussions:family?.listDiscussions({projectId})??[],boundary:'用户概念设计与需求交接；非欧派真实SKU、报价、BOM或施工交付。'});return true;
      }
      if(action.startsWith('discussions')){
        if(!family)throw Error('FAMILY_SERVICE_UNAVAILABLE');
        const h=deserializeVersionHistory(project.versionHistory),currentVersionId=h.currentVersionId;
        const pieces=action.split('/'),discussionId=pieces[1],operation=pieces[2];
        if(discussionId&&family.getDiscussion(discussionId).projectId!==projectId)throw Error('PROJECT_ACCESS_DENIED');
        if(!discussionId&&req.method==='GET'){send(res,200,{discussions:family.listDiscussions({projectId,versionId:url.searchParams.get('versionId')??undefined})});return true;}
        if(discussionId&&!operation&&req.method==='GET'){send(res,200,{discussion:family.getDiscussion(discussionId)});return true;}
        if(req.method==='POST'){
          assertSavedProjectState(project);
          const b=await bodyOf(req),eventId=b.eventId??b.requestId;
          if(!discussionId){send(res,201,{discussion:await family.createDiscussion({projectId,versionId:b.versionId??currentVersionId,brief:{...project.requirements,designBrief:project.designBrief},participants:b.participants??[],eventId})});return true;}
          const args={...b,discussionId,eventId,opinionId:b.opinionId??eventId};let result;
          if(operation==='opinions'){
            if(b.source!==undefined&&(!b.source||typeof b.source!=='object'||Array.isArray(b.source)||b.source.kind!=='product_form'))throw Error('OPINION_SOURCE_FORBIDDEN');
            // This public route represents only the project holder currently
            // authenticated by the Bearer token above. Never accept Feishu
            // provenance, record IDs, author objects, or labels from a client;
            // real Base opinions enter exclusively through refreshOpinions.
            result=await family.submitOpinion({
              discussionId,eventId,opinionId:b.opinionId??eventId,
              versionId:b.versionId??currentVersionId,text:b.text,
              source:{kind:'product_form',sourceId:`project-user:${projectId}`,memberLabel:'我'},
            });
          }
          else if(operation==='summarize')result=await family.summarizeDiscussion(args);
          else if(operation==='adopt')result=await family.adoptDecision(args);
          else if(operation==='outcome')result=await family.linkOutcomeVersion(args);
          else if(operation==='sync'){result=family.refreshOpinions?await family.refreshOpinions({discussionId,versionId:b.versionId??currentVersionId,eventId}):null;await family.flushPending({projectId,discussionId});}
          else throw Error('OPERATION_UNSUPPORTED');
          const key=({opinions:'opinion',summarize:'summary',adopt:'adoption',outcome:'outcome',sync:'sync'})[operation];
          send(res,200,{[key]:result,discussion:family.getDiscussion(discussionId)});return true;
        }
      }
      send(res,404,{error:'NOT_FOUND'});
    }catch(e){
      const code=safeError(e);let auditStatus='not_applicable';
      if(failureContext&&e.trace&&store.recordFailure){
        try{store.recordFailure(failureContext.projectId,failureContext.token,{requestId:failureContext.requestId,error:code,trace:e.trace});auditStatus='recorded';}
        catch{auditStatus='write_failed';}
      }
      const data={error:code,...(e.trace?{trace:e.trace}:{}),auditStatus,message:'本次操作未完成；已保存的方案保持不变。'};
      if(streaming){emit({type:'error',...data});if(!res.destroyed)res.end();}
      else send(res,/ACCESS_DENIED/.test(code)?403:/NOT_FOUND/.test(code)?404:/CONFLICT|STALE|BUSY|PREVIEW_DECISION_REQUIRED|WORKING_DRAFT/.test(code)?409:/RATE_LIMIT/.test(code)?429:/DEEPSEEK|DEADLINE|UNAVAILABLE/.test(code)?503:400,data);
    }
    return true;
  };
}
