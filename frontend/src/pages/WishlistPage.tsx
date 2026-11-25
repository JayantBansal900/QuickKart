import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Heart } from 'lucide-react';
import { api } from '../services/api';
import { Product } from '../types';
import { ProductCard } from '../components/ProductCard';
import { useWishlist } from '../context/WishlistContext';
import { AccountNav } from '../components/AccountNav';

/** Products the customer saved for later. Removing the heart takes them off this list. */
export function WishlistPage() {
  const navigate = useNavigate();
  const { ids } = useWishlist();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Wishlist · VAYU';
    api.getWishlist().then(setProducts).catch((e) => setError(e instanceof Error ? e.message : 'Could not load your wishlist.'));
    return () => { document.title = previous; };
  }, []);

  // Hide items as soon as their heart is cleared, without another request.
  const visible = (products ?? []).filter((p) => ids.has(p.id));

  return (
    <div className="qk-container py-10">
      <AccountNav />
      <p className="qk-eyebrow">Your account</p>
      <h1 className="mt-1 text-4xl font-bold tracking-tight text-fg">Wishlist</h1>
      <p className="mt-1 text-sm text-muted">{products ? `${visible.length} saved ${visible.length === 1 ? 'item' : 'items'}` : 'Loading…'}</p>
      {error && <p role="alert" className="mt-6 rounded-lg bg-sale-soft p-3 text-sm text-sale">{error}</p>}

      {products && visible.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-20 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-subtle"><Heart className="h-6 w-6 text-muted" /></span>
          <h2 className="mt-5 text-lg font-semibold text-fg">Nothing saved yet</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted">Tap the heart on any product to keep it here for later.</p>
          <button type="button" onClick={() => navigate('/')} className="qk-btn qk-btn-primary mt-6">
            Browse products <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4 md:gap-x-6">
          {visible.map((p) => (
            <ProductCard key={p.id} product={p} onViewDetails={(product) => navigate(`/products/${product.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
