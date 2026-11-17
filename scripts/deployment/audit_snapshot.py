"""Safe deployment metadata; environment values and customer records are never emitted."""
import json, pathlib, subprocess, datetime
from staging import ROOT, LOCAL, run
def main():
    names=['quickkart-'+n for n in ['postgres','redis','kafka','monolith','product-service','order-service','api-gateway','frontend']]
    result={'observed_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'containers':[]}
    for name in names:
        item=json.loads(run(['docker','inspect',name]))[0]
        env=dict(v.split('=',1) for v in item['Config']['Env'] if '=' in v)
        result['containers'].append({'name':name,'id':item['Id'],'image':item['Image'],'created':item['Created'],'started':item['State']['StartedAt'],'profile':env.get('SPRING_PROFILES_ACTIVE'),'secret_presence':{k:bool(env.get(k)) for k in ['JWT_SECRET','OTP_HASH_SECRET','SMTP_HOST']},'ports':item['NetworkSettings']['Ports'],'networks':list(item['NetworkSettings']['Networks']),'mounts':[{'type':m['Type'],'name':m.get('Name'),'destination':m['Destination']} for m in item['Mounts']]})
    query="BEGIN READ ONLY; SELECT json_build_object('products',(SELECT count(*) FROM products),'users',(SELECT count(*) FROM users),'orders',(SELECT count(*) FROM orders),'phase4_columns',(SELECT count(*) FROM information_schema.columns WHERE table_name='orders' AND column_name='checkout_key')); COMMIT;"
    lines=run(['docker','exec','quickkart-postgres','psql','-X','-U','postgres','-d','quickkart','-At','-c',query]).decode().splitlines()
    result['database']=json.loads(next(line for line in lines if line.startswith('{')))
    dest=LOCAL/'staging/existing-audit.json'; dest.write_text(json.dumps(result,indent=2))
    print(json.dumps(result['database'])); print('Safe container metadata saved to '+str(dest))
if __name__=='__main__': main()
