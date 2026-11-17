"""Additional real gateway OTP lifetime checks using synthetic staging identities."""
import json,secrets
from verify_staging import api,otp,sql,check,RESULTS
from staging import LOCAL
def main():
    for mode in ['expired','exhausted']:
        email=mode+'-'+secrets.token_hex(5)+'@example.test'
        code,body=api('POST','/api/auth/register',{'name':'Synthetic OTP','email':email,'password':secrets.token_urlsafe(20)+'aA1!'})
        check(mode+' challenge created without token',code==201 and not body.get('token'))
        value=otp(email)
        if mode=='expired':
            sql("UPDATE email_verifications SET expiry_at=now()-interval '1 minute' WHERE email='"+email+"'")
            check('expired correct OTP rejected',api('POST','/api/auth/verify-otp',{'email':email,'otp':value})[0]==400)
            check('expired challenge invalidated',sql("SELECT verified FROM email_verifications WHERE email='"+email+"'")=='t')
        else:
            wrong='000000' if value!='000000' else '111111'
            for _ in range(5): assert api('POST','/api/auth/verify-otp',{'email':email,'otp':wrong})[0]==400
            check('five failed attempts committed and challenge invalidated',sql("SELECT attempts::text||'|'||verified::text FROM email_verifications WHERE email='"+email+"'")=='5|true')
            check('correct OTP rejected after attempt exhaustion',api('POST','/api/auth/verify-otp',{'email':email,'otp':value})[0]==400)
        check(mode+' account remains unverified',sql("SELECT email_verified FROM users WHERE email='"+email+"'")=='f')
    (LOCAL/'staging/challenge-results.json').write_text(json.dumps({'passed':len(RESULTS),'checks':RESULTS},indent=2))
if __name__=='__main__':main()
