CREATE INDEX shared_queue_dispatch_status ON venue_shared_queue(namespace,resource,date,status,expires_ms,seq);
--> statement-breakpoint
CREATE INDEX shared_claim_identity ON venue_shared_claims(namespace,owner,date,expires_ms);
--> statement-breakpoint
CREATE INDEX shared_room_namespace ON venue_shared_rooms(namespace,sid);
--> statement-breakpoint
DROP TRIGGER shared_apply_operation;
--> statement-breakpoint
CREATE TRIGGER shared_apply_operation AFTER INSERT ON venue_shared_ops BEGIN
 INSERT INTO venue_shared_dispatch(namespace,resource,date,start,end,capacity,at_ms)
 SELECT DISTINCT r.namespace,json_extract(s.value,'$.resourceId'),json_extract(s.value,'$.date'),json_extract(s.value,'$.start'),json_extract(s.value,'$.end'),json_extract(s.value,'$.capacity'),NEW.at_ms FROM json_each(NEW.delta_json,'$.orders') o,json_each(o.value,'$.slots') s JOIN venue_shared_rooms r ON r.sid=NEW.sid WHERE NEW.method='createOrder' AND NEW.deadline>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) AND r.version=NEW.version AND (r.namespace NOT LIKE 'test:%' OR EXISTS(SELECT 1 FROM venue_shared_tests t WHERE t.namespace=r.namespace AND t.state='open' AND t.expires_ms>NEW.at_ms)) AND NOT EXISTS(SELECT 1 FROM venue_shared_claims c WHERE c.namespace=r.namespace AND c.resource=json_extract(s.value,'$.resourceId') AND c.date=json_extract(s.value,'$.date') AND c.start<json_extract(s.value,'$.end') AND json_extract(s.value,'$.start')<c.end AND c.expires_ms>NEW.at_ms);
 UPDATE venue_shared_ops SET error=CASE
 WHEN NEW.deadline<=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) THEN '授权已失效，请刷新'
 WHEN EXISTS(SELECT 1 FROM venue_shared_rooms r WHERE r.sid=NEW.sid AND r.namespace LIKE 'test:%' AND NOT EXISTS(SELECT 1 FROM venue_shared_tests t WHERE t.namespace=r.namespace AND t.state='open' AND t.expires_ms>NEW.at_ms)) THEN '测试轮次已关闭'
 WHEN NOT EXISTS(SELECT 1 FROM venue_shared_rooms WHERE sid=NEW.sid AND version=NEW.version AND expires_ms>NEW.at_ms) THEN 'VERSION_CONFLICT'
 WHEN EXISTS(SELECT 1 FROM json_each(NEW.delta_json,'$.queue') j JOIN venue_shared_queue q ON q.sid=NEW.sid AND q.id=json_extract(j.value,'$.id') WHERE q.status!=json_extract(j.value,'$.previousStatus')) THEN 'VERSION_CONFLICT'
 WHEN EXISTS(SELECT 1 FROM json_each(NEW.delta_json,'$.orders') o,json_each(o.value,'$.slots') s
 WHERE json_extract(o.value,'$.status') IN ('pending','paid','using','completed') AND
 ((SELECT count(*) FROM venue_shared_claims c WHERE c.namespace=(SELECT namespace FROM venue_shared_rooms WHERE sid=NEW.sid) AND c.resource=json_extract(s.value,'$.resourceId') AND c.date=json_extract(s.value,'$.date') AND c.start<json_extract(s.value,'$.end') AND json_extract(s.value,'$.start')<c.end AND c.expires_ms>NEW.at_ms
 AND NOT(c.sid=NEW.sid AND (c.order_id IN(SELECT json_extract(value,'$.id') FROM json_each(NEW.delta_json,'$.orders')) OR c.queue_id IN(SELECT json_extract(value,'$.id') FROM json_each(NEW.delta_json,'$.queue') WHERE json_extract(value,'$.status') IN ('accepted','canceled','left')))))>=json_extract(s.value,'$.capacity')
 OR (NEW.method='createOrder' AND EXISTS(SELECT 1 FROM venue_shared_queue q WHERE q.namespace=(SELECT namespace FROM venue_shared_rooms WHERE sid=NEW.sid) AND q.resource=json_extract(s.value,'$.resourceId') AND q.date=json_extract(s.value,'$.date') AND q.start<json_extract(s.value,'$.end') AND json_extract(s.value,'$.start')<q.end AND (q.status='stock_offered' AND q.expires_ms>NEW.at_ms OR q.status='waiting' AND EXISTS(SELECT 1 FROM venue_shared_rooms r WHERE r.sid=q.sid AND r.expires_ms>NEW.at_ms  AND EXISTS(SELECT 1 FROM json_each(r.state_json,'$.platform.grants') g WHERE json_extract(g.value,'$.user')=json_extract(q.queue_json,'$.user') AND json_extract(g.value,'$.role') IN ('user','leader') AND json_extract(g.value,'$.revoked')=0 AND json_extract(g.value,'$.validUntil')>NEW.at_ms AND (json_extract(g.value,'$.business')='*' OR instr(','||json_extract(g.value,'$.business')||',',',own,')>0) AND json_extract(g.value,'$.campus') IN ('*',json_extract(q.queue_json,'$.offerSlot.venueId')))
 AND (SELECT count(*) FROM venue_shared_claims c WHERE c.namespace=q.namespace AND c.owner=q.owner AND c.expires_ms>NEW.at_ms)<4
 AND coalesce((SELECT sum(json_extract(a.value,'$.slots')) FROM json_each(r.state_json,'$.innovation.admissions') a WHERE json_extract(a.value,'$.user')=json_extract(q.queue_json,'$.user') AND json_extract(a.value,'$.at')>NEW.at_ms-604800000),0)<6
 AND (q.start<18 OR (SELECT count(*) FROM venue_shared_claims c WHERE c.namespace=q.namespace AND c.owner=q.owner AND c.start>=18 AND c.expires_ms>NEW.at_ms)<2)
 AND NOT EXISTS(SELECT 1 FROM venue_shared_claims c WHERE c.namespace=q.namespace AND c.owner=q.owner AND c.date=q.date AND c.start<q.end AND q.start<c.end AND c.expires_ms>NEW.at_ms)
)))))) THEN '场次已被占用或有先序候补，请在原页面加入候补；未创建订单、未扣款'
 ELSE NULL END WHERE id=NEW.id;
 DELETE FROM venue_shared_claims WHERE sid=NEW.sid AND (order_id IN(SELECT json_extract(value,'$.id') FROM json_each(NEW.delta_json,'$.orders')) OR queue_id IN(SELECT json_extract(value,'$.id') FROM json_each(NEW.delta_json,'$.queue') WHERE json_extract(value,'$.status')!='stock_offered')) AND (SELECT error FROM venue_shared_ops WHERE id=NEW.id) IS NULL;
 INSERT INTO venue_shared_orders(sid,id,namespace,owner,status,order_json,sequence)
 SELECT NEW.sid,json_extract(o.value,'$.id'),r.namespace,NEW.sid||':'||json_extract(o.value,'$.ownerId'),json_extract(o.value,'$.status'),o.value,NEW.seq FROM json_each(NEW.delta_json,'$.orders') o JOIN venue_shared_rooms r ON r.sid=NEW.sid
 WHERE (SELECT error FROM venue_shared_ops WHERE id=NEW.id) IS NULL
 ON CONFLICT(sid,id) DO UPDATE SET status=excluded.status,order_json=excluded.order_json;
 INSERT INTO venue_shared_queue(sid,id,namespace,owner,status,resource,date,start,end,capacity,expires_ms,queue_json)
 SELECT NEW.sid,json_extract(q.value,'$.id'),r.namespace,NEW.sid||':'||json_extract(q.value,'$.user'),json_extract(q.value,'$.status'),json_extract(q.value,'$.resourceId'),json_extract(q.value,'$.date'),json_extract(q.value,'$.start'),json_extract(q.value,'$.end'),json_extract(q.value,'$.offerSlot.capacity'),coalesce(json_extract(q.value,'$.offer.expires'),0),q.value FROM json_each(NEW.delta_json,'$.queue') q JOIN venue_shared_rooms r ON r.sid=NEW.sid
 WHERE (SELECT error FROM venue_shared_ops WHERE id=NEW.id) IS NULL
 ON CONFLICT(sid,id) DO UPDATE SET status=excluded.status,expires_ms=excluded.expires_ms,queue_json=excluded.queue_json;
 INSERT INTO venue_shared_claims(id,namespace,sid,owner,order_id,resource,date,start,end,capacity,expires_ms)
 SELECT 'O:'||NEW.sid||':'||json_extract(o.value,'$.id')||':'||s.key,r.namespace,NEW.sid,NEW.sid||':'||json_extract(o.value,'$.ownerId'),json_extract(o.value,'$.id'),json_extract(s.value,'$.resourceId'),json_extract(s.value,'$.date'),json_extract(s.value,'$.start'),json_extract(s.value,'$.end'),json_extract(s.value,'$.capacity'),CASE WHEN json_extract(o.value,'$.status')='pending' THEN json_extract(o.value,'$.expiresAt') ELSE CAST(strftime('%s',json_extract(s.value,'$.date')||'T'||printf('%02d',json_extract(s.value,'$.end'))||':00:00+08:00') AS INTEGER)*1000 END
 FROM json_each(NEW.delta_json,'$.orders') o,json_each(o.value,'$.slots') s JOIN venue_shared_rooms r ON r.sid=NEW.sid
 WHERE json_extract(o.value,'$.status') IN ('pending','paid','using','completed') AND (SELECT error FROM venue_shared_ops WHERE id=NEW.id) IS NULL;
 UPDATE venue_shared_rooms SET version=version+1,state_json=NEW.next_json,session_json=NEW.next_session_json,expires_ms=NEW.at_ms+604800000 WHERE sid=NEW.sid AND (SELECT error FROM venue_shared_ops WHERE id=NEW.id) IS NULL;
 INSERT INTO venue_shared_dispatch(namespace,resource,date,start,end,capacity,at_ms)
 SELECT DISTINCT r.namespace,json_extract(s.value,'$.resourceId'),json_extract(s.value,'$.date'),json_extract(s.value,'$.start'),json_extract(s.value,'$.end'),json_extract(s.value,'$.capacity'),NEW.at_ms FROM json_each(NEW.delta_json,'$.orders') o,json_each(o.value,'$.slots') s JOIN venue_shared_rooms r ON r.sid=NEW.sid WHERE (SELECT error FROM venue_shared_ops WHERE id=NEW.id) IS NULL;
 INSERT INTO venue_shared_dispatch(namespace,resource,date,start,end,capacity,at_ms)
 SELECT DISTINCT r.namespace,json_extract(q.value,'$.resourceId'),json_extract(q.value,'$.date'),json_extract(q.value,'$.start'),json_extract(q.value,'$.end'),json_extract(q.value,'$.offerSlot.capacity'),NEW.at_ms FROM json_each(NEW.delta_json,'$.queue') q JOIN venue_shared_rooms r ON r.sid=NEW.sid WHERE (SELECT error FROM venue_shared_ops WHERE id=NEW.id) IS NULL;
 UPDATE venue_shared_ops SET result_json=json_set(result_json,'$.result.sequence',(SELECT seq FROM venue_shared_queue WHERE sid=NEW.sid AND id=json_extract(result_json,'$.result.id'))) WHERE id=NEW.id AND NEW.method='waitSlot' AND error IS NULL;
 UPDATE venue_shared_ops SET result_json=json_set(result_json,'$.sharedSequence',seq),next_json='',next_session_json='',delta_json='' WHERE id=NEW.id;
END;
