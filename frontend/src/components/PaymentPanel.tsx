import React, { useState } from 'react';
import { CreditCard, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { api } from '../services/api';
import { OrderResponse } from '../types';
import { formatINR } from '../utils/formatters';

interface Props {
  order: OrderResponse;
  /** Called with the updated order after a successful payment. */
  onPaid: (order: OrderResponse) => void;
  /** Leave without paying; the order stays reserved until it expires. */
  onLater: () => void;
}

/**
 * Simulated payment gateway ("test mode"). No card or UPI details are collected: the customer
 * chooses the outcome, and the server moves the order PENDING -> PLACED on success or keeps it
 * payable after a failure. The state changes match what a real gateway callback would trigger.
 */
export function PaymentPanel({ order, onPaid, onLater }: Props) {
  const [busy, setBusy] = useState<'SUCCESS' | 'FAILURE' | null>(null);
  const [message, setMessage] = useState<string | null>(order.paymentStatus === 'FAILED' ? 'The last payment attempt failed. You can try again.' : null);

  const pay = async (outcome: 'SUCCESS' | 'FAILURE') => {
    setBusy(outcome);
    setMessage(null);
    try {
      const updated = await api.payOrder(order.id, outcome);
      if (updated.paymentStatus === 'PAID') onPaid(updated);
      else setMessage('Payment failed: no money was taken. Try again, or pay later from My Orders.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Payment could not be processed.');
    } finally {
      setBusy(null);
    }
  };

  const Icon = order.paymentMethod === 'CARD' ? CreditCard : Smartphone;
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-line bg-subtle/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Icon className="h-4 w-4" /> QuickKart Pay · {order.paymentMethod === 'CARD' ? 'Card' : 'UPI'}
          </span>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            Test mode
          </span>
        </div>
        <p className="mt-4 text-sm text-muted">Order #{order.id}</p>
        <p className="qk-display text-5xl text-fg">{formatINR(order.totalAmount)}</p>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          This is a simulated gateway for the demo: no real money moves and no card or UPI details are asked for.
          Your items are reserved for 30 minutes.
        </p>
      </div>
      {message && <p role="alert" className="rounded-xl bg-sale-soft p-3 text-sm text-sale">{message}</p>}
      <div className="space-y-2">
        <button type="button" disabled={!!busy} onClick={() => void pay('SUCCESS')} className="qk-btn qk-btn-primary h-12 w-full">
          {busy === 'SUCCESS' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Pay {formatINR(order.totalAmount)}
        </button>
        <div className="flex gap-2">
          <button type="button" disabled={!!busy} onClick={() => void pay('FAILURE')} className="qk-btn qk-btn-ghost h-10 flex-1 text-xs">
            {busy === 'FAILURE' ? 'Simulating…' : 'Simulate a failed payment'}
          </button>
          <button type="button" disabled={!!busy} onClick={onLater} className="qk-btn qk-btn-ghost h-10 flex-1 text-xs">
            Pay later
          </button>
        </div>
      </div>
    </div>
  );
}
