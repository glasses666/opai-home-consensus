/** HTTP and progress protocol shared by the actual UI and deterministic regressions. */
export const PHASE_LABELS = Object.freeze({
  preparing:'正在核对项目与当前草稿…', observing:'正在读取房间、门窗和家具关系…',
  planning:'正在推敲空间方案…', validating:'正在检查边界、碰撞和保留条件…',
  reviewing:'正在复核方案是否回应你的需要…', repairing:'这次尝试还不够合适，正在据此调整…',
  preview_ready:'预览已通过检查，正在应用到房间…',
});
const failure = (code, body) => Object.assign(Error(code),{trace:body?.trace});
const abortableDelay = (ms,signal) => new Promise((resolve,reject)=>{
  signal?.throwIfAborted();
  const finish=()=>{signal?.removeEventListener('abort',abort);resolve();};
  const timer=setTimeout(finish,ms);
  const abort=()=>{clearTimeout(timer);reject(signal.reason??Error('REQUEST_CANCELLED'));};
  signal?.addEventListener('abort',abort,{once:true});
});
export async function readJsonResponse(response) {
  const text=await response.text();
  // Project reopen includes saved versions and provenance; it is larger than one turn.
  if(text.length>64*1024*1024)throw failure('RESPONSE_TOO_LARGE');
  let body;
  try{body=text?JSON.parse(text):{};}
  catch{throw failure(response.ok?'RESPONSE_JSON_INVALID':`HTTP_${response.status}`);}
  if(!response.ok)throw Object.assign(failure(body?.error?.code??body?.error??`HTTP_${response.status}`,body),{status:response.status});
  return body;
}
export async function fetchJson(path,options={},fetchImpl=fetch) {
  return readJsonResponse(await fetchImpl(path,{...options,signal:options.signal??AbortSignal.timeout(12000)}));
}
export async function fetchEntryWithRetry(path,options={}, {
  fetchImpl=fetch,requestedProject=false,maxAttempts=3,delay=abortableDelay,onAttempt=()=>{},
}={}) {
  // The same body (including creation requestId) is reused, never a second creation.
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    options.signal?.throwIfAborted();onAttempt(attempt);
    try{return await fetchJson(path,options,fetchImpl);}
    catch(error){
      const transient=[429,502,503,504].includes(error.status)
        || /^(HTTP_(429|502|503|504)|RATE_LIMIT)$/.test(error.message)
        || error instanceof TypeError || ['TimeoutError','AbortError'].includes(error.name)
        || (!requestedProject&&error.message==='NOT_FOUND');
      if(options.signal?.aborted||!transient||attempt===maxAttempts)throw error;
      await delay(250*2**(attempt-1),options.signal);
    }
  }
  throw Error('ENTRY_RETRY_BUDGET');
}

export async function readTurnResponse(response,{signal,onProgress=()=>{}}={}) {
  if(!response.ok || !response.headers.get('content-type')?.includes('application/x-ndjson')) return readJsonResponse(response);
  if(!response.body)throw failure('TURN_STREAM_MISSING');
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',bytes=0,result;
  const consume=line=>{
    if(!line.trim())return;
    let frame;try{frame=JSON.parse(line);}catch{throw failure('TURN_STREAM_INVALID');}
    if(result!==undefined)throw failure('TURN_STREAM_TRAILING_FRAME');
    if(frame.type==='progress'){
      if(!Object.hasOwn(PHASE_LABELS,frame.phase)||!Number.isFinite(frame.elapsedMs))throw failure('TURN_PROGRESS_INVALID');
      onProgress(frame);return;
    }
    if(frame.type==='error')throw failure(frame.error??'REQUEST_FAILED',frame);
    if(frame.type==='result'&&frame.data&&typeof frame.data==='object'){result=frame.data;return;}
    throw failure('TURN_FRAME_INVALID');
  };
  const abort=()=>{void reader.cancel().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    while(true){
      signal?.throwIfAborted();
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;if(bytes>8*1024*1024)throw failure('RESPONSE_TOO_LARGE');
      pending+=decoder.decode(value,{stream:true});
      let newline;
      while((newline=pending.indexOf('\n'))!==-1){consume(pending.slice(0,newline));pending=pending.slice(newline+1);}
    }
    signal?.throwIfAborted();pending+=decoder.decode();
    if(pending.trim())consume(pending);
    if(result===undefined)throw failure('TURN_STREAM_INTERRUPTED');
    return result;
  } finally {
    signal?.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();
  }
}
