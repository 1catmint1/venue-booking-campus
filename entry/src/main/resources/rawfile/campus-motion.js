(()=>{
 'use strict';
 const reduce=matchMedia('(prefers-reduced-motion: reduce)'),small=matchMedia('(max-width: 760px)');
 const app=document.getElementById('app'),preferenceKey='venue-appearance-v1';
 let effect=null,ambientEffect=null;
 let preferences={enabled:true,interactive:true,celebration:true};
 try{const stored=JSON.parse(localStorage.getItem(preferenceKey)||'{}');for(const key of Object.keys(preferences))if(typeof stored[key]==='boolean')preferences[key]=stored[key];}catch(_){}
 const celebrated=new Set();let confettiTimer=0;
 function controls(){
  for(const [id,key] of [['motion-enabled','enabled'],['motion-interactive','interactive'],['motion-celebration','celebration']]){const input=document.getElementById(id);if(input){input.checked=preferences[key];input.disabled=reduce.matches;}}
  const status=document.getElementById('motion-system-status');if(status)status.textContent=reduce.matches?'系统已开启减少动态效果，当前使用静态界面。':preferences.enabled?'背景正在播放；鼠标移动或手指滑过时可与附近粒子互动。':'背景已暂停；设置会在下次打开时保留。';
  const preview=document.querySelector('[data-motion-preview]');if(preview)preview.disabled=reduce.matches||!preferences.celebration;
 }
 function removeCelebration(){clearTimeout(confettiTimer);document.querySelector('.booking-confetti')?.remove();}
 function celebrate(preview=false){
  if(reduce.matches||document.hidden||!preferences.celebration)return;
  removeCelebration();const layer=document.createElement('div');layer.className='booking-confetti';layer.setAttribute('aria-hidden','true');layer.dataset.preview=String(preview);
  const count=small.matches?28:48,colors=['#13a89a','#2a78c7','#efb84f','#e47e63','#b5dfd3'];
  for(let i=0;i<count;i++){const piece=document.createElement('i'),side=i%2;piece.style.cssText=`--x:${side?92:8}vw;--dx:${(side?-1:1)*(35+(i*31)%470)}px;--rise:${150+(i*47)%330}px;--fall:${120+(i*61)%400}px;--spin:${(i%2?1:-1)*(180+(i*53)%540)}deg;--delay:${(i%7)*22}ms;--color:${colors[i%colors.length]}`;layer.append(piece);}
  document.body.append(layer);confettiTimer=setTimeout(removeCelebration,1900);
 }
 function network(host,ambient=false){
  host.closest('.hero')?.querySelector('.campus-particles')?.remove();
  const layer=document.createElement('div'),gradient=document.createElement('div'),canvas=document.createElement('canvas');
  layer.className=ambient?'motion-backdrop ambient-backdrop':'motion-backdrop';layer.setAttribute('aria-hidden','true');gradient.className=ambient?'motion-gradient ambient-gradient':'motion-gradient';canvas.className=ambient?'network-canvas ambient-canvas':'network-canvas';
  canvas.dataset.maxFps='60';canvas.dataset.idleFps='30';canvas.dataset.scope=ambient?'page':'hero';canvas.dataset.revision='network-r6';canvas.dataset.interactionModel='repel-swirl-wake-spring';canvas.dataset.rings='none';layer.append(gradient,canvas);host.prepend(layer);
  const ctx=canvas.getContext('2d',{alpha:true});
  let frame=0,lastTick=0,lastMove=0,width=1,height=1,nodes=[],visible=true,disposed=false;
  let frames=0,lastReport=0,drawMilliseconds=0,drawSamples=0,ro=null,io=null;
  let pointer={x:0,y:0},target={x:0,y:0},lastPointer=-10000,interaction=0,windX=0,windY=0,settling=false;
  let documentLeft=0,documentTop=0,pointerPending=0,lastDrawAt=0,rateAt=0,rateFrames=0;
  const gaps=[],inputDelays=[];
  const random=i=>{const n=Math.sin(i*127.1+43.7)*43758.5453;return n-Math.floor(n);};
  function seed(){
   const count=ambient?(small.matches?36:64):(small.matches?28:44);
   if(nodes.length!==count){nodes=Array.from({length:count},(_,i)=>({x:.04+random(i+1)*.92,y:.04+random(i+101)*.92,vx:(random(i+201)>.5?1:-1)*(14+random(i+301)*15),vy:(random(i+401)>.5?1:-1)*(9+random(i+501)*16),phase:random(i+601)*Math.PI*2,ox:0,oy:0,ux:0,uy:0}));if(ambient)for(const n of nodes){n.vx*=.55;n.vy*=.55;}}
   canvas.dataset.nodes=String(count);
  }
  function resize(){
   const b=ambient?{width:innerWidth,height:innerHeight}:host.getBoundingClientRect();width=Math.max(1,b.width);height=Math.max(1,b.height);
   if(!ambient){documentLeft=b.left+scrollX;documentTop=b.top+scrollY;}
   const scale=Math.min(devicePixelRatio||1,ambient||small.matches?1:1.25,1000/width,850/height);
   canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
   if(ctx)ctx.setTransform(scale,0,0,scale,0,0);seed();if(ctx&&!frame)draw(0,0);
  }
  function draw(dt,time){
   if(!ctx)return;const begin=performance.now();ctx.clearRect(0,0,width,height);
   pointer.x=target.x;pointer.y=target.y;
   const desired=preferences.interactive&&time-lastPointer<1200?1:0;interaction+=(desired-interaction)*(1-Math.exp(-Math.max(dt,.001)/.035));let influenced=0;
   if(pointerPending){inputDelays.push(performance.now()-pointerPending);if(inputDelays.length>120)inputDelays.shift();pointerPending=0;}
   if(time&&lastDrawAt){gaps.push(time-lastDrawAt);if(gaps.length>120)gaps.shift();}if(time)lastDrawAt=time;
   const reach=ambient?(small.matches?120:160):(small.matches?115:150),radius=small.matches?185:255,step=Math.min(dt,1/30);
   let maxOffset=0;settling=false;
   const points=nodes.map(n=>{
    if(dt){n.x+=n.vx*dt/width;n.y+=n.vy*dt/height;
     if(n.x<.015){n.x=.015;n.vx=Math.abs(n.vx);}if(n.x>.985){n.x=.985;n.vx=-Math.abs(n.vx);}
     if(n.y<.015){n.y=.015;n.vy=Math.abs(n.vy);}if(n.y>.985){n.y=.985;n.vy=-Math.abs(n.vy);}
    }const x=n.x*width,y=n.y*height,dx=x+n.ox-pointer.x,dy=y+n.oy-pointer.y,distance=Math.hypot(dx,dy),weight=Math.pow(Math.max(0,1-distance/radius),2)*interaction;
    let ax=-28*n.ox-7.2*n.ux,ay=-28*n.oy-7.2*n.uy;
    if(weight>.005){influenced++;const nx=distance>1?dx/distance:Math.cos(n.phase),ny=distance>1?dy/distance:Math.sin(n.phase),turn=windX<0?-1:1,spin=(Math.hypot(windX,windY)>80?650:250)*turn;ax+=(nx*2200-ny*spin+windX*.9)*weight;ay+=(ny*2200+nx*spin+windY*.9)*weight;}
    n.ux+=ax*step;n.uy+=ay*step;n.ox+=n.ux*step;n.oy+=n.uy*step;
    const offset=Math.hypot(n.ox,n.oy);if(offset>125){n.ox*=125/offset;n.oy*=125/offset;n.ux*=.7;n.uy*=.7;}maxOffset=Math.max(maxOffset,Math.min(offset,125));if(offset>1||Math.hypot(n.ux,n.uy)>5)settling=true;
    return {x:x+n.ox,y:y+n.oy};
   });
   windX*=Math.exp(-step*7);windY*=Math.exp(-step*7);
   ctx.lineWidth=.85;
   for(let i=0;i<points.length;i++){let links=0;for(let j=i+1;j<points.length&&links<3;j++){
    const a=points[i],b=points[j],dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy;
    if(d2<reach*reach){const d=Math.sqrt(d2);ctx.strokeStyle=ambient?`rgba(37,110,146,${.21*(1-d/reach)+.04})`:`rgba(182,239,255,${.37*(1-d/reach)+.045})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();links++;if(ambient&&i%5===0&&links===1){const travel=(time*.00012+i*.137)%1;ctx.fillStyle='rgba(17,133,151,.65)';ctx.beginPath();ctx.arc(a.x+(b.x-a.x)*travel,a.y+(b.y-a.y)*travel,2.6,0,Math.PI*2);ctx.fill();}}
   }}
   for(let i=0;i<points.length;i++){
    const p=points[i],pulse=.5+.5*Math.sin(time*.0015+nodes[i].phase);
    ctx.fillStyle=ambient?(i%3===0?'rgba(49,108,181,.55)':'rgba(21,132,149,.55)'):(i%3===0?'rgba(145,211,255,.95)':'rgba(216,255,248,.9)');ctx.beginPath();ctx.arc(p.x,p.y,(ambient?1.6:2)+1.1*pulse,0,Math.PI*2);ctx.fill();
   }
   frames++;drawMilliseconds+=performance.now()-begin;drawSamples++;
   if(time-lastReport>1000||!lastReport){
    canvas.dataset.frames=String(frames);canvas.dataset.firstPoint=points[0].x.toFixed(2)+','+points[0].y.toFixed(2);canvas.dataset.averageDrawMs=(drawMilliseconds/drawSamples).toFixed(3);canvas.dataset.pointer=pointer.x.toFixed(1)+','+pointer.y.toFixed(1);canvas.dataset.pointerTarget=target.x.toFixed(1)+','+target.y.toFixed(1);canvas.dataset.interacting=String(interaction>.1);canvas.dataset.influenced=String(influenced);canvas.dataset.maxDisplacement=maxOffset.toFixed(1);canvas.dataset.settling=String(settling);
    if(rateAt)canvas.dataset.measuredFps=((frames-rateFrames)*1000/(time-rateAt)).toFixed(1);rateAt=time;rateFrames=frames;
    if(inputDelays.length){const sorted=[...inputDelays].sort((a,b)=>a-b);canvas.dataset.inputFrameP95Ms=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))].toFixed(2);canvas.dataset.inputSamples=String(sorted.length);}
    lastReport=time||1;
   }
  }
  function tick(time){
   frame=0;if(disposed||canvas.dataset.motion!=='running')return;
   const active=preferences.interactive&&(time-lastPointer<1200||settling),interval=1000/(active?60:30);
   if(!lastTick||time-lastTick>=interval-.5){const dt=lastMove?Math.min(.1,(time-lastMove)/1000):1/60;draw(dt,time);lastMove=time;lastTick=lastTick?lastTick+Math.max(1,Math.floor((time-lastTick+.5)/interval))*interval:time;}
   frame=requestAnimationFrame(tick);
  }
  function lifecycle(){
   if(disposed)return;
   const status=!ctx?'unavailable':reduce.matches?'reduced':document.hidden?'background':!visible?'offscreen':!preferences.enabled?'paused':'running';
   canvas.dataset.motion=status;host.classList.toggle('network-paused',status!=='running');
   if(status==='running'&&!frame){lastTick=0;lastMove=0;lastDrawAt=0;rateAt=0;frame=requestAnimationFrame(tick);}if(status!=='running'&&frame){cancelAnimationFrame(frame);frame=0;}
  }
  const move=e=>{if(!preferences.interactive||reduce.matches||!preferences.enabled)return;const next={x:ambient?e.clientX:e.clientX+scrollX-documentLeft,y:ambient?e.clientY:e.clientY+scrollY-documentTop},now=performance.now(),elapsed=Math.max(.008,(now-lastPointer)/1000);if(now-lastPointer<180){windX=windX*.35+Math.max(-1400,Math.min(1400,(next.x-target.x)/elapsed))*.65;windY=windY*.35+Math.max(-1400,Math.min(1400,(next.y-target.y)/elapsed))*.65;}target=next;lastPointer=now;pointerPending=lastPointer;if(canvas.dataset.pointerType!==(e.pointerType||'mouse'))canvas.dataset.pointerType=e.pointerType||'mouse';};
  const touch=e=>{const p=e.touches[0];if(p)move({clientX:p.clientX,clientY:p.clientY,pointerType:'touch'});};
  const leave=()=>{lastPointer=-10000;};
  const down=e=>{move(e);};
  host.addEventListener('pointermove',move,{passive:true});host.addEventListener('pointerdown',down,{passive:true});host.addEventListener('pointerleave',leave,{passive:true});host.addEventListener('pointercancel',leave,{passive:true});host.addEventListener('touchmove',touch,{passive:true});resize();
  if(!ambient&&typeof ResizeObserver==='function'){ro=new ResizeObserver(resize);ro.observe(host);}else addEventListener('resize',resize,{passive:true});
  if(!ambient&&typeof IntersectionObserver==='function'){io=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting!==false;lifecycle();},{threshold:.03});io.observe(host);}
  lifecycle();
  return {host,canvas,lifecycle,resize,dispose(){disposed=true;if(frame)cancelAnimationFrame(frame);frame=0;ro?.disconnect();io?.disconnect();removeEventListener('resize',resize);host.removeEventListener('pointermove',move);host.removeEventListener('pointerdown',down);host.removeEventListener('pointerleave',leave);host.removeEventListener('pointercancel',leave);host.removeEventListener('touchmove',touch);}};
 }
 function sync(){const host=document.querySelector('.hero-copy');if(effect&&effect.host!==host){effect.dispose();effect=null;}if(host&&!effect)effect=network(host);controls();}
 const visibility=()=>{document.documentElement.classList.toggle('motion-paused',document.hidden);if(document.hidden)removeCelebration();effect?.lifecycle();ambientEffect?.lifecycle();};
 document.addEventListener('visibilitychange',visibility);reduce.addEventListener('change',()=>{if(reduce.matches)removeCelebration();effect?.lifecycle();ambientEffect?.lifecycle();controls();});small.addEventListener('change',()=>{effect?.resize();ambientEffect?.resize();});
 if(app)new MutationObserver(sync).observe(app,{childList:true});ambientEffect=network(document.body,true);visibility();sync();
 document.addEventListener('change',event=>{const key={'motion-enabled':'enabled','motion-interactive':'interactive','motion-celebration':'celebration'}[event.target.id];if(!key)return;preferences[key]=event.target.checked;try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));}catch(_){}if(!preferences.celebration)removeCelebration();effect?.lifecycle();ambientEffect?.lifecycle();controls();});
 document.addEventListener('venue:booking-confirmed',event=>{const id=event.detail?.orderId;if(!id||celebrated.has(id))return;celebrated.add(id);if(celebrated.size>64)celebrated.delete(celebrated.values().next().value);celebrate();});
 let lastFeedbackTarget=null,lastFeedbackAt=0;
 function feedback(event){
  if(reduce.matches||document.hidden||!preferences.celebration)return;const target=event.target.closest('button');if(!target||target.disabled||target.getAttribute('aria-disabled')==='true')return;
  if(event.type==='click'&&lastFeedbackTarget===target&&performance.now()-lastFeedbackAt<700)return;
  lastFeedbackTarget=target;lastFeedbackAt=performance.now();
  const box=event.type==='click'&&!event.detail?target.getBoundingClientRect():null,x=box?box.x+box.width/2:event.clientX,y=box?box.y+box.height/2:event.clientY;
  const spark=document.createElement('span');spark.className='click-feedback';spark.setAttribute('aria-hidden','true');spark.style.left=x+'px';spark.style.top=y+'px';
  for(let i=0;i<6;i++){const p=document.createElement('i');p.style.setProperty('--angle',(i*60)+'deg');spark.append(p);}document.querySelectorAll('.click-feedback').forEach(e=>e.remove());document.body.append(spark);setTimeout(()=>spark.remove(),600);
  if(target.animate)target.animate([{transform:'scale(.97)'},{transform:'scale(1.02)',offset:.6},{transform:'scale(1)'}],{duration:190,easing:'ease-out'});
  else{target.classList.add('button-pop');setTimeout(()=>target.classList.remove('button-pop'),280);}
 }
 document.addEventListener('pointerdown',feedback,{capture:true,passive:true});
 document.addEventListener('click',event=>{feedback(event);if(event.target.closest('[data-motion-preview]'))celebrate(true);},true);
})();
