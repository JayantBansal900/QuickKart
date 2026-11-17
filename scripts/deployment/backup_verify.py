"""Read-only source backup; restore only into an owned, networkless disposable container."""
import argparse, datetime, hashlib, json, os, pathlib, secrets, subprocess, time
from safety import require_capacity
ROOT=pathlib.Path(__file__).resolve().parents[2]
def run(args, **kw):
    kw.setdefault("timeout",120)
    return subprocess.run(args, check=True, capture_output=True, **kw).stdout
def sql(container, query):
    return run(["docker","exec",container,"psql","-X","-U","postgres","-d","quickkart","-At","-v","ON_ERROR_STOP=1","-c",query]).decode().strip()
def fingerprint(container):
    tables=sql(container,"BEGIN READ ONLY; SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename; COMMIT;").splitlines()[1:-1]
    result={}
    for table in tables:
        if not table.replace('_','').isalnum(): raise RuntimeError("Unexpected identifier")
        result[table]=sql(container, "BEGIN READ ONLY; SELECT count(*)::text || '|' || coalesce(md5(string_agg(v,'' ORDER BY v)),'empty') FROM (SELECT md5(row_to_json(t)::text) v FROM \""+table+"\" t) s; COMMIT;").splitlines()[1]
    return result
def main():
    require_capacity(ROOT,1)
    dest=ROOT/'.local'/'backups'/datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    dest.mkdir(parents=True,exist_ok=False)
    if os.name=='nt':
        run(['icacls',str(ROOT/'.local'),'/inheritance:r','/grant:r',os.environ['USERNAME']+':(OI)(CI)F'])
    source='quickkart-postgres'
    info=json.loads(run(['docker','inspect',source]))[0]
    if not any(m.get('Name')=='quickkart-backend_postgres_data' for m in info['Mounts']): raise RuntimeError('Source volume mismatch')
    before=fingerprint(source)
    dump=dest/'quickkart.dump'
    with dump.open('wb') as f:
        subprocess.run(['docker','exec',source,'pg_dump','-U','postgres','-d','quickkart','-Fc','--no-owner','--no-acl'],stdout=f,stderr=subprocess.PIPE,check=True)
    with (dest/'schema.sql').open('wb') as f:
        subprocess.run(['docker','exec',source,'pg_dump','-U','postgres','-d','quickkart','--schema-only','--no-owner','--no-acl'],stdout=f,stderr=subprocess.PIPE,check=True)
    if before!=fingerprint(source): raise RuntimeError('Source changed during backup: repeat verification')
    name='quickkart-p5-restore-'+secrets.token_hex(5)
    env=dest/'restore.env'
    env.write_text('POSTGRES_DB=quickkart\nPOSTGRES_PASSWORD='+secrets.token_urlsafe(36)+'\n')
    try:
        run(['docker','run','-d','--name',name,'--label','quickkart.phase5=restore','--network','none','--tmpfs','/var/lib/postgresql/data','--env-file',str(env),'postgres:15-alpine'])
        for _ in range(60):
            p=subprocess.run(['docker','exec',name,'pg_isready','-U','postgres','-d','quickkart'],capture_output=True)
            if p.returncode==0: break
            time.sleep(1)
        inspect=json.loads(run(['docker','inspect',name]))[0]
        assert inspect['HostConfig']['NetworkMode']=='none' and not inspect['HostConfig']['PortBindings']
        with dump.open('rb') as f:
            subprocess.run(['docker','exec','-i',name,'pg_restore','-U','postgres','-d','quickkart','--no-owner','--no-acl','--exit-on-error'],stdin=f,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
        assert before==fingerprint(name), 'Restored data differs'
        migration=ROOT/'infrastructure/postgres/migrations/002_commerce_reliability.sql'
        for _ in range(2):
            run(['docker','exec','-i',name,'psql','-X','-U','postgres','-d','quickkart','-v','ON_ERROR_STOP=1','--single-transaction'],input=migration.read_bytes())
        counts={t:int(v.split('|')[0]) for t,v in before.items()}
        for t,n in counts.items(): assert int(sql(name,'SELECT count(*) FROM "'+t+'"'))==n
        assert sql(name,"SELECT count(*) FROM orders WHERE checkout_key IS NOT NULL")=='0'
        result={'backup':str(dump),'sha256':hashlib.sha256(dump.read_bytes()).hexdigest(),'bytes':dump.stat().st_size,'table_counts':counts,'restore_data_fingerprints_match':True,'migration_applied_twice':True,'migration_row_counts_preserved':True,'source_unchanged':before==fingerprint(source),'network':'none','persistent_restore_volume':False}
        (dest/'verification.json').write_text(json.dumps(result,indent=2))
        print(json.dumps(result,indent=2))
    finally:
        try:
            item=json.loads(run(['docker','inspect',name]))[0]
            if item['Config']['Labels'].get('quickkart.phase5')=='restore' and item['HostConfig']['NetworkMode']=='none': run(['docker','rm','-f',name])
        finally: env.unlink(missing_ok=True)
if __name__=='__main__': main()
