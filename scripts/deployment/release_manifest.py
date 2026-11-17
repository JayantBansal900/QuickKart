"""Prepare immutable image overrides, without deploying or restarting anything."""
import json, hashlib
from staging import ROOT, LOCAL, compose, run
def main():
    mappings={'backend':'quickkart-monolith','product-service':'quickkart-product-service','order-service':'quickkart-order-service','api-gateway':'quickkart-api-gateway','frontend':'quickkart-frontend'}
    candidate={}; rollback={}
    for service,old in mappings.items():
        cid=run(compose('ps','-q',service)).decode().strip()
        stage=json.loads(run(['docker','inspect',cid]))[0]
        assert stage['Config']['Labels']['com.docker.compose.project']=='quickkart-stage-p5'
        candidate[service]={'image':stage['Image'],'pull_policy':'never'}
        rollback[service]={'image':json.loads(run(['docker','inspect',old]))[0]['Image'],'pull_policy':'never'}
        if service!='frontend':
            candidate[service]['environment']={'SPRING_PROFILES_ACTIVE':'prod'}
        if service=='backend':
            candidate[service]['environment'].update({k:'${'+k+':?Configure production SMTP before deployment}' for k in ['SMTP_HOST','SMTP_PORT','SMTP_USERNAME','SMTP_PASSWORD','SMTP_FROM']})
        if service=='api-gateway':
            candidate[service]['environment'].update({k:'${'+k+':?Set approved frontend origin}' for k in ['CORS_ALLOWED_ORIGIN','CORS_SECONDARY_ORIGIN']})
    (LOCAL/'release-candidate.json').write_text(json.dumps({'services':candidate},indent=2))
    (LOCAL/'rollback-images.json').write_text(json.dumps({'services':rollback},indent=2))
    migration=ROOT/'infrastructure/postgres/migrations/002_commerce_reliability.sql'
    manifest={'migration_sha256':hashlib.sha256(migration.read_bytes()).hexdigest(),'candidate_images':{k:v['image'] for k,v in candidate.items()},'rollback_images':{k:v['image'] for k,v in rollback.items()}}
    (LOCAL/'staging/release-manifest.json').write_text(json.dumps(manifest,indent=2))
    print('Immutable image overrides prepared. No deployment performed.')
if __name__=='__main__': main()
