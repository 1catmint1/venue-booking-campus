import sqlite3,sys,json,time
c=sqlite3.connect(sys.argv[1],isolation_level=None);c.row_factory=sqlite3.Row
import pathlib
c.execute('CREATE TABLE IF NOT EXISTS _fixture_migrations(name TEXT PRIMARY KEY)')
for migration in sorted(pathlib.Path(sys.argv[2]).parent.glob('000[0-9]*.sql')):
 if not c.execute('SELECT 1 FROM _fixture_migrations WHERE name=?',(migration.name,)).fetchone():
  c.executescript(migration.read_text(encoding='utf-8').replace('--> statement-breakpoint',''))
  c.execute('INSERT INTO _fixture_migrations(name) VALUES(?)',(migration.name,))

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
