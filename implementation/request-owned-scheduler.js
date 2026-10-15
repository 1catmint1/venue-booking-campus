// Shared queues hold plain data only. Every invocation owns its timers and I/O.
async function batchedShared(db,kind,value,execute){
 let qs=sharedQueues.get(db);if(!qs){qs=new Map();sharedQueues.set(db,qs)}
 let q=qs.get(kind);if(!q){q={items:[],running:0,queuedBytes:0};qs.set(kind,q)}
 const weight=new TextEncoder().encode(JSON.stringify(value)).length;
 if(q.items.length>=12000||q.queuedBytes+weight>16000000)throw sharedError('受理队列已满，可使用原请求标识重试',503);
 const item={value,weight,at:Date.now(),done:false,processing:false};q.items.push(item);q.queuedBytes+=weight;
 const limit=kind==='apply'?128:16,deadline=Date.now()+90000;let led=0;
 while(!item.done||(led>0&&led<4&&q.items.length&&q.running<2)){
  if(!item.done&&Date.now()>=deadline){if(!item.processing){const at=q.items.indexOf(item);if(at>=0){q.items.splice(at,1);q.queuedBytes-=weight}}throw sharedError('受理等待超时，请按原请求标识核对或重试，未确认前不视为成功',503)}
  if(q.items.length&&q.running<2&&(q.items.length>=limit||Date.now()-q.items[0].at>=20)){
   let bytes=0,count=0;for(const entry of q.items){if(count>=limit||count&&bytes+entry.weight>900000)break;bytes+=entry.weight;count++}
   const batch=q.items.splice(0,count);q.queuedBytes-=bytes;q.running++;led++;for(const entry of batch)entry.processing=true;
   try{
    let results;
    for(let attempt=0,until=Date.now()+60000;attempt<18;attempt++){
     try{results=await execute(batch.map(entry=>entry.value));break}
     catch(error){const message=error.message||'';if(attempt===17||Date.now()>=until||/syntax|constraint|too big|SQLITE_FULL|corrupt|SHARED_STOCK_CAPACITY|SQLITE_AUTH/i.test(message)||!/D1_ERROR|busy|overload|too many|timeout|reset|connection|network|internal error/i.test(message))throw error;await pause(Math.random()*Math.min(2500,100*2**attempt)+40)}
    }
    for(let i=0;i<batch.length;i++){batch[i].result=results[i];batch[i].done=true}
   }catch(error){error.sharedStage=kind;for(const entry of batch){entry.error=error;entry.done=true}}
   finally{q.running--;if(!q.running&&!q.items.length)qs.delete(kind)}
  }else if(item.done)break;else await pause(q.items[0]===item?5:50);
 }
 if(item.error)throw item.error;return item.result;
}
