import React, { useState } from 'react';
import { Check, ImageOff, Plus, Star } from 'lucide-react';

import { Product } from '../types';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/formatters';
import { WishlistButton } from './WishlistButton';
import { coloursOf } from './VariantPicker';

interface ProductCardProps {
  product: Product;
  onViewDetails: (product: Product) => void;
}

/** Returns the pre-discount price, or null when there is no real discount. */
export function originalPriceOf(product: Product): number | null {
  const discount = Number(product.discountPercentage) || 0;
  const price = Number(product.price) || 0;
  // Rounded to whole rupees: an MRP like ₹11,188.10 looks computed, not real.
  return discount > 0 && discount < 100 && price > 0 ? Math.round(price / (1 - discount / 100)) : null;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onViewDetails }) => {
  const { addToCart, isLoading } = useCart();
  const { isAuthenticated, openAuthModal } = useAuth();
  const [justAdded, setJustAdded] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const isOutOfStock = product.stockQuantity <= 0;
  const lowStock = !isOutOfStock && product.stockQuantity <= 5;
  const discount = Math.round(Number(product.discountPercentage) || 0);
  const originalPrice = originalPriceOf(product);
  // Only show a rating the product actually has — never invent one.
  const rating = product.rating != null && !Number.isNaN(Number(product.rating)) ? Number(product.rating) : null;
  const reviews = product.reviewCount != null && Number(product.reviewCount) > 0 ? Number(product.reviewCount) : null;
  const image = product.thumbnailUrl || product.imageUrl;
  const variants = product.variants ?? [];
  const hasSizes = variants.length > 0;
  const colourCount = coloursOf(variants).length;

  const handleAddToCart = async (event: React.MouseEvent) => {
    event.stopPropagation();
    // A size has to be chosen first: the details dialog has the size picker.
    if (hasSizes) {
      onViewDetails(product);
      return;
    }
    if (!isAuthenticated) {
      openAuthModal('login');
      return;
    }
    setMutationError(null);
    try {
      await addToCart(product.id, 1);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Unable to add item.');
      return;
    }
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  return (
    <article
      onClick={() => onViewDetails(product)}
      className="group relative flex h-full cursor-pointer flex-col"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-subtle">
        {image && !imageFailed ? (
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className={`h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] dark:brightness-[0.9] ${
              isOutOfStock ? 'opacity-50 grayscale' : ''
            }`}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted">
            <ImageOff className="h-8 w-8" strokeWidth={1.5} />
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {discount > 0 && !isOutOfStock && (
            <span className="rounded bg-sale px-2 py-0.5 text-[11px] font-bold text-white">−{discount}%</span>
          )}
          {isOutOfStock && (
            <span className="rounded bg-fg px-2 py-0.5 text-[11px] font-bold text-bg">Sold out</span>
          )}
        </div>

        <WishlistButton productId={product.id} productName={product.name} className="absolute right-3 top-3" />

        {!isOutOfStock && (
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isLoading}
            aria-label={hasSizes ? `Choose a size for ${product.name}` : `Add ${product.name} to cart`}
            className={`absolute inset-x-3 bottom-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-3.5 text-sm font-semibold shadow-card transition-all duration-200 disabled:opacity-60 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:focus-visible:translate-y-0 md:focus-visible:opacity-100 ${
              justAdded ? 'bg-success text-white md:translate-y-0 md:opacity-100' : 'bg-fg text-bg hover:opacity-90'
            }`}
          >
            {justAdded ? <><Check className="h-4 w-4" strokeWidth={3} /> Added</> : <><Plus className="h-4 w-4" /> {hasSizes ? 'Choose size' : 'Add'}</>}
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col pt-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span className="truncate text-[11px] font-medium uppercase tracking-[0.08em]">{product.brand || product.category || ' '}</span>
          {rating !== null && (
            <span className="flex shrink-0 items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-medium text-fg">{rating.toFixed(1)}</span>
              {reviews !== null && <span title={`${reviews} ratings`}>({reviews.toLocaleString('en-IN')})</span>}
            </span>
          )}
        </div>

        <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-fg group-hover:underline group-hover:underline-offset-2">{product.name}</h3>

        {hasSizes && colourCount > 1 && <p className="mt-1 text-xs text-muted">{colourCount} {colourCount === 1 ? 'colour' : 'colours'}</p>}

        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1.5">
          <span className="text-[15px] font-semibold tracking-tight text-fg">{formatPrice(product.price)}</span>
          {originalPrice && !isOutOfStock && (
            <>
              <span className="text-xs text-muted line-through">{formatPrice(originalPrice)}</span>
              <span className="text-xs font-semibold text-sale">{discount}% off</span>
            </>
          )}
        </div>
        {lowStock && <p className="mt-1 text-xs font-medium text-sale">Only {product.stockQuantity} left</p>}
        {mutationError && (
          <p role="alert" className="mt-1 text-xs text-sale">{mutationError}</p>
        )}
      </div>
    </article>
  );
};
