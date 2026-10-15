(function(root) {
  'use strict';
  const D = typeof module==='object' && module.exports ? require('./domain.js') : root.BookingDomain;
  const Learning=typeof module==='object'&&module.exports?require('./preference-learning.js'):root.VenuePreferenceLearning;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const fields=['profile','balance','ledger','membership','health'];
  const prefs=()=>({enabled:false,consent:false,sports:[],venues:[],start:8,end:23,strict:false,excluded:[],badTimes:[],favorites:[]});
  const policy=()=>({activeSlots:4,rollingSlots:6,rollingDays:7,hotSlots:2,hotStart:18,offerMinutes:5,cutoffMinutes:15,eventDays:30});
  const account=id=>{const n=id.slice(-2),s=D.defaults();s.profile.name='体验用户'+n;s.profile.phone='DEMO-000000'+n;return {id,verifiedDemo:true,...Object.fromEntries(fields.map(f=>[f,s[f]])),preferences:prefs()};};
  class InnovationService extends D.DemoService {
    constructor(storage,clock,actor) {
      super(storage,clock);
      if(!this.state.innovation) this.commit(s=>{s.innovation={version:1,current:'demo-01',users:{'demo-01':account('demo-01'),'demo-02':account('demo-02'),'demo-03':account('demo-03')},events:[],admissions:[],queue:[],transfers:[],appeals:[],policy:policy(),sequence:0};for(const f of fields)s.innovation.users['demo-01'][f]=copy(s[f]);for(const o of s.orders){o.ownerId='demo-01';o.credentialVersion=1;}});
      this.actor=actor||this.state.innovation.current;
      if(!this.state.innovation.users[this.actor])throw new Error('未知应用账号');
      for(const f of fields)this.state[f]=copy(this.state.innovation.users[this.actor][f]);
      this.expireTransfers();this.purgeEvents();
    }
    commit(fn) {
      return super.commit(s=>{
        if(this.actor && s.innovation)for(const f of fields)s[f]=copy(s.innovation.users[this.actor][f]);
        const result=fn(s);
        if(this.actor && s.innovation){
          for(const o of s.orders)if(!o.ownerId){o.ownerId=this.actor;o.credentialVersion=1;if(o.status==='pending')s.innovation.admissions.push({user:this.actor,at:this.now(),slots:o.slots.length,orderId:o.id});}
          for(const f of fields)s.innovation.users[this.actor][f]=copy(s[f]);
        }
        return result;
      });
    }
    switchUser(id) {
      if(!this.state.innovation.users[id])throw new Error('只能切换专用虚拟账号');
      this.commit(s=>{s.innovation.current=id;});this.actor=id;
      for(const f of fields)this.state[f]=copy(this.state.innovation.users[id][f]);
      this.expireTransfers();return this.accountInfo();
    }
    snapshot(){const s=super.snapshot();if(this.actor)for(const f of fields)s[f]=copy(s.innovation.users[this.actor][f]);return s;}
    accountInfo(){const u=this.state.innovation.users[this.actor],wx=this.actor.startsWith('wx-');return {id:this.actor,name:u.profile.name,verifiedDemo:u.verifiedDemo,provider:wx?'wechat':'virtual',wechat:wx?'已通过服务端授权；场馆资格待核验':'未配置真实授权',atomgit:'未绑定（可选）'};}
    getOrder(id){const o=super.getOrder(id);if(this.actor && o.ownerId!==this.actor)throw new Error('无权访问其他账号订单');return o;}
    orders(filter){return super.orders(filter).filter(o=>o.ownerId===this.actor);}
    rawOrder(id){const o=this.state.orders.find(x=>x.id===id);if(!o)throw new Error('找不到订单');return o;}
    validCredential(id,version){const o=this.getOrder(id);return o.credentialVersion===version && ['paid','using'].includes(o.status);}
    checkQuota(slots,user=this.actor,ignoreId='') {
      const i=this.state.innovation,u=i.users[user],p=i.policy,now=this.now();
      if(!u || !u.verifiedDemo)throw new Error('需要演示资格验证；微信登录不等于实名或学生资格');
      const active=this.state.orders.filter(o=>o.ownerId===user && o.id!==ignoreId && ['pending','paid','using'].includes(o.status) && o.slots.some(s=>D.stamp(s.date,s.end)>now));
      if(active.reduce((n,o)=>n+o.slots.length,0)+slots.length>p.activeSlots)throw new Error('达到有效场次数上限（演示规则）');
      if(slots.some((a,n)=>slots.slice(n+1).some(b=>a.date===b.date&&a.start<b.end&&b.start<a.end)))throw new Error('同一人不能同时占用两个运动场次');
      const rolling=i.admissions.filter(a=>a.user===user && a.at>now-p.rollingDays*86400000).reduce((n,a)=>n+a.slots,0);
      if(rolling+slots.length>p.rollingSlots)throw new Error('达到滚动预约额度；取消或转出不会清零次数');
      if(active.reduce((n,o)=>n+o.slots.filter(s=>s.start>=p.hotStart).length,0)+slots.filter(s=>s.start>=p.hotStart).length>p.hotSlots)throw new Error('达到热门时段额度（演示规则）');
      const sameTime=(a,b)=>a.date===b.date && a.start<b.end && b.start<a.end;
      if(active.some(o=>o.slots.some(a=>slots.some(b=>sameTime(a,b)))))throw new Error('与本人其他有效预约时间冲突');
    }
    createOrder(slots,token){if(!token)throw new Error('请求标识不能为空');const own=this.state.orders.find(o=>o.token===this.actor+':'+token && o.ownerId===this.actor);if(own)return copy(own);this.checkQuota(slots);const o=super.createOrder(slots,this.actor+':'+token);this.event('booking',o.slots[0].productId);return this.getOrder(o.id);}
    pay(id,method,fail){this.guardTransfer(id);return super.pay(id,method,fail);}
    refund(id){const old=this.getOrder(id);this.guardTransfer(id);const result=super.refund(id);if(old.status!=='refunded')this.event('cancel',result.slots[0].productId);return result;}
    cancel(id){const old=this.getOrder(id);this.guardTransfer(id);const result=super.cancel(id);if(old.status!=='canceled')this.event('cancel',result.slots[0].productId);return result;}
    redeem(id,act){this.guardTransfer(id);const o=super.redeem(id,act);this.event('entry',o.slots[0].productId);return o;}
    guardTransfer(id){this.getOrder(id);if(this.state.innovation.transfers.some(t=>t.orderId===id && ['queued','offered'].includes(t.status)))throw new Error('补位处理中，先撤回补位再执行本操作');}
    preferenceInfo(){return copy(this.state.innovation.users[this.actor].preferences);}
    setPreferences(input){
      if(['enabled','consent','strict'].some(k=>typeof input[k]!=='boolean'))throw new Error('个性化与数据同意必须明确选择开启或关闭');
      const allowed=['tennis','table','basket','badminton','swim'];
      if(!Array.isArray(input.sports)||input.sports.some(x=>!allowed.includes(x))||!Array.isArray(input.venues)||input.venues.some(x=>!D.findVenue(x)))throw new Error('偏好选项无效');
      if(!Number.isInteger(input.start)||!Number.isInteger(input.end)||input.start<6||input.end>23||input.start>=input.end)throw new Error('可用时间必须在06—23之间且起点早于终点');
      return this.commit(s=>{Object.assign(s.innovation.users[this.actor].preferences,{enabled:!!input.enabled,consent:!!input.consent,sports:[...new Set(input.sports)],venues:[...new Set(input.venues)],start:input.start,end:input.end,strict:!!input.strict});});
    }
    clearPreferences(){return this.commit(s=>{s.innovation.users[this.actor].preferences=prefs();delete s.innovation.users[this.actor].behaviorSummary;s.innovation.events=s.innovation.events.filter(e=>e.user!==this.actor);});}
    event(type,productId,data={}){
      const p=this.preferenceInfo();if(!p.enabled||!p.consent)return;
      const types=['impression','view','favorite','filter','booking','cancel','entry','feedback'];if(!types.includes(type))return;
      const safe={};if(typeof data.candidateId==='string'&&/^[a-z0-9-]+\|\d{4}-\d{2}-\d{2}\|[a-z0-9-]+\|\d{1,2}\|\d{1,2}$/.test(data.candidateId))safe.candidateId=data.candidateId;if(Number.isInteger(data.available)&&data.available>=0&&data.available<=4)safe.available=data.available;if(['not-interested','bad-time','favorite'].includes(data.feedback))safe.feedback=data.feedback;
      try{this.commit(s=>{const ev={...safe,user:this.actor,type,productId:D.findProduct(productId)?productId:'',at:this.now(),version:'rules-v1'};s.innovation.events.push(ev);if(ev.productId)Learning.accumulate(s.innovation.users[this.actor],ev);s.innovation.events=s.innovation.events.filter(e=>e.at>=this.now()-s.innovation.policy.eventDays*86400000).slice(-300);});return true;}catch(_){return false;}
    }
    purgeEvents(){if(!this.state.innovation)return;const cutoff=this.now()-Math.min(30,this.state.innovation.policy.eventDays)*86400000;const dirty=this.state.innovation.events.some(e=>e.at<cutoff)||Object.values(this.state.innovation.users).some(u=>Object.values(u.behaviorSummary?.buckets||{}).some(b=>b.at<cutoff));if(dirty)this.commit(s=>{s.innovation.events=s.innovation.events.filter(e=>e.at>=cutoff);for(const u of Object.values(s.innovation.users))if(u.behaviorSummary)for(const k of Object.keys(u.behaviorSummary.buckets))if(u.behaviorSummary.buckets[k].at<cutoff)delete u.behaviorSummary.buckets[k];});}

    feedback(candidate,type){
      if(!this.preferenceInfo().enabled)throw new Error('个性化已关闭，请先启用偏好；普通预约仍可使用');
      if(!['not-interested','bad-time','favorite'].includes(type))throw new Error('未知反馈');
      const p=D.findProduct(candidate.productId);if(!p)throw new Error('项目无效');
      this.commit(s=>{const f=s.innovation.users[this.actor].preferences;if(type==='not-interested' && !f.excluded.includes(p.id))f.excluded.push(p.id);if(type==='bad-time')f.badTimes.push({date:candidate.date,start:candidate.start,end:candidate.end});if(type==='favorite' && !f.favorites.includes(p.id))f.favorites.push(p.id);});
      this.event(type==='favorite'?'favorite':'feedback',p.id,{feedback:type});
    }
    recommend(query={},fullRanking=false) {
      const pref=this.preferenceInfo(),enabled=pref.enabled, events=enabled&&pref.consent?this.state.innovation.events.filter(e=>e.user===this.actor):[];
      const start=query.start===undefined?(enabled?pref.start:8):query.start,end=query.end===undefined?(enabled?pref.end:23):query.end,hours=query.hours;
      if(start<6||end>23||start>=end||hours!==undefined&&![1,2].includes(hours))throw new Error('筛选时间或连续时长无效');
      const out=[];for(const p of D.products){
        if(query.sport && p.sport!==query.sport || query.venue && p.venue!==query.venue || query.productId&&p.id!==query.productId)continue;
        if(enabled && (pref.excluded.includes(p.id)||pref.venues.length&&!pref.venues.includes(p.venue)||pref.strict&&pref.sports.length&&!pref.sports.includes(p.sport)))continue;
        for(const date of this.dates(p.venue)){
          if(query.date && date!==query.date || query.weekdays && !query.weekdays.includes(new Date(date+'T12:00:00+08:00').getDay()))continue;
          for(const r of p.resources)for(let n=0;n<p.times.length;n++){
            const a=p.times[n];let times=[a];if(hours!==undefined&&a[1]-a[0]<hours){const next=p.times[n+1];if(!next||a[1]!==next[0]||next[1]-a[0]!==hours)continue;times.push(next);}else if(hours!==undefined&&a[1]-a[0]!==hours)continue;
            const last=times[times.length-1];if(a[0]<start||last[1]>end)continue;
            if(enabled && pref.badTimes.some(t=>t.date===date && t.start<last[1] && a[0]<t.end))continue;
            const slots=times.map(t=>this.slot(p.id,date,r.id,t[0],t[1]));if(slots.some(s=>this.inventory(s).remaining<1))continue;
            try{this.checkQuota(slots);}catch(_){continue;}
            const reasons=['实时本地库存可预约','符合'+D.time(start)+'—'+D.time(end)+'时间范围'];let score=0;
            if(enabled && pref.sports.includes(p.sport)){score+=8;reasons.push('符合你主动设置的项目偏好');}
            if(enabled && pref.favorites.includes(p.id)){score+=4;reasons.push('你收藏过此项目');}
            const count=events.filter(e=>e.productId===p.id && ['view','booking','entry'].includes(e.type)).length;
            const insight=enabled&&pref.consent?Learning.infer(this.state.innovation.users[this.actor],p.id,this.now()):{score:0,confidence:0,samples:0};score+=insight.score;if(insight.samples)reasons.push('近期'+insight.samples+'次有效行为证据；重复浏览按日限权，收藏／预约／入场权重更高');
            if(times.length===2)reasons.push('同一场地连续两小时');
            out.push({id:[p.id,date,r.id,a[0],last[1]].join('|'),productId:p.id,productName:p.name,venueId:p.venue,venueName:D.findVenue(p.venue).name,date,resourceId:r.id,resourceName:r.name,start:a[0],end:last[1],slots,total:slots.reduce((n,s)=>n+s.cents,0),score,insight,reasons,remaining:Math.min(...slots.map(s=>this.inventory(s).remaining)),version:'rules-v1'});
          }
        }
      }
      out.sort((a,b)=>b.score-a.score||a.date.localeCompare(b.date)||a.start-b.start||a.id.localeCompare(b.id));
      // Diversify resources before a small exploration slot; never relax explicit constraints.
      const unique=[],seen=new Set();for(const c of out){const k=c.productId+'|'+c.date+'|'+c.start;if(!seen.has(k)){seen.add(k);unique.push(c);}}
      if(fullRanking)return unique;
      let result=unique.slice(0,5);const explore=enabled?unique.find(c=>!result.some(x=>x.id===c.id)&&!pref.sports.includes(D.findProduct(c.productId).sport)):null;
      if(explore){explore.reasons.push('符合限制的探索机会，不改变补位顺序');result.push(explore);}else result=unique.slice(0,6);
      return result;
    }
    transferPreview(id){
      const o=this.getOrder(id),start=Math.min(...o.slots.map(s=>D.stamp(s.date,s.start))),active=this.state.innovation.transfers.find(t=>t.orderId===id&&['queued','offered'].includes(t.status));
      if(o.status!=='paid')return {allowed:false,reason:'仅未使用的已支付完整单可公开补位'};
      if(active)return {allowed:false,reason:'已经在公开补位中',transferId:active.id};
      if(this.refundable(id))return {allowed:false,ordinaryRefund:true,amount:o.total,reason:'符合普通退款，可提交财务审核申请，无需等待补位接收者'};
      if(start-this.now()<=this.state.innovation.policy.cutoffMinutes*60000)return {allowed:false,reason:'已到补位截止时间'};
      return {allowed:true,amount:o.total,start,reason:'补位接收成功后退至原用户演示余额；无人接收或撤回则原票仍归你，不保证退款。完整单交接，无指定接收人、无加价和佣金。'};
    }
    startTransfer(id,token){
      const prior=this.state.innovation.transfers.find(t=>t.owner===this.actor&&t.token===token);if(prior)return copy(prior);
      const preview=this.transferPreview(id);if(!preview.allowed)throw new Error(preview.reason);
      this.commit(s=>s.innovation.transfers.push({id:'SWAP-'+(++s.innovation.sequence),owner:this.actor,orderId:id,token,status:'queued',createdAt:this.now(),refundStatus:'not_due',history:[{at:this.now(),text:'加入公开补位，无指定接收人'}]}));
      this.dispatch();return this.transferInfo(this.state.innovation.transfers[this.state.innovation.transfers.length-1].id);
    }
    joinQueue(query){
      const p=D.findProduct(query.productId);if(!p||!this.dates(p.venue).includes(query.date)||!Number.isInteger(query.start)||!Number.isInteger(query.end)||query.start<6||query.end>23||query.start>=query.end)throw new Error('请选择有效项目、日期和时间范围');
      const old=this.state.innovation.queue.find(q=>q.user===this.actor&&q.status==='waiting'&&q.productId===p.id&&q.date===query.date&&q.start===query.start&&q.end===query.end);if(old)return copy(old);
      this.commit(s=>s.innovation.queue.push({id:'WAIT-'+(++s.innovation.sequence),sequence:s.innovation.sequence,user:this.actor,productId:p.id,date:query.date,start:query.start,end:query.end,status:'waiting',createdAt:this.now()}));
      this.dispatch();return this.queueInfo();
    }
    queueInfo(){this.expireTransfers();return copy(this.state.innovation.queue.filter(q=>q.user===this.actor));}
    publicTransfers(){this.expireTransfers();return this.state.innovation.transfers.filter(t=>t.status==='queued').map(t=>{const o=this.rawOrder(t.orderId);return {id:t.id,productId:o.slots[0].productId,productName:o.slots[0].productName,venueName:o.slots[0].venueName,date:o.slots[0].date,start:Math.min(...o.slots.map(s=>s.start)),end:Math.max(...o.slots.map(s=>s.end)),amount:o.total};});}
    leaveQueue(id){return this.commit(s=>{const q=s.innovation.queue.find(x=>x.id===id&&x.user===this.actor);if(!q||!['waiting','offered'].includes(q.status))throw new Error('当前候补不可撤回');if(q.status==='offered')throw new Error('请先拒绝当前补位邀请');q.status='withdrawn';});}
    matches(q,o){return o.slots.every(s=>s.productId===q.productId&&s.date===q.date&&s.start>=q.start&&s.end<=q.end);}
    dispatch(){
      const now=this.now();
      for(const t of this.state.innovation.transfers.filter(t=>t.status==='queued')){
        const o=this.rawOrder(t.orderId);const next=this.state.innovation.queue.filter(q=>q.status==='waiting'&&q.user!==t.owner&&this.matches(q,o)).sort((a,b)=>a.sequence-b.sequence).find(q=>{try{this.checkQuota(o.slots,q.user);return true;}catch(_){return false;}});
        if(!next)continue;
        this.commit(s=>{const tr=s.innovation.transfers.find(x=>x.id===t.id),q=s.innovation.queue.find(x=>x.id===next.id);tr.status='offered';tr.recipient=q.user;tr.queueId=q.id;tr.deadline=now+s.innovation.policy.offerMinutes*60000;tr.history.push({at:now,text:'按公开入队序号'+q.sequence+'发出限时确认'});q.status='offered';});
      }
    }
    expireTransfers(){
      if(!this.state.innovation)return;const now=this.now(),due=this.state.innovation.transfers.filter(t=>['queued','offered'].includes(t.status)&&(t.status==='offered'&&t.deadline<=now||this.rawOrder(t.orderId).slots.some(s=>D.stamp(s.date,s.start)-now<=this.state.innovation.policy.cutoffMinutes*60000)));
      if(due.length)this.commit(s=>{for(const t of s.innovation.transfers)if(due.some(d=>d.id===t.id)){const q=s.innovation.queue.find(x=>x.id===t.queueId);if(q)q.status='timed_out';const cutoff=this.rawOrder(t.orderId).slots.some(x=>D.stamp(x.date,x.start)-now<=s.innovation.policy.cutoffMinutes*60000);t.status=cutoff?'expired':'queued';t.history.push({at:now,text:cutoff?'补位截止，原票保持原持有人':'接收超时，顺延下一位'});delete t.recipient;delete t.queueId;delete t.deadline;}});
      this.dispatch();
    }
    transferInfo(id){this.expireTransfers();const t=this.state.innovation.transfers.find(x=>x.id===id);if(!t||t.owner!==this.actor&&t.recipient!==this.actor)throw new Error('无权访问此补位记录');const o=this.rawOrder(t.orderId);return copy({...t,slots:o.slots,amount:o.total});}
    myTransfers(){this.expireTransfers();return this.state.innovation.transfers.filter(t=>t.owner===this.actor||t.recipient===this.actor).map(t=>this.transferInfo(t.id));}
    withdrawTransfer(id){const t=this.transferInfo(id);if(t.owner!==this.actor||!['queued','offered'].includes(t.status))throw new Error('当前补位不可撤回');return this.commit(s=>{const tr=s.innovation.transfers.find(x=>x.id===id),q=s.innovation.queue.find(x=>x.id===tr.queueId);if(q)q.status='waiting';tr.status='withdrawn';tr.history.push({at:this.now(),text:'原用户撤回，原票保持原持有人'});});}
    declineOffer(id){const t=this.transferInfo(id);if(t.recipient!==this.actor||t.status!=='offered')throw new Error('当前无可拒绝邀请');this.commit(s=>{const tr=s.innovation.transfers.find(x=>x.id===id),q=s.innovation.queue.find(x=>x.id===tr.queueId);q.status='declined';tr.status='queued';delete tr.recipient;delete tr.queueId;delete tr.deadline;tr.history.push({at:this.now(),text:'接收者放弃，顺延下一位'});});this.dispatch();}
    acceptTransfer(id,method,failPay=false,failRefund=false){
      const t=this.transferInfo(id);if(t.status==='completed'&&t.recipient===this.actor)return this.getOrder(t.newOrderId);
      if(t.status!=='offered'||t.recipient!==this.actor||t.deadline<=this.now())throw new Error('邀请无效或已超时');
      const old=this.rawOrder(t.orderId);if(old.status!=='paid')throw new Error('票券状态已变，无法交接');this.checkQuota(old.slots);
      if(!['北理工支付','余额支付'].includes(method))throw new Error('请选择模拟支付方式');if(failPay)throw new Error('模拟接收支付失败，原票与邀请保持不变，可以重试');
      if(method==='余额支付'&&this.state.balance<old.total)throw new Error('演示余额不足，未交接');
      const newOrder=this.commit(s=>{
        const tr=s.innovation.transfers.find(x=>x.id===id),source=s.orders.find(x=>x.id===tr.orderId),now=this.now(),order={id:'DEMO-'+String(++s.serial).padStart(6,'0'),token:'transfer:'+id,ownerId:this.actor,credentialVersion:1,slots:copy(source.slots),total:source.total,status:'paid',payment:method,createdAt:now,expiresAt:now,paidAt:now,fromTransfer:id,events:[{at:now,action:'公开补位取得新资格'}]};
        if(method==='余额支付'){s.balance-=order.total;s.ledger.unshift({id:id+'-receive-pay',cents:-order.total,reason:'公开补位模拟付款',orderId:order.id,at:now});}
        source.status='transferred';source.credentialVersion=(source.credentialVersion||1)+1;source.events.push({at:now,action:'旧码撤销并公开交接'});s.orders.unshift(order);tr.status='completed';tr.newOrderId=order.id;tr.refundStatus=failRefund?'pending':'completed';tr.refundAmount=source.total;tr.history.push({at:now,text:failRefund?'资格已交接，原用户退款待重试':'资格交接与原用户退款完成'});const q=s.innovation.queue.find(x=>x.id===tr.queueId);q.status='accepted';
        s.innovation.admissions.push({user:this.actor,at:now,slots:order.slots.length,orderId:order.id});
        if(!failRefund){const u=s.innovation.users[tr.owner];u.balance+=source.total;u.ledger.unshift({id:id+'-refund',cents:source.total,reason:'公开补位退款（无佣金）',orderId:source.id,at:now});}
        return copy(order);
      });return newOrder;
    }
    retryTransferRefund(id){const t=this.transferInfo(id);if(t.owner!==this.actor||t.status!=='completed')throw new Error('无待处理原用户退款');if(t.refundStatus==='completed')return t;return this.commit(s=>{const tr=s.innovation.transfers.find(x=>x.id===id);s.balance+=tr.refundAmount;s.ledger.unshift({id:id+'-refund',cents:tr.refundAmount,reason:'公开补位退款重试（无佣金）',orderId:tr.orderId,at:this.now()});tr.refundStatus='completed';tr.history.push({at:this.now(),text:'退款重试完成'});});}
    configurePolicy(p){for(const [k,v] of Object.entries(p))if(!Object.hasOwn(policy(),k)||!Number.isInteger(v)||v<1||v>60||k==='hotStart'&&(v<6||v>22))throw new Error('演示规则参数须为1—60整数，热门开始时间为6—22');this.commit(s=>Object.assign(s.innovation.policy,p));}
    settings(p){if(p.prices){for(const [id,n] of Object.entries(p.prices))if(!D.findProduct(id)||!Number.isInteger(n)||n<0||n>100000)throw new Error('演示价格为0至1000元；免费票保持免费');const other={...p};delete other.prices;super.settings(other);this.commit(s=>s.settings.prices=p.prices);}else super.settings(p);this.purgeEvents();}
    appeal(reason){if(!reason||reason.length>200)throw new Error('申诉说明为1—200字符');return this.commit(s=>s.innovation.appeals.push({id:'APPEAL-'+(++s.innovation.sequence),user:this.actor,reason,status:'本地待复核',at:this.now()}));}
    report(){const i=this.state.innovation,shown=i.events.filter(e=>e.type==='impression'),books=i.events.filter(e=>e.type==='booking'),done=i.transfers.filter(t=>t.status==='completed'),eligible=i.transfers.filter(t=>!['withdrawn','expired'].includes(t.status));return {source:'本机虚拟演示数据；不证明真实公益效果',period:'累计本地演示；行为事件保留'+i.policy.eventDays+'天',recommendation:{impressions:shown.length,bookings:books.length,note:'曝光事件与预约事件分别计数，未做因果归因'},transfers:{completed:done.length,created:i.transfers.length,completionRate:i.transfers.length?done.length/i.transfers.length:null},pendingRefunds:done.filter(t=>t.refundStatus==='pending').length,appeals:i.appeals.length};}
    assistant(text){
      if(!text.trim()||text.length>500)throw new Error('请输入1—500字符的问题');
      if(/去不了|退订|退款|补位|转让/.test(text))return {kind:'orders',message:'先选择本人的未使用订单。符合普通退款时可直接申请财务审核；逾期可查看公开补位预览。聊天不会直接退款或交接。',orders:this.orders('已支付')};
      if(/规则|校外|能否|可以.*转|时限/.test(text))return {kind:'rules',message:/校外/.test(text)?'规格未提供校外接收资格的现行规则，不能判断可以转给校外人员。请向场馆核实。':'中关村未使用订单至少提前12小时、良乡至少提前2小时可退款。待支付15分钟超时。公开补位按入队序号，无加价、无佣金。补位参数为演示设计，不是学校现行规则。',sources:['匿名化基线规格v1.2：D04/退款与须知','公益增量规格v1.0：公开补位与公平规则']};
      const sport=/羽毛/.test(text)?'badminton':/乒乓/.test(text)?'table':/篮球/.test(text)?'basket':/网球/.test(text)?'tennis':/游泳/.test(text)?'swim':'';
      if(!sport)return {kind:'clarify',message:'想找哪种运动？可补充校区、日期、早/晚时间及连续一或两小时。未知条件不会被当成真实偏好。'};
      const weekdays=[];const dayMap={'日':0,'天':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6};for(const m of text.matchAll(/(?:周|星期)([日天一二三四五六])/g))weekdays.push(dayMap[m[1]]);
      const query={sport};if(/(?:两|二|2)\s*(?:个)?小时/.test(text))query.hours=2;else if(/(?:一|1)\s*(?:个)?小时/.test(text))query.hours=1;
      if(/晚/.test(text)){query.start=18;query.end=23;}else if(/早|上午/.test(text)){query.start=8;query.end=12;}else if(/下午/.test(text)){query.start=12;query.end=18;}
      if(weekdays.length)query.weekdays=weekdays;if(/良乡/.test(text))query.venue='lx';else if(/中关村/.test(text))query.venue='zgc';
      if(/后天/.test(text))query.date=D.dateOf(this.now()+2*86400000);else if(/明天/.test(text))query.date=D.dateOf(this.now()+86400000);else if(/今天/.test(text))query.date=D.dateOf(this.now());
      if(sport==='swim'&&/儿童/.test(text)){query.venue='lx';query.productId='lx-child';}else if(sport==='swim'&&/成人/.test(text)){query.venue='lx';query.productId='lx-swim';}
      return {kind:'recommendations',query,results:this.recommend(query),message:'以下来自当前本地业务库存，提交前仍会重新校验。仅执行本次查询条件，不自动修改长期偏好。'};
    }
    reset(){super.reset();this.actor=undefined;this.commit(s=>{s.innovation={version:1,current:'demo-01',users:{'demo-01':account('demo-01'),'demo-02':account('demo-02'),'demo-03':account('demo-03')},events:[],admissions:[],queue:[],transfers:[],appeals:[],policy:policy(),sequence:0};});this.actor='demo-01';}
  }
  D.statusNames.transferred='已公开交接（旧码失效）';
  const api={InnovationService,policy};if(typeof module==='object'&&module.exports)module.exports=api;else root.VenueInnovation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
