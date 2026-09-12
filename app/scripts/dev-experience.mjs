#!/usr/bin/env node
/** One local entrypoint owns API + Vite, so a fresh session never points at an absent BFF. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const apiPort=Number(process.env.OPAI_API_PORT??8794),webPort=Number(process.env.OPAI_WEB_PORT??5180);
if(![apiPort,webPort].every(p=>Number.isInteger(p)&&p>1023&&p<=65535)||apiPort===webPort)throw Error('LOCAL_PORT_INVALID');
const origin=`http://127.0.0.1:${apiPort}`,children=new Set();let closing=false;
function shutdown(code=0){
  if(closing)return;closing=true;
  for(const child of children)child.kill('SIGTERM');
  process.exitCode=code;
}
process.on('SIGINT',()=>shutdown(130));process.on('SIGTERM',()=>shutdown(143));
const child=(args,env)=>{
  const result=spawn(process.execPath,args,{cwd:app,env:{...process.env,...env},stdio:'inherit'});children.add(result);
  result.once('error',error=>{console.error(error.code??'LOCAL_PROCESS_FAILED');shutdown(1);});
  result.once('exit',code=>{children.delete(result);if(!closing)shutdown(code??1);});return result;
};
async function health(){
  const response=await fetch(origin+'/api/experience/health',{signal:AbortSignal.timeout(1200)});
  if(!response.ok)throw Error('LOCAL_API_PORT_OCCUPIED_BY_WRONG_SERVICE');
  let body;try{body=await response.json();}catch{throw Error('LOCAL_API_PORT_OCCUPIED_BY_WRONG_SERVICE');}
  if(body.service!=='opai-experience'||body.contract!=='harness-review/1'||body.turnStream!=='ndjson')throw Error('LOCAL_API_CONTRACT_MISMATCH');
  return body;
}
try{
  const vite=resolve(app,'node_modules/vite/bin/vite.js');
  if(!existsSync(vite))throw Error('DEPENDENCIES_MISSING: run npm ci in app first');
  let reusable=false;
  try{await health();reusable=true;}
  catch(error){if(error.message.startsWith('LOCAL_API_'))throw error;}
  if(!reusable){
    child(['scripts/start-experience.mjs'],{PORT:String(apiPort)});
    let ready=false;
    for(let attempt=0;attempt<40&&!closing;attempt++){
      try{await health();ready=true;break;}
      catch(error){if(error.message.startsWith('LOCAL_API_'))throw error;await new Promise(r=>setTimeout(r,250));}
    }
    if(!ready)throw Error('LOCAL_API_START_FAILED');
  }
  console.log(JSON.stringify({service:'opai-local-development',api:origin,web:`http://127.0.0.1:${webPort}`,reusedLocalApi:reusable,productionDeployment:false}));
  child([vite,'--host','127.0.0.1','--port',String(webPort),'--strictPort'],{OPAI_API_ORIGIN:origin});
}catch(error){console.error(error.message);shutdown(1);}
