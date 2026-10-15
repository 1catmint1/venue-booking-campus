import sqlite3,sys,json,os
conn=sqlite3.connect(sys.argv[1],isolation_level=None)
conn.row_factory=sqlite3.Row
if len(sys.argv)>2:
 conn.executescript(open(sys.argv[2],encoding='utf-8').read().replace('--> statement-breakpoint',''))
for line in sys.stdin:
 try:
  q=json.loads(line);cur=conn.execute(q['sql'],q.get('params',[]));rows=[dict(r) for r in cur.fetchall()] if cur.description else [];value={'results':rows,'meta':{'changes':max(cur.rowcount,0)}};print(json.dumps({'id':q['id'],'value':value}),flush=True)
 except Exception as e:
  print(json.dumps({'id':q.get('id'),'error':str(e)}),flush=True)
