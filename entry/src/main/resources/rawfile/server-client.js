(function(){
 'use strict';
 // Browser-only synchronous adapter keeps the original UI contract while all writes
 // are serialized and authorized by the local server. Native HAP stays offline.
 if(!/^https?:$/.test(location.protocol))return; // Every hosted web entry requires its backend; never silently fall back to offline admin roles.
 class RemoteService {
  constructor(){this.session=this.request('GET','/api/session');this.actor=this.session.actor;this.refresh();}
  request(method,path,body){const x=new XMLHttpRequest();x.open(method,path,false);x.setRequestHeader('Content-Type','application/json');if(this.session)x.setRequestHeader('X-Venue-Csrf',this.session.csrf);x.send(body===undefined?null:JSON.stringify(body));let data;try{data=JSON.parse(x.responseText);}catch(_){throw new Error('本地服务返回异常，操作未确认，请重试');}if(x.status<200||x.status>=300)throw new Error(data.error||'本地业务服务暂不可用');return data;}
  refresh(){const m=this.request('POST','/api/ui-state',{});this.state=m.state;this.actor=m.actor;this.serverNow=m.now;this.inventories=m.inventory;const raw=JSON.stringify(this.state);this.view=new BookingDomain.DemoService({load:()=>raw,save:()=>{throw new Error('客户端只读视图不能提交业务');}},()=>this.serverNow);}
  rpc(method,args){let data;try{data=this.request('POST','/api/rpc',{method,args,expectedActor:this.actor});}catch(error){try{this.refresh();}catch(_){}throw error;}if(!['recommend','assistant','report','transferPreview','accountInfo','checkQuota','transferInfo'].includes(method))this.refresh();return data.result;}
  snapshot(){return JSON.parse(JSON.stringify(this.state));}
  now(){return this.serverNow;}
  dates(id){return this.view.dates(id);}
  roleInfo(){return this.state.roleInfo;}
  modelStatus(){return {ready:this.session.modelReady,provider:this.session.modelProvider};}
  configureModel(config){const r=this.request('POST','/api/model-config',{config});this.session.modelReady=true;this.session.modelProvider=r.provider;return r;}
  cloudAssistant(text,cloudConsent){return this.request('POST','/api/assistant',{text,cloudConsent});}
  price(id){const p=BookingDomain.findProduct(id);return VenuePricing.rate(p,{date:BookingDomain.dateOf(this.now()),start:8},this.state.innovation.users[this.actor],this.state.settings,Date.now(),!this.session.demo).actualCents;}
  slot(...args){const x=this.view.slot(...args);x.pricing=VenuePricing.rate(BookingDomain.findProduct(x.productId),x,this.state.innovation.users[this.actor],this.state.settings,Date.now(),!this.session.demo);x.cents=x.pricing.actualCents;return x;}
  inventory(slot,ignore){if(ignore)return this.rpc('inventory',[slot,ignore]);return this.inventories[slot.productId+'|'+BookingDomain.key(slot)]||{remaining:0,reason:'库存未加载，请刷新'};}
  availability(id,date){const p=BookingDomain.findProduct(id);let count=0;for(const r of p.resources)for(const t of p.times)count+=this.inventory(this.slot(id,date,r.id,t[0],t[1])).remaining;return count;}
  validTestImage(data){return this.view.validTestImage(data);}
  switchUser(id){this.request('POST','/api/demo-session',{actor:id});this.actor=id;this.refresh();return this.rpc('accountInfo',[]);}
 }
 for(const name of ['accountInfo','getOrder','orders','createOrder','pay','cancel','refund','refundable','redeem','recharge','saveProfile','setPhone','bind','buyMember','saveImage','submitHealth','reviewHealth','group','preferenceInfo','setPreferences','clearPreferences','event','feedback','recommend','transferPreview','startTransfer','joinQueue','queueInfo','leaveQueue','myTransfers','publicTransfers','transferInfo','withdrawTransfer','declineOffer','acceptTransfer','retryTransferRefund','validCredential','assistant','advance','settings','configurePolicy','appeal','report','reset','checkQuota','expire','switchRole','workspace','workAction','schoolRequest','schoolReview','deepWaterSubmit','deepWaterInfo','ownRequests','handoverQuote','waitSlot','acceptWait'])RemoteService.prototype[name]=function(...args){return this.rpc(name,args);};
 RemoteService.prototype.preferenceInfo=function(){return JSON.parse(JSON.stringify(this.state.innovation.users[this.actor].preferences));};
 RemoteService.prototype.orders=function(filter){return this.view.orders(filter);};
 RemoteService.prototype.getOrder=function(id){return this.view.getOrder(id);};
 RemoteService.prototype.refundable=function(id){return this.view.refundable(id);};
 window.VenueServerService=RemoteService;
})();
