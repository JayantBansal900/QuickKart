import React, { useEffect, useRef, useState } from 'react';
import { Check, ImageOff, Minus, Plus, ShoppingBag, Star, Truck, X, Zap } from 'lucide-react';

import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/formatters';
import { originalPriceOf } from './ProductCard';
import { ProductReviews } from './ProductReviews';
import { api } from '../services/api';

interface ProductDetailsModalProps {
  product: Product | null;
  onClose: () => void;
  onDirectCheckout?: () => void;
  /** Opens another product (used by "You may also like"). */
  onSelectProduct?: (product: Product) => void;
}

export const ProductDetailsModal: React.FC<ProductDetailsModalProps> = ({ product, onClose, onDirectCheckout, onSelectProduct }) => {
  const [related, setRelated] = useState<Product[]>([]);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [imageFailed, setImageFailed] = useState(false);
  const [added, setAdded] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  const { addToCart, isLoading } = useCart();
  const { isAuthenticated, openAuthModal } = useAuth();

  useEffect(() => {
    if (product) {
      setQuantity(1);
      setImageFailed(false);
      setAdded(false);
      setMutationError(null);
    }
  }, [product?.id]);

  // Related products: best rated in the same category, excluding this one.
  useEffect(() => {
    setRelated([]);
    if (!product?.category) return;
    const controller = new AbortController();
    api.searchProducts({ category: product.category.toUpperCase(), sort: 'rating-desc', size: 5 }, controller.signal)
      .then((page) => setRelated(page.content.filter((p) => p.id !== product.id).slice(0, 4)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [product?.id, product?.category]);

  // Deep link from "Review" in My Orders: /products/42#reviews
  useEffect(() => {
    if (product && window.location.hash === '#reviews') {
      setTimeout(() => document.getElementById('reviews')?.scrollIntoView?.({ behavior: 'smooth' }), 150);
    }
  }, [product?.id]);

  // Escape closes; focus moves into the dialog and back to the page afterwards; page doesn't scroll behind.
  useEffect(() => {
    if (!product) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [product, onClose]);

  if (!product) return null;

  const isOutOfStock = product.stockQuantity <= 0;
  const price = Number(product.price) || 0;
  const discount = Math.round(Number(product.discountPercentage) || 0);
  const originalPrice = originalPriceOf(product);
  const rating = product.rating != null && !Number.isNaN(Number(product.rating)) ? Number(product.rating) : null;
  const reviews = product.reviewCount != null && Number(product.reviewCount) > 0 ? Number(product.reviewCount) : null;

  const add = async (): Promise<boolean> => {
    if (!isAuthenticated) {
      openAuthModal('login');
      return false;
    }
    setMutationError(null);
    try {
      await addToCart(product.id, quantity);
      return true;
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Unable to add item.');
      return false;
    }
  };

  const handleAddToCart = async () => {
    if (await add()) {
      setAdded(true);
      setTimeout(onClose, 500);
    }
  };
  const handleBuyNow = async () => {
    if (await add()) {
      onClose();
      onDirectCheckout?.();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-title"
        className="relative flex max-h-[92vh] w-full animate-rise flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl outline-none sm:max-w-4xl sm:animate-scale-in sm:rounded-2xl md:flex-row"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-surface/80 text-fg backdrop-blur transition-colors hover:bg-subtle"
          aria-label="Close product details"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Image */}
        <div className="relative aspect-square w-full shrink-0 bg-subtle md:aspect-auto md:w-1/2">
          {product.imageUrl && !imageFailed ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              onError={() => setImageFailed(true)}
              className={`h-full w-full object-cover dark:brightness-[0.88] ${isOutOfStock ? 'opacity-60 grayscale' : ''}`}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted"><ImageOff className="h-10 w-10" strokeWidth={1.5} /></div>
          )}
          {discount > 0 && !isOutOfStock && (
            <span className="absolute left-4 top-4 rounded-full bg-sale px-3 py-1 text-xs font-semibold text-white">−{discount}%</span>
          )}
        </div>

        {/* Details */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-6 sm:p-8">
            <p className="text-sm text-muted">
              {[product.brand, product.category].filter(Boolean).join(' · ')}
            </p>
            <h2 id="product-title" className="qk-display mt-1.5 pr-10 text-3xl text-fg sm:text-4xl">
              {product.name}
            </h2>

            {rating !== null && (
              <div className="mt-3 flex items-center gap-1.5 text-sm">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="font-medium text-fg">{rating.toFixed(1)}</span>
                {reviews !== null && <span className="text-muted">· {reviews} reviews</span>}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-semibold tracking-tight text-fg">{formatPrice(price)}</span>
              {originalPrice && !isOutOfStock && (
                <>
                  <span className="text-base text-muted line-through">{formatPrice(originalPrice)}</span>
                  <span className="text-sm font-semibold text-success">Save {formatPrice(originalPrice - price)}</span>
                </>
              )}
            </div>

            <div className="mt-5">
              {isOutOfStock ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-sale-soft px-3 py-1.5 text-sm font-medium text-sale">
                  <span className="h-1.5 w-1.5 rounded-full bg-sale" /> Out of stock
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-sm font-medium text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" />
                  {product.stockQuantity <= 5 ? `Only ${product.stockQuantity} left in stock` : 'In stock'}
                </span>
              )}
            </div>

            {product.description && (
              <div className="mt-6 border-t border-line pt-6">
                <h3 className="text-sm font-semibold text-fg">About this item</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{product.description}</p>
              </div>
            )}

            <div className="mt-6 flex items-center gap-3 rounded-xl bg-subtle p-4 text-sm">
              <Truck className="h-5 w-5 shrink-0 text-muted" />
              <span className="text-fg">Cash on delivery, UPI and cards accepted. Stock is confirmed again when you place the order.</span>
            </div>

            <ProductReviews productId={product.id} />

            {related.length > 0 && onSelectProduct && (
              <div className="mt-6 border-t border-line pt-6">
                <h3 className="text-sm font-semibold text-fg">You may also like</h3>
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {related.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => onSelectProduct(p)} className="group w-full text-left">
                        <div className="aspect-square overflow-hidden rounded-xl bg-subtle">
                          {p.imageUrl && <img src={p.thumbnailUrl || p.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />}
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-xs text-fg">{p.name}</p>
                        <p className="text-xs font-semibold text-fg">{formatPrice(Number(p.price))}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {product.sku && <p className="mt-4 text-xs text-muted">SKU: {product.sku}</p>}
            {mutationError && <p role="alert" className="mt-4 rounded-xl bg-sale-soft p-3 text-sm text-sale">{mutationError}</p>}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 border-t border-line p-4 sm:px-8 sm:py-5">
            {!isOutOfStock && (
              <div className="flex h-12 items-center rounded-full border border-line">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                  className="grid h-12 w-11 place-items-center rounded-l-full text-fg hover:bg-subtle disabled:opacity-30"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums text-fg" aria-live="polite">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(Math.min(product.stockQuantity, quantity + 1))}
                  disabled={quantity >= product.stockQuantity}
                  className="grid h-12 w-11 place-items-center rounded-r-full text-fg hover:bg-subtle disabled:opacity-30"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={isOutOfStock || isLoading}
              className="qk-btn qk-btn-primary h-12 flex-1"
            >
              {added ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
              {isOutOfStock ? 'Unavailable' : added ? 'Added to cart' : `Add to cart · ${formatPrice(price * quantity)}`}
            </button>
            {!isOutOfStock && onDirectCheckout && (
              <button type="button" onClick={handleBuyNow} disabled={isLoading} className="qk-btn qk-btn-ghost h-12">
                <Zap className="h-4 w-4" /> Buy now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
