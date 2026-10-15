'use strict';
// Server-owned replaceable provider. A client never supplies this object or its result.
class SchoolAuthAdapter{
 constructor(provider=null){this.provider=provider;}
 ready(){return !!this.provider&&typeof this.provider.verify==='function';}
 async verify(application){if(!this.ready())return {status:'unverified',source:'unconfigured',identity:'external',officialVerification:false};const result=await this.provider.verify({applicationId:application.id,subject:application.user,kind:application.kind,claimedNumber:application.number,campus:application.venue});if(!result||!['verified','rejected'].includes(result.status)||!['student','staff'].includes(result.kind)||!Number.isFinite(result.validUntil)||result.status==='verified'&&result.validUntil<=Date.now())throw new Error('学校认证来源返回无效状态或有效期，保持原状态');return {status:result.status,kind:result.kind,validUntil:result.validUntil,source:'school-provider',officialVerification:result.status==='verified'};}
}
module.exports={SchoolAuthAdapter};
