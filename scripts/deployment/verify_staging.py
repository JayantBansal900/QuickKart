"""Gateway regression checks. SQL mutations require an owned staging container and marker."""
import concurrent.futures, json, re, secrets, subprocess, time, urllib.request, urllib.error
from staging import ROOT, LOCAL, PROJECT, compose, run
BASE='http://127.0.0.1:18080'; MONO='http://127.0.0.1:18081'
RESULTS=[]
def check(label, condition):
    if not condition: raise AssertionError(label)
    RESULTS.append(label); print('PASS '+label,flush=True)
def container(service):
    cid=run(compose('ps','-q',service)).decode().strip()
    meta=json.loads(run(['docker','inspect',cid]))[0]
    if meta['Config']['Labels'].get('com.docker.compose.project')!=PROJECT: raise RuntimeError('Refusing non-staging container')
    if meta['Config']['Labels'].get('com.docker.compose.service')!=service: raise RuntimeError('Unexpected staging service')
    return cid
def sql(query):
    cid=container('postgres')
    cmd=['docker','exec','-i',cid,'psql','-X','-U','postgres','-d','quickkart','-At','-v','ON_ERROR_STOP=1']
    marker=subprocess.run(cmd,input=b"SELECT identity FROM quickkart_stage_guard;",capture_output=True,check=True,timeout=30).stdout.decode().strip()
    if marker!=PROJECT: raise RuntimeError('Refusing database without staging marker')
    return subprocess.run(cmd,input=query.encode(),capture_output=True,check=True,timeout=30).stdout.decode().strip()
