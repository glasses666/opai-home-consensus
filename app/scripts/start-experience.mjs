import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve, join } from 'node:path';
import { createAppServer } from '../server/index.mjs';
import { createExperienceRuntime } from '../server/experience-runtime.mjs';

const envPath=resolve('.env.local');
if(existsSync(envPath))for(const [key,value] of Object.entries(parseEnv(readFileSync(envPath,'utf8'))))if(process.env[key]===undefined)process.env[key]=value;
// Explicit local development option: reuse existing product provider secrets
// in process memory only. No remote mutations, no secrets in files or output.
if(process.argv.includes('--existing-opai-provider')){
  const output=execFileSync('ssh',['-o','BatchMode=yes','ailcloud-esc',
    `python3 -c 'import json; print(json.dumps({k:v for k,v in (l.strip().split("=",1) for l in open("/opt/opai/shared/app.env") if l.startswith("DEEPSEEK_"))}))'`],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','inherit']});
  for(const [key,value] of Object.entries(JSON.parse(output)))if(key.startsWith('DEEPSEEK_'))process.env[key]=value;
}
const directory=resolve(process.env.OPAI_EXPERIENCE_DATA_DIR||'.data/experience-candidate');
const {handler:experienceHandler}=createExperienceRuntime({directory});
const port=Number(process.env.PORT||8794);
createAppServer({experienceHandler,sync:async()=>{throw Error('LEGACY_SYNC_DISABLED_IN_CANDIDATE');}}).listen(port,'127.0.0.1',()=>{
  console.log(JSON.stringify({service:'opai-experience',url:`http://127.0.0.1:${port}`,provider:'deepseek',model:process.env.DEEPSEEK_MODEL||'deepseek-v4-flash',credentialAvailable:!!process.env.DEEPSEEK_API_KEY,dataDirectory:directory,productionWrites:false}));
});
