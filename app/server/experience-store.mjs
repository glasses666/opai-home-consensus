import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createReferenceHome } from '../src/domain/reference-home.js';
import { DEMO_DARK_WALNUT_FLOOR_MATERIAL } from '../src/domain/demo-scene.js';
import { createSceneStore, deserializeScene, serializeScene, dispatchSceneCommand } from '../src/domain/scene.js';
import { createVersionHistory, deserializeVersionHistory, serializeVersionHistory, sceneStoreForVersion } from '../src/domain/design-version.js';
import { createDesignBrief, normalizeDesignBrief } from '../src/domain/design-brief.js';
import { emptyRequirements, assertRequirementConstraints } from '../src/agent/dialogue.js';

const clone = v => JSON.parse(JSON.stringify(v));
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const equalRecord = (a,b) => equal(
  Object.fromEntries(Object.entries(a ?? {}).sort(([left],[right]) => left.localeCompare(right))),
  Object.fromEntries(Object.entries(b ?? {}).sort(([left],[right]) => left.localeCompare(right))),
);
const safeId = id => typeof id === 'string' && /^exp-[a-f0-9-]{36}$/.test(id);
export function createExperienceScene(){
  const scene=createReferenceHome();
  scene.materials.push(...[
    ['mat-fabric-linen','暖亚麻织物','#d9c5a6'],['mat-fabric-clay','陶土织物','#b87a60'],['mat-fabric-charcoal','炭灰织物','#555654'],
  ].map(([id,name,color])=>({id,name,color,kind:'fabric',appliesTo:['object'],source:'demo'})));
  return scene;
}
const envelope = s => ({projectId:s.projectId,project:{id:s.projectId,name:s.name},revision:s.revision,versionHistory:s.versionHistory,
  designBrief:s.designBrief,requirements:s.requirements,conversation:s.conversation,createdAt:s.createdAt,updatedAt:s.updatedAt,houseId:s.houseId});

export function validateClientHistory(serialized, current) {
  const history = deserializeVersionHistory(serialized);
  const prior = deserializeVersionHistory(current.versionHistory);
  if (serializeScene(history.initialScene) !== serializeScene(prior.initialScene)) throw Error('INITIAL_SCENE_CONFLICT');
  for (const v of prior.versions) {
    const incoming = history.versions.find(n=>n.id===v.id);
    if (!incoming || serializeScene(incoming.scene)!==serializeScene(v.scene)) throw Error('VERSION_HISTORY_CONFLICT');
  }
  for (const v of history.versions) sceneStoreForVersion(history,v.id);
  const next = sceneStoreForVersion(history);
  assertRequirementConstraints(sceneStoreForVersion(prior).currentScene,next.currentScene,current.requirements);
  return {history,store:next};
}

// The browser may carry unsaved manual changes. Reconstruct ONLY permitted
// deltas through the same deterministic command validator; never trust its caps.
export function validatedWorkingStore(serializedScene, history, requirements) {
  let store = sceneStoreForVersion(history);
  if (!serializedScene) return store;
  const target = deserializeScene(serializedScene), original = store.currentScene;
  const originalMaterials = new Map(original.materials.map(material => [material.id, material]));
  const targetMaterials = new Map(target.materials.map(material => [material.id, material]));
  for (const [id, material] of originalMaterials) {
    if (!targetMaterials.has(id) || !equal(material, targetMaterials.get(id))) throw Error('SCENE_FACTS_CONFLICT');
  }
  const addedMaterials = target.materials.filter(material => !originalMaterials.has(material.id));
  for (const material of addedMaterials) {
    if (!equalRecord(material, DEMO_DARK_WALNUT_FLOOR_MATERIAL)) throw Error('SCENE_FACTS_CONFLICT');
    store = dispatchSceneCommand(store, { type: 'material.add', material });
  }
  const protectedScene = scene => ({...scene,
    objects:[],
    materials:[],
    surfaces:scene.surfaces.map(s=>{const {materialId,roomMaterialIds,...rest}=s;return rest;})});
  // Deletion is supported, but the remaining entity metadata must stay canonical.
  const oldShape = protectedScene(original), newShape = protectedScene(target);
  if (!equal(oldShape,newShape)) throw Error('SCENE_FACTS_CONFLICT');
  for (const a of original.objects) {
    const b = target.objects.find(o=>o.id===a.id);
    if (!b) {store=dispatchSceneCommand(store,{type:'object.delete',objectId:a.id});continue;}
    if (!equal(a.transform,b.transform)) store=dispatchSceneCommand(store,{type:'object.setTransform',objectId:a.id,transform:b.transform});
    if (!equal(a.dimensions,b.dimensions)) store=dispatchSceneCommand(store,{type:'object.setDimensions',objectId:a.id,dimensions:b.dimensions});
    if (a.materialId!==b.materialId) store=dispatchSceneCommand(store,{type:'object.setMaterial',objectId:a.id,materialId:b.materialId});
  }
  for(const a of original.surfaces){
    const b=target.surfaces.find(s=>s.id===a.id);
    if(a.materialId!==b.materialId)store=dispatchSceneCommand(store,{type:'surface.setMaterial',surfaceId:a.id,materialId:b.materialId});
    for(const [roomId,materialId] of Object.entries(b.roomMaterialIds??{})){
      if(store.currentScene.surfaces.find(s=>s.id===a.id).roomMaterialIds?.[roomId]!==materialId)store=dispatchSceneCommand(store,{type:'surface.setMaterial',surfaceId:a.id,roomId,materialId});
    }
  }
  if (serializeScene(store.currentScene)!==serializeScene(target)) throw Error('SCENE_REPLAY_MISMATCH');
  assertRequirementConstraints(original,store.currentScene,requirements);
  return store;
}

