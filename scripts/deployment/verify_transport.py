"""Fault injection limited to containers verified as members of staging."""
import json, secrets, subprocess, time
from verify_staging import api, container, sql, request, check, RESULTS
from staging import LOCAL, run
def logs():
    return '\n'.join(run(['docker','logs',container(s),'--since','10m']).decode(errors='replace') for s in ['backend','order-service'])
def main():
    credentials=json.loads((LOCAL/'staging/browser-account.json').read_text())
    code,data=api('POST','/api/auth/login',credentials)
    check('transport account login',code==200); token=data['token']
    redis=container('redis')
    try:
        run(['docker','stop',redis])
        check('Redis outage fails authentication closed',api('POST','/api/auth/login',credentials)[0]==503)
        check('Redis outage preserves authenticated cart reads',api('GET','/api/cart',token=token)[0]==200)
    finally: run(['docker','start',redis])
    for _ in range(15):
        if api('POST','/api/auth/login',credentials)[0]==200: break
        time.sleep(1)
    else: raise AssertionError('Redis recovery')
    check('Redis recovery restores authentication',True)
    kafka=container('kafka')
    consume=['docker','exec',kafka,'/opt/kafka/bin/kafka-console-consumer.sh','--bootstrap-server','localhost:9092','--topic','quickkart.order-events','--from-beginning','--timeout-ms','8000']
    captured=subprocess.run(consume,capture_output=True).stdout.decode()
    events=[json.loads(line) for line in captured.splitlines() if line.startswith('{')]
    check('real Kafka checkout event publication',any(e.get('eventId','').startswith('ORDER_CREATED-') for e in events))
    event={'eventId':'STAGE-DUP-'+secrets.token_hex(8),'eventType':'ORDER_CREATED','orderId':900001,'userId':900001,'totalAmount':1,'createdAt':'2026-10-22T00:00:00','items':[]}
    subprocess.run(['docker','exec','-i',kafka,'/opt/kafka/bin/kafka-console-producer.sh','--bootstrap-server','localhost:9092','--topic','quickkart.order-events'],input=((json.dumps(event)+'\n')*2).encode(),capture_output=True,check=True)
    for _ in range(20):
        text=logs()
        if 'DUPLICATE EVENT DETECTED' in text and event['eventId'] in text: break
        time.sleep(1)
    else: raise AssertionError('Duplicate consumption missing')
    check('real Kafka consumer processed order', 'Received ORDER_CREATED event' in text)
    check('Kafka duplicate notification skipped in current process',True)
    api('DELETE','/api/cart',token=token)
    sql('UPDATE products SET stock_quantity=5 WHERE id=1')
    api('POST','/api/cart/items',{'productId':1,'quantity':1},token)
    req=request(token)
    try:
        run(['docker','stop',kafka])
        start=time.monotonic(); code,order=api('POST','/api/orders/checkout',req,token)
        check('broker outage does not roll back committed COD order',code==201 and order['paymentStatus']=='COLLECTION_PENDING')
        latency=round(time.monotonic()-start,3)
    finally: run(['docker','start',kafka])
    for _ in range(45):
        p=subprocess.run(['docker','exec',kafka,'/opt/kafka/bin/kafka-broker-api-versions.sh','--bootstrap-server','localhost:9092'],capture_output=True)
        if p.returncode==0: break
        time.sleep(1)
    check('Kafka broker recovers',p.returncode==0)
    oid=order['orderId']
    api('POST',f'/api/orders/{oid}/cancel',{},token)
    # A fresh event after broker recovery proves resumed transport, not durable outbox delivery.
    api('POST','/api/cart/items',{'productId':1,'quantity':1},token)
    code,after=api('POST','/api/orders/checkout',request(token),token)
    check('checkout after broker recovery',code==201)
    for _ in range(20):
        text=logs()
        if 'Successfully delivered eventId: ORDER_CREATED-'+str(after['orderId']) in text: break
        time.sleep(1)
    else: raise AssertionError('Post-recovery event not delivered')
    check('Kafka publication resumes after recovery',True)
    api('POST',f"/api/orders/{after['orderId']}/cancel",{},token)
    (LOCAL/'staging/transport-results.json').write_text(json.dumps({'passed':len(RESULTS),'checks':RESULTS,'outage_checkout_seconds':latency,'durable_delivery':False,'deduplication':'process memory only'},indent=2))
if __name__=='__main__': main()

