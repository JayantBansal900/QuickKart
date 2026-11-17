"""Isolated Phase 5 deployment. Never targets the existing Compose project."""
import argparse, base64, json, os, pathlib, secrets, shutil, subprocess
from safety import require_capacity
ROOT=pathlib.Path(__file__).resolve().parents[2]
LOCAL=ROOT/'.local'; RUNTIME=LOCAL/'staging'; PROJECT='quickkart-stage-p5'
COMPOSE=ROOT/'infrastructure/staging/compose.json'
def run(args): return subprocess.run(args,check=True,capture_output=True,timeout=120).stdout
def compose(*args):
    return ['docker','compose','--project-directory',str(ROOT),'-p',PROJECT,'--env-file',str(LOCAL/'.env.staging'),'-f',str(COMPOSE),*args]
def setup():
    LOCAL.mkdir(exist_ok=True); RUNTIME.mkdir(exist_ok=True)
    if os.name=='nt': run(['icacls',str(LOCAL),'/inheritance:r','/grant:r',os.environ['USERNAME']+':(OI)(CI)F'])
    stage=LOCAL/'.env.staging'
    if not stage.exists():
        values={k:base64.b64encode(secrets.token_bytes(48)).decode() for k in ['JWT_SECRET','OTP_HASH_SECRET']}
        values.update(POSTGRES_DB='quickkart',POSTGRES_USER='postgres',POSTGRES_PASSWORD=secrets.token_urlsafe(36),SMTP_PASSWORD=secrets.token_urlsafe(36))
        with stage.open('x') as f: f.write(''.join(k+'='+v+'\n' for k,v in values.items()))
    if not (RUNTIME/'cert.pem').exists():
        run([r'C:\Program Files\Git\usr\bin\openssl.exe','req','-x509','-newkey','rsa:2048','-nodes','-days','30','-keyout',str(RUNTIME/'key.pem'),'-out',str(RUNTIME/'cert.pem'),'-subj','/CN=mailpit','-addext','subjectAltName=DNS:mailpit'])
    # Schema contains no customer rows. Keep the source dump private and read-only.
    schemas=sorted((LOCAL/'backups').glob('*/schema.sql'))
    if not schemas: raise RuntimeError('Run backup_verify.py first')
    shutil.copyfile(schemas[-1],RUNTIME/'00-schema.sql')
    (RUNTIME/'01-fixture.sql').write_text("""
CREATE TABLE quickkart_stage_guard (identity text PRIMARY KEY CHECK (identity='quickkart-stage-p5'));
INSERT INTO quickkart_stage_guard VALUES ('quickkart-stage-p5');
INSERT INTO users (name,email,password,role,email_verified,account_status,created_at,updated_at) VALUES ('Synthetic Legacy','legacy@example.test','unusable','USER',true,'ACTIVE',now(),now());
INSERT INTO products (sku,name,price,stock_quantity,category,availability,image_url) VALUES ('STAGE-APPLE','Staging Apples',25.50,100,'Fruits','IN_STOCK','/products/sports/sku-spor-025.svg');
INSERT INTO orders (user_id,status,total_amount,created_at) VALUES (1,'CONFIRMED',25.50,now());
INSERT INTO order_items (order_id,product_id,quantity,price) VALUES (1,1,1,25.50);
INSERT INTO payments (order_id,transaction_id,amount,payment_method,status,created_at) VALUES (1,'SYNTHETIC-LEGACY',25.50,'CARD','SUCCESS',now());
""")
    base=json.loads(run(['docker','compose','-f',str(ROOT/'docker-compose.yml'),'config','--no-interpolate','--format','json']))
    services=base['services']
    for name,s in services.items():
        s.pop('container_name',None); s.pop('ports',None); s.pop('networks',None); s.pop('restart',None)
        if 'build' in s:
            s['image']='quickkart-stage-p5/'+name+':phase5'
        for k in list(s.get('environment',{})):
            if k.startswith('DEV_'): s['environment'][k]='false' if k.endswith('ENABLED') else ''
        if 'SPRING_PROFILES_ACTIVE' in s.get('environment',{}): s['environment']['SPRING_PROFILES_ACTIVE']='prod'
    services['postgres']['volumes']=['postgres_data:/var/lib/postgresql/data','./.local/staging/00-schema.sql:/docker-entrypoint-initdb.d/00-schema.sql:ro','./.local/staging/01-fixture.sql:/docker-entrypoint-initdb.d/01-fixture.sql:ro']
    services['postgres']['healthcheck']['test']=['CMD','pg_isready','-h','127.0.0.1','-U','postgres','-d','quickkart']
    services['redis']['volumes']=['redis_data:/data']
    services['kafka']['environment'].update(KAFKA_HEAP_OPTS='-Xms128m -Xmx256m')
    services['mailpit']={'image':'axllent/mailpit:v1.31.1','ports':['127.0.0.1:18025:8025'],'volumes':['./.local/staging/cert.pem:/tls/cert.pem:ro','./.local/staging/key.pem:/tls/key.pem:ro'],'environment':{'MP_SMTP_TLS_CERT':'/tls/cert.pem','MP_SMTP_TLS_KEY':'/tls/key.pem','MP_SMTP_REQUIRE_STARTTLS':'true','MP_SMTP_AUTH':'stage:${SMTP_PASSWORD:?Missing staging SMTP password}','MP_SMTP_ALLOWED_RECIPIENTS':'@example\\.test$','MP_SMTP_DISABLE_RDNS':'true'}}
    services['backend']['environment'].update(SMTP_HOST='mailpit',SMTP_PORT='1025',SMTP_USERNAME='stage',SMTP_PASSWORD='${SMTP_PASSWORD:?Missing staging SMTP password}',SMTP_FROM='quickkart@example.test',SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_TRUST='mailpit')
    services['api-gateway']['environment'].update(CORS_ALLOWED_ORIGIN='http://127.0.0.1:13000',CORS_SECONDARY_ORIGIN='http://localhost:13000')
    services['backend']['depends_on']['mailpit']={'condition':'service_started'}
    services['migrate']={'image':'postgres:15-alpine','environment':{'PGPASSWORD':'${POSTGRES_PASSWORD:?Missing staging database password}'},'volumes':['./infrastructure/postgres/migrations/002_commerce_reliability.sql:/migration.sql:ro'],'command':['psql','-h','postgres','-U','postgres','-d','quickkart','-v','ON_ERROR_STOP=1','--single-transaction','-f','/migration.sql'],'depends_on':{'postgres':{'condition':'service_healthy'}}}
    for name,port in [('backend',8081),('product-service',8082),('order-service',8083),('api-gateway',8080),('frontend',3000)]:
        services[name]['ports']=[f'127.0.0.1:{port+10000}:{port}']
        if name in ['backend','product-service','order-service']: services[name]['depends_on']['migrate']={'condition':'service_completed_successfully'}
    services['frontend']['healthcheck']={'test':['CMD','wget','-q','--spider','http://127.0.0.1:3000/'],'interval':'10s','timeout':'5s','retries':10}
    for name in ['frontend','api-gateway','backend','product-service','order-service','mailpit']:
        services[name]['networks']=['default','edge']
    COMPOSE.parent.mkdir(parents=True,exist_ok=True)
    COMPOSE.write_text(json.dumps({'name':PROJECT,'services':services,'volumes':{'postgres_data':{},'redis_data':{}},'networks':{'default':{'internal':True},'edge':{}} },indent=2))
    run(compose('config','--quiet'))
    print('Staging configuration validated; existing secrets were not copied or rotated.')
def main():
    p=argparse.ArgumentParser(); p.add_argument('action',choices=['setup','build','up','status','stop']); a=p.parse_args()
    if a.action=='setup': setup(); return
    if a.action in ['build','up']: require_capacity(ROOT,8 if a.action=='build' else 4)
    commands={'build':['build'],'up':['up','-d','--wait','--wait-timeout','240'],'status':['ps'],'stop':['stop']}
    subprocess.run(compose(*commands[a.action]),check=True)
if __name__=='__main__': main()