def api(method,path,data=None,token=None,base=BASE):
    headers={'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    req=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=45) as res: return res.status,json.loads(res.read() or b'{}')
    except urllib.error.HTTPError as ex:
        body=ex.read()
        try: return ex.code,json.loads(body)
        except ValueError: return ex.code,{}
def otp(email):
    for _ in range(15):
        with urllib.request.urlopen('http://127.0.0.1:18025/api/v1/messages') as res: messages=json.load(res)['messages']
        for m in messages:
            if any(x['Address']==email for x in m['To']):
                with urllib.request.urlopen('http://127.0.0.1:18025/api/v1/message/'+m['ID']) as res: body=json.load(res)
                return re.search(r'\b\d{6}\b',body['Text']).group()
        time.sleep(1)
    raise RuntimeError('Synthetic email did not arrive')
def register(label):
    email=label+'-'+secrets.token_hex(4)+'@example.test'; password=secrets.token_urlsafe(16)+'aA1!'
    code,data=api('POST','/api/auth/register',{'name':'Stage '+label,'email':email,'password':password,'role':'ADMIN'})
    check(label+' registration without token or admin escalation',code==201 and not data.get('token') and data.get('role')=='USER' and 'otp' not in data)
    check(label+' unverified login rejected',api('POST','/api/auth/login',{'email':email,'password':password})[0] in [401,403])
    value=otp(email)
    check(label+' incorrect OTP rejected',api('POST','/api/auth/verify-otp',{'email':email,'otp':'000000' if value!='000000' else '111111'})[0]==400)
    check(label+' failed OTP attempt persisted',sql("SELECT attempts FROM email_verifications WHERE email='"+email+"' ORDER BY id DESC LIMIT 1")=='1')
    code,data=api('POST','/api/auth/verify-otp',{'email':email,'otp':value})
    check(label+' SMTP delivered OTP verified',code==200 and bool(data.get('token')))
    check(label+' OTP replay rejected',api('POST','/api/auth/verify-otp',{'email':email,'otp':value})[0]==400)
    code,auth=api('POST','/api/auth/login',{'email':email,'password':password})
    check(label+' verified login',code==200 and bool(auth.get('token')))
    return email,password,auth['token'],auth['id']
def cart(token): return api('GET','/api/cart',token=token)[1]
def request(token):
    return {'paymentMethod':'COD','idempotencyKey':secrets.token_hex(16),'cartFingerprint':cart(token)['fingerprint'],'recipientName':'Synthetic Customer','deliveryAddress':'10 Test Street, Staging City','deliveryPhone':'5550101234'}
def stock(): return int(sql('SELECT stock_quantity FROM products WHERE id=1'))
def main():
    check('isolated synthetic database',sql('SELECT count(*) FROM products')=='1')
    a=register('customer-a'); b=register('customer-b'); admin=register('admin')
    token=a[2]
    check('profile through gateway',api('GET','/api/auth/me',token=token)[0]==200)
    check('invalid JWT rejected',api('GET','/api/cart',token='invalid')[0]==401)
    check('customer denied admin',api('GET','/api/admin/orders',token=token)[0]==403)
    sql('UPDATE users SET role=\'ADMIN\' WHERE id='+str(admin[3]))
    check('role change invalidates previous token',api('GET','/api/admin/orders',token=admin[2])[0]==401)
    code,fresh=api('POST','/api/auth/login',{'email':admin[0],'password':admin[1]})
    admin=(admin[0],admin[1],fresh['token'],admin[3])
    check('admin login and authorization',code==200 and api('GET','/api/admin/orders',token=admin[2])[0]==200)
    check('legacy payment uncertainty preserved',api('GET','/api/admin/orders/1',token=admin[2])[1].get('paymentStatus')=='LEGACY_UNVERIFIED')
    for user in [a,b]: api('DELETE','/api/cart',token=user[2])
    c,d=api('POST','/api/cart/items',{'productId':1,'quantity':1},token)
    check('cart add through gateway',c==200 and d['totalAmount']==25.5)
    check('account cart isolation',not cart(b[2])['items'])
    check('cart increase',api('PUT','/api/cart/items/1',{'quantity':3},token)[1]['totalAmount']==76.5)
    check('cart decrease',api('PUT','/api/cart/items/1',{'quantity':1},token)[1]['totalAmount']==25.5)
    check('invalid cart mutation rejected',api('PUT','/api/cart/items/1',{'quantity':-1},token)[0]==400)
    stale=request(token); sql('UPDATE products SET price=26.50 WHERE id=1')
    check('stale price quote rejected',api('POST','/api/orders/checkout',stale,token)[0]==409)
    sql('UPDATE products SET price=25.50 WHERE id=1')
    req=request(token)
    check('online checkout rejected',api('POST','/api/orders/checkout',{**req,'paymentMethod':'CARD'},token)[0]==400)
    check('delivery validation',api('POST','/api/orders/checkout',{**req,'deliveryAddress':''},token)[0]==400)
    before=stock()
    with concurrent.futures.ThreadPoolExecutor() as pool:
        futures=[pool.submit(api,'POST','/api/orders/checkout',req,token,base) for base in [BASE,MONO]]
        replies=[f.result() for f in futures]
    check('cross-service identical key creates one order',all(c==201 for c,d in replies) and replies[0][1]['orderId']==replies[1][1]['orderId'])
    order=replies[0][1]; oid=order['orderId']
    check('COD remains unpaid with snapshot',order['paymentStatus']=='COLLECTION_PENDING' and order['totalAmount']==25.5 and order['recipientName']=='Synthetic Customer')
    check('single inventory deduction and cart clearance',stock()==before-1 and not cart(token)['items'])
    check('cross-account order denied',api('GET',f'/api/orders/{oid}',token=b[2])[0]==404)
    check('idempotency payload conflict',api('POST','/api/orders/checkout',{**req,'deliveryPhone':'5559999999'},token)[0]==409)
    with concurrent.futures.ThreadPoolExecutor() as pool:
        replies=list(pool.map(lambda base:api('POST',f'/api/orders/{oid}/cancel',{},token,base),[BASE,MONO]))
    check('cross-service cancellation restores once',all(c==200 for c,d in replies) and stock()==before)
    check('cancellation does not fabricate refund',replies[0][1]['paymentStatus']=='CANCELLED')
    sql('UPDATE products SET stock_quantity=1 WHERE id=1')
    for u in [a,b]: api('POST','/api/cart/items',{'productId':1,'quantity':1},u[2])
    reqs=[request(a[2]),request(b[2])]
    with concurrent.futures.ThreadPoolExecutor() as pool:
        replies=[f.result() for f in [pool.submit(api,'POST','/api/orders/checkout',reqs[0],a[2],BASE),pool.submit(api,'POST','/api/orders/checkout',reqs[1],b[2],MONO)]]
    check('cross-service final unit race',sorted(c for c,d in replies)==[201,409] and stock()==0)
    winner=next(i for i,v in enumerate(replies) if v[0]==201)
    api('POST',f"/api/orders/{replies[winner][1]['orderId']}/cancel",{},[a,b][winner][2])
    check('race winner cancellation restores unit',stock()==1)
    # A staging-only constraint forces an insertion failure inside checkout's transaction.
    api('DELETE','/api/cart',token=token); api('POST','/api/cart/items',{'productId':1,'quantity':1},token)
    req=request(token); count=sql('SELECT count(*) FROM orders')
    sql("ALTER TABLE orders ADD CONSTRAINT stage_force_failure CHECK (recipient_name IS DISTINCT FROM 'Reject Transaction') NOT VALID")
    try:
        code,_=api('POST','/api/orders/checkout',{**req,'recipientName':'Reject Transaction'},token)
        check('failed checkout rolls back order stock and cart',code>=400 and stock()==1 and sql('SELECT count(*) FROM orders')==count and len(cart(token)['items'])==1)
    finally: sql('ALTER TABLE orders DROP CONSTRAINT stage_force_failure')
    sql("UPDATE users SET account_status='SUSPENDED' WHERE id="+str(a[3]))
    for base,path in [(BASE,'/api/cart'),(MONO,'/api/cart'),('http://127.0.0.1:18082','/api/admin/products')]:
        check('suspended existing token rejected '+base,api('GET',path,token=token,base=base)[0] in [401,403])
    check('suspended login rejected',api('POST','/api/auth/login',{'email':a[0],'password':a[1]})[0] in [401,403])
    sql("UPDATE users SET account_status='ACTIVE' WHERE id="+str(a[3]))
    for path in ['/api/kafka/status','/api/dev/redis-test/status']:
        check('production developer endpoint unavailable '+path,api('GET',path,token=admin[2])[0] in [403,404,405])
    check('Redis login rate limit',any(api('POST','/api/auth/login',{'email':'rate-'+a[0],'password':'incorrect'})[0]==429 for _ in range(12)))
    # Browser credentials remain private; no tokens or OTPs are written to reports.
    (LOCAL/'staging/browser-account.json').write_text(json.dumps({'email':b[0],'password':b[1]}))
    (LOCAL/'staging/integration-results.json').write_text(json.dumps({'passed':len(RESULTS),'checks':RESULTS},indent=2))
    print('TOTAL '+str(len(RESULTS)))
if __name__=='__main__': main()


