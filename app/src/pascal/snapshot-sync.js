/** Retry a temporarily refused renderer snapshot without dropping the canonical update. */
export function synchronizeSnapshot(apply,{onState=()=>{},schedule=setTimeout,cancel=clearTimeout,maxAttempts=20,intervalMs=100}={}) {
  let stopped=false,timer=null,attempt=0;
  const run=()=>{
    if(stopped)return;
    attempt++;
    try{apply();onState({status:'synced',attempt});}
    catch{
      if(attempt>=maxAttempts){onState({status:'failed',attempt});return;}
      onState({status:'pending',attempt});timer=schedule(run,intervalMs);
    }
  };
  run();return()=>{stopped=true;if(timer!==null)cancel(timer);};
}
