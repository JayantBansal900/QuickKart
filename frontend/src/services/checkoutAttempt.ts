import {CheckoutRequest} from '../types';
const prefix='quickkart_checkout_';
export function readAttempt(userId:number):CheckoutRequest|null {
 try {const raw=sessionStorage.getItem(prefix+userId);return raw ? JSON.parse(raw) as CheckoutRequest : null;}catch{return null;}
}
export function saveAttempt(userId:number,request:CheckoutRequest){sessionStorage.setItem(prefix+userId,JSON.stringify(request));}
export function clearAttempt(userId:number){sessionStorage.removeItem(prefix+userId);}
export function clearCheckoutAttempts(){for(const key of Object.keys(sessionStorage))if(key.startsWith(prefix))sessionStorage.removeItem(key);}
