import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Star, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageResponse, Review, ReviewEligibility } from '../types';

function Stars({ value, size = 'h-3.5 w-3.5' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= value ? 'fill-amber-400 text-amber-400' : 'text-line'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

/**
 * Customer reviews for one product. Anyone can read them; a customer whose order with this product
 * was delivered can write (or edit) one review. The server enforces the same rule.
 */
export function ProductReviews({ productId, onChanged }: { productId: number; onChanged?: () => void }) {
  const { isAuthenticated, user } = useAuth();
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<Review> | null>(null);
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.getReviews(productId, page, 5));
    } catch {
      setData(null);
    }
    if (isAuthenticated && user?.role === 'USER') {
      try {
        const e = await api.getReviewEligibility(productId);
        setEligibility(e);
        if (e.myReview) {
          setRating(e.myReview.rating);
          setTitle(e.myReview.title ?? '');
          setComment(e.myReview.comment ?? '');
        }
      } catch {
        setEligibility(null);
      }
    }
  }, [productId, page, isAuthenticated, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      setError('Choose a star rating.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveReview(productId, { rating, title: title.trim() || undefined, comment: comment.trim() || undefined });
      setFormOpen(false);
      setPage(0);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your review.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (review: Review) => {
    setBusy(true);
    try {
      await api.deleteReview(productId, review.id);
      setRating(0);
      setTitle('');
      setComment('');
      setEligibility((el) => el && { ...el, myReview: null });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your review.');
    } finally {
      setBusy(false);
    }
  };

  const mine = eligibility?.myReview;

  return (
    <section id="reviews" className="mt-6 border-t border-line pt-6" aria-labelledby="reviews-title">
      <div className="flex items-center justify-between gap-3">
        <h3 id="reviews-title" className="text-sm font-semibold text-fg">
          Written reviews{data && data.totalElements > 0 ? ` (${data.totalElements})` : ''}
        </h3>
        {eligibility?.canReview && !formOpen && (
          <button type="button" onClick={() => setFormOpen(true)} className="text-xs font-semibold text-accent hover:underline">
            {mine ? 'Edit your review' : 'Write a review'}
          </button>
        )}
      </div>
      {isAuthenticated && eligibility && !eligibility.canReview && eligibility.reason && (
        <p className="mt-2 text-xs text-muted">{eligibility.reason}</p>
      )}

      {formOpen && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-line p-4">
          <div role="radiogroup" aria-label="Your rating" className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => setRating(n)}
                className="rounded p-0.5"
              >
                <Star className={`h-6 w-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-line'}`} />
              </button>
            ))}
          </div>
          <input className="qk-input" maxLength={120} placeholder="Headline (optional)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Review headline" />
          <textarea className="qk-input" rows={3} maxLength={2000} placeholder="What did you like or dislike?" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Review text" />
          {error && <p role="alert" className="text-sm text-sale">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="qk-btn qk-btn-primary h-10 px-4 text-sm">{busy ? 'Saving…' : 'Submit review'}</button>
            <button type="button" onClick={() => setFormOpen(false)} className="qk-btn qk-btn-ghost h-10 px-4 text-sm">Cancel</button>
          </div>
        </form>
      )}

      {!data || data.content.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No written reviews yet. The star rating above counts all ratings; written reviews come from shoppers who received this product.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {data.content.map((r) => (
            <li key={r.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={r.rating} />
                {r.title && <span className="font-semibold text-fg">{r.title}</span>}
              </div>
              {r.comment && <p className="mt-1 leading-relaxed text-fg">{r.comment}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span>{r.authorName}</span>
                {r.verifiedPurchase && (
                  <span className="inline-flex items-center gap-1 text-success"><BadgeCheck className="h-3.5 w-3.5" /> Verified purchase</span>
                )}
                <span>{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                {r.mine && (
                  <button type="button" disabled={busy} onClick={() => void remove(r)} className="inline-flex items-center gap-1 text-sale hover:underline">
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      {data && data.totalPages > 1 && (
        <div className="mt-4 flex gap-2 text-xs">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="qk-btn qk-btn-ghost h-8 px-3 disabled:opacity-40">Newer</button>
          <button type="button" disabled={data.last} onClick={() => setPage(page + 1)} className="qk-btn qk-btn-ghost h-8 px-3 disabled:opacity-40">Older</button>
        </div>
      )}
    </section>
  );
}
