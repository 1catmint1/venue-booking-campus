import sqlite3,sys,json,time
c=sqlite3.connect(sys.argv[1],isolation_level=None);c.row_factory=sqlite3.Row
c.executescript(open(sys.argv[2],encoding='utf-8').read().replace('--> statement-breakpoint',''))
import pathlib
for extra in sorted(pathlib.Path(sys.argv[2]).parent.glob('000[1-9]*.sql')):c.executescript(extra.read_text(encoding='utf-8').replace('--> statement-breakpoint',''))
def execute(q):
 cur=c.execute(q['sql'],q.get('params',[]));rows=[dict(r) for r in cur.fetchall()] if cur.description else [];return {'results':rows,'meta':{'changes':max(cur.rowcount,0),'last_row_id':cur.lastrowid}}
for line in sys.stdin:
 q={}
 try:
  q=json.loads(line)
  if q.get('batch'):
   c.execute('BEGIN IMMEDIATE')
   try:
    value=[execute(x) for x in q['batch']];c.execute('COMMIT')
   except Exception:
    c.execute('ROLLBACK');raise
  else:value=execute(q)
  print(json.dumps({'id':q['id'],'value':value}),flush=True)
 except Exception as e:print(json.dumps({'id':q.get('id'),'error':str(e)}),flush=True)
