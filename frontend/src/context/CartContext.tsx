import React,{createContext,useContext,useState,useEffect,useCallback,useRef} from 'react';
import {CartResponse} from '../types';
import {api} from '../services/api';
import {useAuth} from './AuthContext';
interface CartContextType {
 cart:CartResponse|null;itemsCount:number;totalAmount:number;isLoading:boolean;error:string|null;needsRefresh:boolean;
 isCartDrawerOpen:boolean;openCartDrawer:()=>void;closeCartDrawer:()=>void;
 fetchCart:()=>Promise<CartResponse|null>;
 addToCart:(id:number,quantity?:number)=>Promise<void>;updateQuantity:(id:number,quantity:number)=>Promise<void>;
 removeItem:(id:number)=>Promise<void>;clearCart:()=>Promise<void>;
}
const CartContext=createContext<CartContextType|undefined>(undefined);
export const CartProvider:React.FC<{children:React.ReactNode}>=({children})=>{
 const {isAuthenticated,user}=useAuth();
 const [cart,setCart]=useState<CartResponse|null>(null),[isLoading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
 const [needsRefresh,setNeedsRefresh]=useState(false),[isCartDrawerOpen,setOpen]=useState(false);
 const sequence=useRef(0),busy=useRef(false),live=useRef(true),uncertain=useRef(false);
 const owner=useRef(user?.id); owner.current=user?.id;
 const fetchCart=useCallback(async()=>{
  if(!isAuthenticated){setCart(null);return null;}
  if(busy.current) throw new Error('Wait for the current cart update to finish.');
  const version=++sequence.current,account=owner.current;setLoading(true);
  try{const data=await api.getCart();if(live.current && version===sequence.current && account===owner.current){setCart(data);setError(null);setNeedsRefresh(false);uncertain.current=false;}return data;}
  catch(e){if(live.current && version===sequence.current){setError(e instanceof Error?e.message:'Unable to restore cart.');setNeedsRefresh(true);uncertain.current=true;}throw e;}
  finally{if(live.current && version===sequence.current)setLoading(false);}
 },[isAuthenticated,user?.id]);
 // Note: no setOpen(false) here. The provider is re-mounted per account (key in App.tsx), and this
 // effect runs AFTER children's effects, so closing here would undo a route (e.g. /cart) that just opened the drawer.
 useEffect(()=>{live.current=true;setCart(null);setError(null);uncertain.current=false;setNeedsRefresh(false);void fetchCart().catch(()=>{});return()=>{live.current=false;sequence.current++;};},[fetchCart]);
 const mutate=async(operation:()=>Promise<CartResponse>,open=false)=>{
  if(!isAuthenticated)throw new Error('Please sign in to update your cart.');
  if(busy.current)throw new Error('A cart update is already pending.');
  if(uncertain.current)throw new Error('Refresh the cart before making another change.');
  busy.current=true;const version=++sequence.current,account=owner.current;setLoading(true);setError(null);
  try{const result=await operation();if(live.current && version===sequence.current && account===owner.current){setCart(result);if(open)setOpen(true);}}
  catch(e){
   if(live.current && version===sequence.current && account===owner.current){
    setError((e instanceof Error?e.message:'Cart update failed.')+' Check the refreshed cart before trying again.');
    uncertain.current=true;setNeedsRefresh(true);
    // Reconcile with a read only; never repeat an uncertain mutation automatically.
    try{const result=await api.getCart();if(live.current && version===sequence.current && account===owner.current){setCart(result);uncertain.current=false;setNeedsRefresh(false);}}catch{/* Keep last confirmed cart and require explicit refresh. */}
   }
   throw e;
  }finally{busy.current=false;if(live.current && version===sequence.current)setLoading(false);}
 };
 const positive=(quantity:number)=>{if(!Number.isSafeInteger(quantity)||quantity<1)throw new Error('Quantity must be a positive whole number.');};
 return <CartContext.Provider value={{cart,isLoading,error,needsRefresh,isCartDrawerOpen,
 itemsCount:cart?.items.reduce((sum,item)=>sum+item.quantity,0)??0,totalAmount:cart?.totalAmount??0,
 openCartDrawer:useCallback(()=>setOpen(true),[]),closeCartDrawer:useCallback(()=>setOpen(false),[]),fetchCart,
 addToCart:async(id,q=1)=>{positive(q);await mutate(()=>api.addToCart({productId:id,quantity:q}),true);},
 updateQuantity:async(id,q)=>{if(q===0)return mutate(()=>api.removeFromCart(id));positive(q);await mutate(()=>api.updateCartItemQuantity(id,{quantity:q}));},
 removeItem:id=>mutate(()=>api.removeFromCart(id)),clearCart:()=>mutate(()=>api.clearCart())}}>{children}</CartContext.Provider>;
};
export function useCart(){const context=useContext(CartContext);if(!context)throw new Error('CartProvider is required');return context;}
