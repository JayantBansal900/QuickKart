import { useLocation, useNavigate } from 'react-router-dom';
import React, { useEffect } from 'react';
import { ArrowRight, ImageOff, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { CartItemResponse } from '../types';
import { formatINR, variantLabel } from '../utils/formatters';

interface CartDrawerProps {
  onProceedToCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onProceedToCheckout }) => {
  const {
    cart, isCartDrawerOpen, closeCartDrawer: closeDrawer, updateQuantity, removeItem, clearCart,
    isLoading, error, needsRefresh, fetchCart,
  } = useCart();
  const location = useLocation();
  const navigate = useNavigate();
  const closeCartDrawer = () => {
    closeDrawer();
    if (location.pathname === '/cart') navigate('/');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isCartDrawerOpen) closeCartDrawer();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCartDrawerOpen, closeCartDrawer]);

  if (!isCartDrawerOpen) return null;

  const items = cart?.items || [];
  const totalAmount = cart?.totalAmount || 0;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const disabled = isLoading || needsRefresh;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-black/50 backdrop-blur-sm" onClick={closeCartDrawer} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-md animate-slide-in-right flex-col bg-surface shadow-2xl"
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <h2 id="cart-title" className="text-base font-semibold text-fg">
            Your cart <span className="font-normal text-muted">({itemCount})</span>
          </h2>
          <button
            type="button"
            onClick={closeCartDrawer}
            className="grid h-10 w-10 place-items-center rounded-full text-fg hover:bg-subtle"
            aria-label="Close cart drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="m-4 rounded-xl bg-sale-soft p-4 text-sm text-sale">
            <p>{error}</p>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void fetchCart().catch(() => {})}
              className="mt-2 font-semibold underline"
            >
              Refresh cart
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center">
              <span className="grid h-16 w-16 place-items-center rounded-xl bg-subtle text-muted">
                <ShoppingBag className="h-7 w-7" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-fg">Your cart is empty</h3>
              <p className="mt-1.5 max-w-xs text-sm text-muted">Browse the store and add something you like.</p>
              <button type="button" onClick={closeCartDrawer} className="qk-btn qk-btn-primary mt-6">Start shopping</button>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((item: CartItemResponse) => (
                <li key={`${item.productId}-${item.variantId ?? 0}`} className="flex gap-4 py-5">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-subtle">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.productName}
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-muted"><ImageOff className="h-5 w-5" /></div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="line-clamp-2 text-sm font-medium text-fg">{item.productName}</h3>
                      {variantLabel(item) && <p className="mt-0.5 text-xs text-muted">{variantLabel(item)}</p>}
                      <span className="shrink-0 text-sm font-semibold text-fg">{formatINR(item.subtotal)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{formatINR(item.price || item.subtotal / item.quantity)} each</p>

                    {item.availableQuantity != null && item.quantity > item.availableQuantity && (
                      <p role="alert" className="mt-1 text-xs text-sale">
                        Only {item.availableQuantity} available. Reduce the quantity before checkout.
                      </p>
                    )}

                    <div className="mt-auto flex items-center justify-between pt-3">
                      <div className="flex h-9 items-center rounded-full border border-line">
                        <button
                          type="button"
                          aria-label={`Decrease quantity for ${item.productName}${variantLabel(item) ? ` (${variantLabel(item)})` : ''}`}
                          onClick={() => void updateQuantity(item.productId, item.quantity - 1, item.variantId).catch(() => {})}
                          className="grid h-9 w-9 place-items-center rounded-l-full text-fg hover:bg-subtle disabled:opacity-40"
                          disabled={disabled}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-7 text-center text-sm font-medium tabular-nums text-fg">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Increase quantity for ${item.productName}${variantLabel(item) ? ` (${variantLabel(item)})` : ''}`}
                          onClick={() => void updateQuantity(item.productId, item.quantity + 1, item.variantId).catch(() => {})}
                          className="grid h-9 w-9 place-items-center rounded-r-full text-fg hover:bg-subtle disabled:opacity-40"
                          disabled={disabled}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeItem(item.productId, item.variantId).catch(() => {})}
                        className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted hover:bg-subtle hover:text-sale disabled:opacity-40"
                        aria-label={`Remove ${item.productName}${variantLabel(item) ? ` (${variantLabel(item)})` : ''}`}
                        disabled={disabled}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="space-y-4 border-t border-line p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between text-muted">
                <dt>Subtotal</dt>
                <dd className="text-fg">{formatINR(totalAmount)}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>Delivery</dt>
                <dd className="text-fg">No extra charge</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-3 text-base font-semibold text-fg">
                <dt>Total</dt>
                <dd>{formatINR(totalAmount)}</dd>
              </div>
            </dl>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                closeCartDrawer();
                if (!disabled) onProceedToCheckout();
              }}
              className="qk-btn qk-btn-primary h-12 w-full"
            >
              Checkout <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void clearCart().catch(() => {})}
              className="w-full text-center text-xs font-medium text-muted hover:text-fg"
            >
              Clear cart
            </button>
          </div>
        )}
      </aside>
    </div>
  );
};
