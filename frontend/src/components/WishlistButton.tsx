import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';

/** Heart toggle for saving a product to the wishlist. */
export function WishlistButton({ productId, productName, className = '' }: { productId: number; productName: string; className?: string }) {
  const { isSaved, toggle } = useWishlist();
  const [busy, setBusy] = useState(false);
  const saved = isSaved(productId);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
      title={saved ? 'Saved to wishlist' : 'Save to wishlist'}
      disabled={busy}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          await toggle(productId);
        } catch {
          // toggle already rolled the heart back
        } finally {
          setBusy(false);
        }
      }}
      className={`grid h-9 w-9 place-items-center rounded-full bg-surface/90 shadow-card backdrop-blur transition-transform hover:scale-105 disabled:opacity-60 ${className}`}
    >
      <Heart className={`h-[18px] w-[18px] transition-colors ${saved ? 'fill-sale text-sale' : 'text-fg'}`} />
    </button>
  );
}
