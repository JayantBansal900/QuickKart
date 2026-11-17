import React, { useEffect, useRef, useState } from 'react';
import { Banknote, CreditCard, ShieldCheck, Smartphone, X } from 'lucide-react';
import { PaymentPanel } from './PaymentPanel';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ApiError } from '../services/http';
import { CheckoutRequest, OrderResponse, PaymentMethod } from '../types';
import { readAttempt, saveAttempt, clearAttempt } from '../services/checkoutAttempt';
import { formatINR } from '../utils/formatters';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOrderSuccess: (order: OrderResponse) => void;
}

const METHODS: { id: PaymentMethod; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'COD', label: 'Cash on delivery', hint: 'Pay in cash when the order arrives.', icon: Banknote },
  { id: 'UPI', label: 'UPI', hint: 'Pay now with any UPI app (test mode).', icon: Smartphone },
  { id: 'CARD', label: 'Credit / debit card', hint: 'Pay now by card (test mode).', icon: CreditCard },
];

/**
 * Checkout: cash on delivery, or UPI / card through the simulated gateway. The request (with its idempotency key) is saved BEFORE it is sent,
 * so a refresh or timeout retries the same order instead of creating a second one.
 */
export const CheckoutModal: React.FC<Props> = ({ isOpen, onClose, onOrderSuccess }) => {
  const { user } = useAuth();
  const { cart, fetchCart, isLoading, needsRefresh } = useCart();
  const [attempt, setAttempt] = useState<CheckoutRequest | null>(() => (user ? readAttempt(user.id) : null));
  const [name, setName] = useState(attempt?.recipientName ?? user?.name ?? '');
  const [address, setAddress] = useState(attempt?.deliveryAddress ?? '');
  const [phone, setPhone] = useState(attempt?.deliveryPhone ?? user?.phoneNumber ?? '');
  const [method, setMethod] = useState<PaymentMethod>(attempt?.paymentMethod ?? 'COD');
  const [savedAddress, setSavedAddress] = useState<string | null>(null);
  const [saveAddress, setSaveAddress] = useState(true);
  const [awaitingPayment, setAwaitingPayment] = useState<OrderResponse | null>(null);
  const profileName = useRef<string>(user?.name ?? '');

  // Pre-fill from the profile's saved address (and phone) the first time the dialog opens.
  useEffect(() => {
    if (!isOpen || !user) return;
    let alive = true;
    api.getMyProfile().then((profile) => {
      if (!alive) return;
      profileName.current = profile.name;
      setSavedAddress(profile.savedAddress ?? null);
      if (profile.savedAddress) setAddress((current) => current || profile.savedAddress || '');
      if (profile.phoneNumber) setPhone((current) => current || profile.phoneNumber || '');
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [isOpen, user]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const pending = useRef(false);
  useEffect(() => { setReviewed(false); }, [cart?.fingerprint]);

  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, [isOpen]);

  // Keep keyboard focus inside the dialog.
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
    if (event.key === 'Tab') {
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? []);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };

  if (!isOpen) return null;

  if (awaitingPayment) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
        <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm" />
        <section role="dialog" aria-modal="true" aria-labelledby="payment-title" className="relative w-full animate-rise rounded-t-[28px] bg-surface p-6 shadow-2xl sm:max-w-md sm:rounded-[28px]">
          <h2 id="payment-title" className="qk-display mb-4 text-3xl text-fg">Complete payment</h2>
          <PaymentPanel
            order={awaitingPayment}
            onPaid={(paid) => { setAwaitingPayment(null); onOrderSuccess(paid); }}
            onLater={() => { const order = awaitingPayment; setAwaitingPayment(null); onOrderSuccess(order); }}
          />
        </section>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending.current || !user) return;
    if (!attempt && (!cart?.items.length || !cart.fingerprint || !reviewed || needsRefresh)) {
      setError('Refresh and confirm the current cart before placing your order.');
      return;
    }
    const request = attempt ?? ({
      paymentMethod: method,
      idempotencyKey: crypto.randomUUID(),
      cartFingerprint: cart!.fingerprint,
      recipientName: name.trim(),
      deliveryAddress: address.trim(),
      deliveryPhone: phone.trim(),
    } satisfies CheckoutRequest);
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      // Persist before sending, so refresh/timeouts retry the same durable backend operation.
      saveAttempt(user.id, request);
      setAttempt(request);
      const order = await api.checkout(request);
      clearAttempt(user.id);
      setAttempt(null);
      void fetchCart().catch(() => {});
      if (saveAddress && request.deliveryAddress !== savedAddress) {
        // Best effort: the order is already placed, a failed profile update must not hide that.
        void api.updateMyProfile({ name: profileName.current || request.recipientName, savedAddress: request.deliveryAddress })
          .then((p) => setSavedAddress(p.savedAddress ?? null)).catch(() => undefined);
      }
      if (order.payable) setAwaitingPayment(order);
      else onOrderSuccess(order);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to place order.';
      const definite = err instanceof ApiError && [400, 401, 403, 404, 409, 422, 429].includes(err.status);
      if (definite) {
        clearAttempt(user.id);
        setAttempt(null);
        setReviewed(false);
        setError(message);
        void fetchCart().catch(() => {});
      } else {
        setError(message + ' The outcome is uncertain. Use Retry same order; do not start another checkout.');
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const locked = busy || !!attempt;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <section
        ref={dialog}
        tabIndex={-1}
        onKeyDown={keys}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="relative flex max-h-[92vh] w-full animate-rise flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl outline-none sm:max-w-3xl sm:animate-scale-in sm:rounded-[28px]"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-6">
          <h2 id="checkout-title" className="qk-display text-3xl text-fg">Checkout</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close checkout" className="grid h-10 w-10 place-items-center rounded-full hover:bg-subtle disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[1fr_300px]">
          {/* Delivery details */}
          <div className="space-y-5 p-6">
            {error && <p role="alert" className="rounded-xl bg-sale-soft p-3 text-sm text-sale">{error}</p>}
            {attempt && (
              <p role="status" className="rounded-xl bg-accent-soft p-3 text-sm text-fg">
                A previous order request needs confirmation. Retrying uses the same request and cannot create a second order.
              </p>
            )}

            <div>
              <h3 className="text-sm font-semibold text-fg">Delivery details</h3>
              <div className="mt-3 space-y-4">
                <label className="qk-label">
                  Recipient name
                  <input className="qk-input" required maxLength={120} autoComplete="name" value={name} disabled={locked} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="qk-label">
                  Delivery address
                  <textarea className="qk-input" rows={3} required minLength={8} maxLength={1000} autoComplete="street-address" value={address} disabled={locked} onChange={(e) => setAddress(e.target.value)} />
                </label>
                <label className="qk-label">
                  Delivery phone
                  <input className="qk-input" type="tel" required minLength={5} maxLength={40} autoComplete="tel" value={phone} disabled={locked} onChange={(e) => setPhone(e.target.value)} />
                </label>
                {address.trim() && address.trim() !== savedAddress && (
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--qk-accent)]" checked={saveAddress} disabled={locked} onChange={(e) => setSaveAddress(e.target.checked)} />
                    Save this address for next time
                  </label>
                )}
              </div>
            </div>

            <div>
              <h3 id="payment-method-label" className="text-sm font-semibold text-fg">Payment</h3>
              <div role="radiogroup" aria-labelledby="payment-method-label" className="mt-3 grid gap-2">
                {METHODS.map(({ id, label, hint, icon: Icon }) => (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors ${method === id ? 'border-fg' : 'border-line hover:border-muted'} ${locked ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    <input type="radio" name="payment-method" value={id} checked={method === id} disabled={locked} onChange={() => setMethod(id)} className="sr-only" />
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-fg" />
                    <span className="text-sm">
                      <span className="block font-medium text-fg">{label}</span>
                      <span className="mt-0.5 block text-muted">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Summary */}
          <aside className="flex flex-col border-t border-line bg-subtle/60 p-6 md:border-l md:border-t-0">
            <h3 className="text-sm font-semibold text-fg">Order summary</h3>
            <ul className="mt-3 space-y-2.5 text-sm">
              {cart?.items.map((item) => (
                <li key={item.productId} className="flex justify-between gap-3">
                  <span className="min-w-0 text-muted"><span className="text-fg">{item.quantity} ×</span> {item.productName}</span>
                  <span className="shrink-0 text-fg">{formatINR(item.subtotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-line pt-4 text-base font-semibold text-fg">
              <span>Total</span>
              <span>{formatINR(cart?.totalAmount ?? 0)}</span>
            </div>
            <p className="mt-2 text-xs text-muted">No additional tax or shipping charge is configured. Prices and stock are checked again by the server.</p>

            <div className="mt-auto space-y-3 pt-6">
              {!attempt && (
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-fg">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--qk-accent)]" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                  I confirm the current items and total shown above.
                </label>
              )}
              <button
                className="qk-btn qk-btn-primary h-12 w-full"
                type="submit"
                disabled={busy || (!attempt && (isLoading || needsRefresh || !reviewed || !cart?.items.length))}
              >
                {busy ? 'Placing order…' : attempt ? 'Retry same order' : method === 'COD' ? 'Place COD order' : 'Continue to payment'}
              </button>
              <button className="w-full text-center text-sm text-muted hover:text-fg" type="button" disabled={busy} onClick={onClose}>
                Back to cart
              </button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
                <ShieldCheck className="h-3.5 w-3.5" /> Safe to retry — duplicate orders are prevented
              </p>
            </div>
          </aside>
        </form>
      </section>
    </div>
  );
};
