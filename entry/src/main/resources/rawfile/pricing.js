(function(root){
 'use strict';
 const labels={student:'学生',staff:'教工',external:'校外人员'};
 const version='2026-10-15-lx-table-1';
 function identity(user,securityNow=Date.now(),real=false){const a=user.schoolAuth;return a&&a.status==='verified'&&a.validUntil>securityNow&&(!real||a.source==='school-provider')?a.kind:'external';}
 function rate(p,slot,user,settings={},securityNow=Date.now(),real=false){
  const kind=identity(user,securityNow,real),base=settings.prices?.[p.id]??p.cents;
  const weekend=[0,6].includes(new Date(slot.date+'T12:00:00+08:00').getDay())||(settings.holidays||[]).includes(slot.date),peak=weekend||slot.start>=18;
  let actual=base,reference=base,rule='zgc-base-times-two-pending-table';
  if(base===0){actual=0;rule='free';}
  else if(p.venue==='lx'){
   rule=version;
   if(p.sport==='badminton'){reference=peak?4000:1000;actual=kind==='external'?6000:kind==='staff'&&peak?5000:reference;}
   else if(p.sport==='table'){reference=1000;actual=kind==='external'?2000:1000;}
   else if(p.sport==='basket'){reference=peak?20000:15000;actual=kind==='external'?(peak?30000:20000):reference;}
   else if(p.sport==='swim'){reference=1000;actual=kind==='student'?1000:kind==='staff'?1500:p.id==='lx-child'?3000:6000;}
  }else actual=kind==='external'?base*2:base;
  const override=settings.rateOverrides?.[p.id]?.[kind+'|'+(peak?'peak':'day')]||settings.rateOverrides?.[p.id]?.[kind+'|all'];if(override&&base!==0){actual=override.cents;rule=override.version;}
  if(settings.priceVersions?.[p.id])rule+='|'+settings.priceVersions[p.id];if(p.venue==='lx'&&settings.calendarVersion)rule+='|'+settings.calendarVersion;
  return {identity:kind,identityLabel:labels[kind],source:user.schoolAuth?.source||'unverified',baseCents:reference,multiplier:reference?actual/reference:1,actualCents:actual,ruleVersion:rule,band:peak?'晚间／周末／配置节假日':'工作日白天',authRevision:user.schoolAuth?.revision||0};
 }
 const api={identity,rate,labels,version};if(typeof module==='object'&&module.exports)module.exports=api;else root.VenuePricing=api;
})(typeof window!=='undefined'?window:globalThis);
