import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import {CartProvider,useCart} from '../context/CartContext';
import {CheckoutModal} from '../components/CheckoutModal';
import {api} from '../services/api';
import {ApiError} from '../services/http';
import {readAttempt} from '../services/checkoutAttempt';
import type {CartResponse,OrderResponse} from '../types';
const auth=vi.hoisted(()=>({isAuthenticated:true,user:{id:7,name:'Test Customer',phoneNumber:'9876543210'}}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>auth}));
vi.mock('../services/api',()=>({api:{getCart:vi.fn(),addToCart:vi.fn(),updateCartItemQuantity:vi.fn(),removeFromCart:vi.fn(),clearCart:vi.fn(),checkout:vi.fn(),getMyProfile:vi.fn(),updateMyProfile:vi.fn(),payOrder:vi.fn(),getPaymentMethods:vi.fn()}}));
const cart=(q=0):CartResponse=>({cartId:1,fingerprint:'quote-'+q,totalAmount:q*12.5,items:q?[{productId:1,productName:'Test item',quantity:q,price:12.5,subtotal:q*12.5,availableQuantity:5}]:[]});
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
let context:ReturnType<typeof useCart>;
function Harness(){context=useCart();return <><output data-testid="count">{context.itemsCount}</output><output data-testid="error">{context.error}</output><output data-testid="uncertain">{String(context.needsRefresh)}</output><button onClick={()=>void context.addToCart(1).catch(()=>{})}>Add</button><button onClick={()=>void context.fetchCart().catch(()=>{})}>Refresh</button></>;}
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();auth.user.id=7;auth.isAuthenticated=true;vi.mocked(api.getCart).mockResolvedValue(cart());vi.mocked(api.getPaymentMethods).mockResolvedValue(['COD','UPI','CARD']);vi.mocked(api.getMyProfile).mockResolvedValue({id:7,name:'Test Customer',email:'t@example.invalid',role:'USER',emailVerified:true,accountStatus:'ACTIVE',savedAddress:null});vi.mocked(api.updateMyProfile).mockImplementation(async(r)=>({id:7,name:r.name,email:'t@example.invalid',role:'USER',emailVerified:true,accountStatus:'ACTIVE',savedAddress:r.savedAddress}));});
it('does not acknowledge a cart mutation until the server confirms and rejects duplicate clicks',async()=>{
 const pending=deferred<CartResponse>();vi.mocked(api.addToCart).mockReturnValue(pending.promise);render(<CartProvider><Harness/></CartProvider>);await waitFor(()=>expect(api.getCart).toHaveBeenCalledOnce());
 fireEvent.click(screen.getByText('Add'));fireEvent.click(screen.getByText('Add'));expect(api.addToCart).toHaveBeenCalledOnce();expect(screen.getByTestId('count').textContent).toBe('0');
 await act(async()=>pending.resolve(cart(1)));expect(screen.getByTestId('count').textContent).toBe('1');
});
it('late initial cart reads cannot overwrite a confirmed mutation',async()=>{
 const old=deferred<CartResponse>();vi.mocked(api.getCart).mockReturnValueOnce(old.promise);vi.mocked(api.addToCart).mockResolvedValue(cart(2));render(<CartProvider><Harness/></CartProvider>);
 fireEvent.click(screen.getByText('Add'));await waitFor(()=>expect(screen.getByTestId('count').textContent).toBe('2'));await act(async()=>old.resolve(cart()));expect(screen.getByTestId('count').textContent).toBe('2');
});
it('failed mutation reconciles with a read and visibly preserves the failure',async()=>{
 vi.mocked(api.addToCart).mockRejectedValue(new Error('Insufficient stock'));vi.mocked(api.getCart).mockResolvedValue(cart(1));render(<CartProvider><Harness/></CartProvider>);await waitFor(()=>expect(context.itemsCount).toBe(1));fireEvent.click(screen.getByText('Add'));await waitFor(()=>expect(api.getCart).toHaveBeenCalledTimes(2));expect(context.itemsCount).toBe(1);expect(context.error).toContain('Insufficient stock');expect(api.addToCart).toHaveBeenCalledOnce();
});
it('uncertain mutation blocks new writes until an explicit successful refresh',async()=>{
 vi.mocked(api.getCart).mockResolvedValueOnce(cart(1)).mockRejectedValueOnce(new Error('Offline'));vi.mocked(api.addToCart).mockRejectedValue(new Error('Timed out'));render(<CartProvider><Harness/></CartProvider>);await waitFor(()=>expect(context.itemsCount).toBe(1));fireEvent.click(screen.getByText('Add'));await waitFor(()=>expect(context.needsRefresh).toBe(true));
 fireEvent.click(screen.getByText('Add'));expect(api.addToCart).toHaveBeenCalledOnce();vi.mocked(api.getCart).mockResolvedValue(cart(2));fireEvent.click(screen.getByText('Refresh'));await waitFor(()=>expect(context.needsRefresh).toBe(false));expect(context.itemsCount).toBe(2);
});
it('quantity changes and zero removal use confirmed authoritative responses',async()=>{
 vi.mocked(api.getCart).mockResolvedValue(cart(1));vi.mocked(api.updateCartItemQuantity).mockResolvedValue(cart(3));vi.mocked(api.removeFromCart).mockResolvedValue(cart());render(<CartProvider><Harness/></CartProvider>);await waitFor(()=>expect(context.itemsCount).toBe(1));await act(async()=>context.updateQuantity(1,3));expect(context.itemsCount).toBe(3);await act(async()=>context.updateQuantity(1,0));expect(context.itemsCount).toBe(0);expect(api.removeFromCart).toHaveBeenCalledWith(1);await expect(context.updateQuantity(1,-1)).rejects.toThrow('positive');
});
it('account change clears the cart and ignores the former account response',async()=>{
 const old=deferred<CartResponse>();vi.mocked(api.getCart).mockReturnValueOnce(old.promise).mockResolvedValueOnce(cart());const view=render(<CartProvider><Harness/></CartProvider>);auth.user.id=8;view.rerender(<CartProvider><Harness/></CartProvider>);await waitFor(()=>expect(api.getCart).toHaveBeenCalledTimes(2));await act(async()=>old.resolve(cart(5)));expect(context.itemsCount).toBe(0);
});
it('logout clears displayed cart and prevents further writes',async()=>{
 vi.mocked(api.getCart).mockResolvedValue(cart(2));const view=render(<CartProvider><Harness/></CartProvider>);await waitFor(()=>expect(context.itemsCount).toBe(2));auth.isAuthenticated=false;view.rerender(<CartProvider><Harness/></CartProvider>);await waitFor(()=>expect(context.itemsCount).toBe(0));await expect(context.addToCart(1)).rejects.toThrow('sign in');expect(api.addToCart).not.toHaveBeenCalled();
});
async function checkout(success=vi.fn()){
 vi.mocked(api.getCart).mockResolvedValue(cart(1));const view=render(<CartProvider><Harness/><CheckoutModal isOpen onClose={()=>{}} onOrderSuccess={success}/></CartProvider>);await waitFor(()=>expect(context.itemsCount).toBe(1));return {view,success};
}
function fill(){fireEvent.change(screen.getByLabelText('Delivery address'),{target:{value:'123 Test Street'}});fireEvent.click(screen.getByLabelText(/I confirm the current items/));}
it('checkout waits for confirmation and blocks rapid duplicate submission',async()=>{
 const pending=deferred<OrderResponse>();vi.mocked(api.checkout).mockReturnValue(pending.promise);const {success}=await checkout();fill();fireEvent.click(screen.getByText('Place COD order'));fireEvent.submit(screen.getByRole('button',{name:/Placing order/}).closest('form')!);expect(api.checkout).toHaveBeenCalledOnce();expect(success).not.toHaveBeenCalled();expect(context.itemsCount).toBe(1);
 await act(async()=>pending.resolve({id:91,userId:7,status:'CONFIRMED',totalAmount:12.5,items:[],paymentStatus:'COLLECTION_PENDING'}));expect(success).toHaveBeenCalledOnce();expect(readAttempt(7)).toBeNull();
});
it('timeout preserves the request across remount and retries the identical key and payload',async()=>{
 vi.mocked(api.checkout).mockRejectedValueOnce(new ApiError('Timed out',0));const first=await checkout();fill();fireEvent.click(screen.getByText('Place COD order'));await screen.findByText('Retry same order');const request=vi.mocked(api.checkout).mock.calls[0][0];expect(readAttempt(7)).toEqual(request);first.view.unmount();
 vi.mocked(api.checkout).mockResolvedValue({id:92,userId:7,status:'CONFIRMED',totalAmount:12.5,items:[],paymentStatus:'COLLECTION_PENDING'});const second=await checkout();fireEvent.click(screen.getByText('Retry same order'));await waitFor(()=>expect(second.success).toHaveBeenCalledOnce());expect(vi.mocked(api.checkout).mock.calls[1][0]).toEqual(request);
});
it('changed-price rejection refreshes totals and requires renewed confirmation',async()=>{
 vi.mocked(api.checkout).mockRejectedValue(new ApiError('Prices changed',409));await checkout();fill();vi.mocked(api.getCart).mockResolvedValue({...cart(1),fingerprint:'updated-price',totalAmount:15});fireEvent.click(screen.getByText('Place COD order'));await screen.findByText('Prices changed');await waitFor(()=>expect(context.totalAmount).toBe(15));expect(readAttempt(7)).toBeNull();expect((screen.getByText('Place COD order') as HTMLButtonElement).disabled).toBe(true);expect((screen.getByRole('radio',{name:/Cash on delivery/}) as HTMLInputElement).checked).toBe(true);
});
const order=(over:Partial<OrderResponse>={}):OrderResponse=>({id:41,userId:7,status:'PLACED',totalAmount:12.5,paymentMethod:'COD',paymentStatus:'COLLECTION_PENDING',items:[],...over});
it('pre-fills the saved address and saves a new one after the order is placed',async()=>{
 vi.mocked(api.getMyProfile).mockResolvedValue({id:7,name:'Test Customer',email:'t@example.invalid',role:'USER',emailVerified:true,accountStatus:'ACTIVE',savedAddress:'9 Saved Lane, Pune'});
 vi.mocked(api.checkout).mockResolvedValue(order());const {success}=await checkout();
 await waitFor(()=>expect((screen.getByLabelText('Delivery address') as HTMLTextAreaElement).value).toBe('9 Saved Lane, Pune'));
 expect(screen.queryByLabelText(/Save this address/)).toBeNull();
 fireEvent.change(screen.getByLabelText('Delivery address'),{target:{value:'10 New Road, Pune'}});
 expect((screen.getByLabelText(/Save this address/) as HTMLInputElement).checked).toBe(true);
 fireEvent.click(screen.getByLabelText(/I confirm the current items/));fireEvent.click(screen.getByText('Place COD order'));
 await waitFor(()=>expect(success).toHaveBeenCalled());
 expect(api.updateMyProfile).toHaveBeenCalledWith({name:'Test Customer',savedAddress:'10 New Road, Pune'});
});
it('online payment opens the test-mode gateway and only reports success once paid',async()=>{
 vi.mocked(api.checkout).mockResolvedValue(order({status:'PENDING',paymentMethod:'UPI',paymentStatus:'PENDING',payable:true}));
 vi.mocked(api.payOrder).mockResolvedValueOnce(order({status:'PENDING',paymentMethod:'UPI',paymentStatus:'FAILED',payable:true}))
   .mockResolvedValueOnce(order({status:'PLACED',paymentMethod:'UPI',paymentStatus:'PAID'}));
 const {success}=await checkout();fill();fireEvent.click(screen.getByRole('radio',{name:/UPI/}));
 fireEvent.click(screen.getByText('Continue to payment'));
 await screen.findByText('Complete payment');
 expect(vi.mocked(api.checkout).mock.calls[0][0].paymentMethod).toBe('UPI');
 fireEvent.click(screen.getByText('Simulate a failed payment'));
 await screen.findByText(/Payment failed: no money was taken/);expect(success).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:/^Pay ₹/}));
 await waitFor(()=>expect(success).toHaveBeenCalledWith(expect.objectContaining({paymentStatus:'PAID'})));
});
it('offers only cash on delivery when the server has online payment switched off',async()=>{
 vi.mocked(api.getPaymentMethods).mockResolvedValue(['COD']);await checkout();
 await waitFor(()=>expect(screen.queryByRole('radio',{name:/UPI/})).toBeNull());
 expect(screen.getByRole('radio',{name:/Cash on delivery/})).toBeTruthy();
});
