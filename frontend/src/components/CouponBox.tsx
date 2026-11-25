import React, { useEffect, useState } from 'react';
import { Tag, X } from 'lucide-react';
import { api } from '../services/api';
import { Coupon, CouponQuote } from '../types';
import { formatINR } from '../utils/formatters';

interface Props {
  /** Changes whenever the cart changes; an applied coupon is re-checked then. */
  cartFingerprint?: string;
  applied: CouponQuote | null;
  onChange: (quote: CouponQuote | null) => void;
  disabled?: boolean;
}

/** Coupon entry for checkout: available offers, a code field and the applied discount. */
export function CouponBox({ cartFingerprint, applied, onChange, disabled = false }: Props) {
  const [offers, setOffers] = useState<Coupon[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getOffers().then(setOffers).catch(() => setOffers([]));
  }, []);

  const apply = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await api.previewCoupon(trimmed));
      setCode('');
    } catch (err) {
      onChange(null);
      setError(err instanceof Error ? err.message : 'This coupon could not be applied.');
    } finally {
      setBusy(false);
    }
  };

  // The cart changed: check the applied code again against the new total.
  useEffect(() => {
    if (applied) void apply(applied.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartFingerprint]);

  if (applied) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-success/30 bg-success-soft p-3 text-sm">
        <span className="flex items-start gap-2">
          <Tag className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <span>
            <span className="font-semibold text-fg">{applied.code}</span> applied: you save {formatINR(applied.discount)}
            {applied.description && <span className="block text-xs text-muted">{applied.description}</span>}
          </span>
        </span>
        <button type="button" disabled={disabled} onClick={() => onChange(null)} aria-label={`Remove coupon ${applied.code}`} className="rounded p-1 text-muted hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Not a <form>: this box sits inside the checkout form. Enter applies the code instead of placing the order. */}
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="coupon-code">Coupon code</label>
        <input
          id="coupon-code"
          className="qk-input h-10 flex-1 uppercase"
          placeholder="Coupon code"
          maxLength={40}
          value={code}
          disabled={disabled || busy}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void apply(code);
            }
          }}
        />
        <button type="button" onClick={() => void apply(code)} disabled={disabled || busy || !code.trim()} className="qk-btn qk-btn-ghost h-10 px-4 text-sm">
          {busy ? 'Checking…' : 'Apply'}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-sale">{error}</p>}
      {offers.length > 0 && (
        <ul className="space-y-1.5" aria-label="Available offers">
          {offers.slice(0, 3).map((o) => (
            <li key={o.id}>
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => void apply(o.code)}
                className="flex w-full items-center gap-2 rounded-md border border-dashed border-line px-2.5 py-1.5 text-left text-xs hover:border-fg"
              >
                <span className="rounded bg-fg px-1.5 py-0.5 font-mono font-bold text-bg">{o.code}</span>
                <span className="text-muted">{o.description ?? (o.discountType === 'PERCENT' ? `${o.discountValue}% off` : `${formatINR(o.discountValue)} off`)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
