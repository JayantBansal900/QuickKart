import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../services/api';
import { OrderResponse, ReturnReason } from '../types';

const REASONS: { value: ReturnReason; label: string }[] = [
  { value: 'DAMAGED', label: 'Arrived damaged' },
  { value: 'WRONG_ITEM', label: 'Wrong item delivered' },
  { value: 'NOT_AS_DESCRIBED', label: 'Not as described' },
  { value: 'NO_LONGER_NEEDED', label: 'No longer needed' },
  { value: 'OTHER', label: 'Something else' },
];

/** Ask to return a delivered order (within 7 days of delivery). */
export function ReturnDialog({ order, onClose, onDone }: { order: OrderResponse; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      setError('Choose a reason.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.requestReturn(order.id, reason, comment.trim() || undefined);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request the return.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="return-title"
        className="relative w-full space-y-4 rounded-t-2xl bg-surface p-6 shadow-2xl sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 id="return-title" className="text-xl font-bold tracking-tight text-fg">Return order #{order.id}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-subtle"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-muted">Returns are accepted within 7 days of delivery. Once approved, the full amount is refunded.</p>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium text-fg">Why are you returning it?</legend>
          {REASONS.map((r) => (
            <label key={r.value} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${reason === r.value ? 'border-fg' : 'border-line'}`}>
              <input type="radio" name="return-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
              {r.label}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-fg">Details (optional)</span>
          <textarea className="qk-input" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-sale">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="qk-btn qk-btn-ghost h-10 px-4 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="qk-btn qk-btn-primary h-10 px-4 text-sm">{busy ? 'Sending…' : 'Request return'}</button>
        </div>
      </form>
    </div>
  );
}