export function createExperienceStore({directory,initialScene=createExperienceScene,now=()=>new Date().toISOString()}={}) {
  if(!directory)throw Error('EXPERIENCE_DIRECTORY_REQUIRED');
  mkdirSync(directory,{recursive:true,mode:0o700});
  const cache=new Map(), creations=new Map(),busy=new Map(),invalidProjects=new Set();
  for(const name of readdirSync(directory).filter(n=>/^exp-[a-f0-9-]+\.json$/.test(n))){
    const id=name.slice(0,-5);let s;
    try{s=JSON.parse(readFileSync(join(directory,name),'utf8'));if(!safeId(s.projectId)||s.projectId!==id||typeof s.accessToken!=='string')throw Error('EXPERIENCE_DATA_INVALID');}
    catch{invalidProjects.add(id);continue;}
    try{deserializeVersionHistory(s.versionHistory);}catch{invalidProjects.add(s.projectId);}
    cache.set(s.projectId,s);
    if(s.creationId)creations.set(s.creationId,s.projectId);
  }
  const persist=s=>{const path=join(directory,s.projectId+'.json'),tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(s),{mode:0o600});renameSync(tmp,path);cache.set(s.projectId,s);};
  const get=id=>{if(invalidProjects.has(id))throw Error('PROJECT_VALIDATION_REQUIRED');const s=cache.get(id);if(!s)throw Error('PROJECT_NOT_FOUND');return s;};
  const auth=(id,token)=>{const s=get(id);const a=Buffer.from(s.accessToken),b=Buffer.from(typeof token==='string'?token:'');if(a.length!==b.length||!timingSafeEqual(a,b))throw Error('PROJECT_ACCESS_DENIED');return s;};
  return {
    create({requestId}={}) {
      if(requestId&&creations.has(requestId)){const s=get(creations.get(requestId));return {...envelope(s),accessToken:s.accessToken};}
      if(cache.size>=500)throw Error('PROJECT_LIMIT');
      const projectId='exp-'+randomUUID(),scene=initialScene(),at=now();
      const s={schemaVersion:1,projectId,houseId:scene.id,name:'我的生活空间',accessToken:randomBytes(32).toString('hex'),revision:0,
        creationId:requestId??null,createdAt:at,updatedAt:at,versionHistory:serializeVersionHistory(createVersionHistory(createSceneStore(scene),{id:'history-'+projectId})),
        designBrief:createDesignBrief(),requirements:emptyRequirements(),conversation:[],receipts:{},handoffs:[]};
      persist(s);if(requestId)creations.set(requestId,projectId);return {...envelope(s),accessToken:s.accessToken};
    },
    read(id,token){return clone(envelope(auth(id,token)));},
    snapshot(id,token){return clone(auth(id,token));},
    getVersionContext({projectId,versionId}){const s=get(projectId),h=deserializeVersionHistory(s.versionHistory);const v=h.versions.find(v=>v.id===versionId);return {exists:!!v,saved:!!v,currentVersionId:h.currentVersionId,parentVersionId:v?.parentVersionId,scene:v?.scene};},
    async transact(id,token,{requestId,expectedRevision,operation,payload},fn){
      const s=auth(id,token);
      if(typeof requestId!=='string'||!requestId||requestId.length>160)throw Error('REQUEST_ID_INVALID');
      const signature=JSON.stringify({operation,payload});
      const receipt=s.receipts[requestId];
      if(receipt){if(receipt.signature!==signature)throw Error('EVENT_ID_CONFLICT');return clone({...receipt.result,replayed:true});}
      if(busy.has(id))throw Error('PROJECT_BUSY');
      if(!Number.isInteger(expectedRevision)||s.revision!==expectedRevision)throw Error('VERSION_CONFLICT');
      busy.set(id,true);
      try {
        const draft=clone(s),result=await fn(draft);
        draft.revision++;draft.updatedAt=now();
        const response={...result,revision:draft.revision};
        draft.receipts[requestId]={signature,result:response};
        const receiptKeys=Object.keys(draft.receipts);for(const key of receiptKeys.slice(0,-100))delete draft.receipts[key];
        persist(draft);return clone(response);
      } finally{busy.delete(id);}
    },
    save(id,token,body){return this.transact(id,token,{...body,operation:'save',payload:{versionHistory:body.versionHistory,designBrief:body.designBrief}},s=>{
      const {history}=validateClientHistory(body.versionHistory,s);
      s.versionHistory=serializeVersionHistory(history);s.designBrief=normalizeDesignBrief(body.designBrief??s.designBrief);
      return envelope(s);
    });},
  };
}
