import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
/** Reproducible source/dependency contract fingerprint; never reads .env or project data. */
export function sourceFingerprint(app=fileURLToPath(new URL('../',import.meta.url))) {
  const files=[];
  const visit=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){
    const path=resolve(dir,entry.name);
    if(entry.isDirectory())visit(path);
    else if(entry.isFile()&&/\.(?:js|jsx|mjs|css|json)$/.test(entry.name))files.push(path);
  }};
  visit(resolve(app,'src'));visit(resolve(app,'server'));
  files.push(resolve(app,'package.json'),resolve(app,'package-lock.json'));
  const hash=createHash('sha256');
  for(const file of files.sort()){hash.update(relative(app,file).replaceAll('\\','/')+'\0');hash.update(readFileSync(file));hash.update('\0');}
  return hash.digest('hex');
}
