import { useLocation } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Package, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../services/api';
import { OrderResponse } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../utils/formatters';

const STEPS: OrderResponse['status'][] = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];
const STEP_LABEL: Record<string, string> = {
  PENDING: 'Pending', CONFIRMED: 'Confirmed', PROCESSING: 'Processing', SHIPPED: 'Shipped', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};
const PAYMENT_LABEL: Record<string, string> = {
  COLLECTION_PENDING: 'Pay on delivery', COLLECTED: 'Paid', CANCELLED: 'Not charged', MANUAL_REVIEW_REQUIRED: 'Under review',
};

function formatDate(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Horizontal progress tracker for an order's fulfilment status. */
function StatusTracker({ status }: { status: OrderResponse['status'] }) {
  if (status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-sale-soft px-4 py-3 text-sm font-medium text-sale">
        <XCircle className="h-4 w-4" /> This order was cancelled
      </div>
    );
  }
  const current = Math.max(0, STEPS.indexOf(status));
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label={`Order status: ${STEP_LABEL[status] ?? status}`}>
      {STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step} className="flex flex-col gap-2">
            <span className={`h-1.5 rounded-full ${done ? 'bg-fg' : 'bg-line'}`} />
            <span className={`text-xs ${i === current ? 'font-semibold text-fg' : done ? 'text-fg' : 'text-muted'}`}>
              {STEP_LABEL[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export const OrdersPage: React.FC<{ onNavigateToStore: () => void }> = ({ onNavigateToStore }) => {
  const location = useLocation();
  const { isAuthenticated, openAuthModal } = useAuth();
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const fetchOrders = async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      setOrders(await api.getMyOrders());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch order history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) void fetchOrders();
    else setIsLoading(false);
  }, [isAuthenticated]);

  const cancel = async (order: OrderResponse) => {
    if (!window.confirm(`Cancel order #${order.id}?`)) return;
    setCancellingId(order.id);
    setError(null);
    try {
      await api.cancelOrder(order.id);
      await fetchOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancellation failed');
    } finally {
      setCancellingId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="qk-container flex flex-col items-center py-24 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-subtle text-muted"><Package className="h-6 w-6" /></span>
        <h1 className="mt-5 text-xl font-semibold text-fg">Sign in to view your orders</h1>
        <button type="button" onClick={() => openAuthModal('login')} className="qk-btn qk-btn-primary mt-6">Sign in</button>
      </div>
    );
  }

  const confirmedId = (location.state as { confirmedOrderId?: number } | null)?.confirmedOrderId;

  return (
    <div className="qk-container max-w-4xl py-10">
      {confirmedId && (
        <div role="status" className="mb-8 flex items-center gap-3 rounded-2xl border border-success/30 bg-success-soft p-4 text-sm text-fg animate-rise">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <span>Order #{confirmedId} created. You’ll pay in cash when it’s delivered.</span>
        </div>
      )}

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="qk-display text-5xl text-fg">Your orders</h1>
          <p className="mt-1 text-sm text-muted">Track deliveries and review past purchases.</p>
        </div>
        <button type="button" onClick={() => void fetchOrders()} className="qk-btn qk-btn-ghost h-10 px-4">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-6 flex items-center gap-2 rounded-2xl bg-sale-soft p-4 text-sm text-sale">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="mt-8 space-y-5">
        {isLoading && orders.length === 0 ? (
          [1, 2].map((n) => <div key={n} className="h-48 animate-pulse rounded-3xl bg-subtle" />)
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-20 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-subtle text-muted"><Package className="h-6 w-6" /></span>
            <h2 className="mt-5 text-lg font-semibold text-fg">No orders yet</h2>
            <p className="mt-1.5 max-w-sm text-sm text-muted">When you place an order, it will show up here.</p>
            <button type="button" onClick={onNavigateToStore} className="qk-btn qk-btn-primary mt-6">
              Start shopping <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          orders.map((order) => (
            <article key={order.id} className="qk-card overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
                <div>
                  <h2 className="font-semibold text-fg">Order #{order.id}</h2>
                  <p className="text-xs text-muted">
                    {[formatDate(order.createdAt ?? order.orderDate), `${order.items?.length ?? 0} item${order.items?.length === 1 ? '' : 's'}`]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-fg">{formatINR(order.totalAmount)}</p>
                  <p className="text-xs text-muted">
                    {order.paymentMethod === 'COD' ? 'Cash on delivery' : order.paymentMethod || 'Payment'} ·{' '}
                    {PAYMENT_LABEL[order.paymentStatus ?? ''] ?? order.paymentStatus ?? 'Unknown'}
                  </p>
                </div>
              </header>

              <div className="space-y-6 px-6 py-5">
                <StatusTracker status={order.status} />

                <ul className="divide-y divide-line">
                  {order.items?.map((item) => (
                    <li key={item.productId} className="flex items-center justify-between gap-4 py-3 text-sm">
                      <span className="min-w-0 text-fg">
                        <span className="text-muted">{item.quantity} ×</span> {item.productName}
                      </span>
                      <span className="shrink-0 text-fg">{formatINR(item.subtotal)}</span>
                    </li>
                  ))}
                </ul>

                {(order.deliveryAddress || order.cancellable) && (
                  <div className="flex flex-col gap-4 rounded-2xl bg-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
                    {order.deliveryAddress && (
                      <div className="text-sm">
                        <p className="font-medium text-fg">Delivering to {order.recipientName}</p>
                        <p className="mt-0.5 text-muted">{order.deliveryAddress} · {order.deliveryPhone}</p>
                      </div>
                    )}
                    {order.cancellable && (
                      <button
                        type="button"
                        className="qk-btn qk-btn-ghost h-10 shrink-0 px-4 text-sale"
                        disabled={cancellingId !== null}
                        onClick={() => void cancel(order)}
                      >
                        {cancellingId === order.id ? 'Cancelling…' : 'Cancel order'}
                      </button>
                    )}
                  </div>
                )}
                {order.cancelledAt && (
                  <p className="text-xs text-muted">Cancelled on {new Date(order.cancelledAt).toLocaleString('en-IN')}</p>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};
