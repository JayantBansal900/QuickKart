import { Link, useLocation } from 'react-router-dom';
import { AccountNav } from '../components/AccountNav';
import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Clock, FileText, Package, RefreshCw, RotateCcw, Star, Truck, XCircle } from 'lucide-react';
import { ReturnDialog } from '../components/ReturnDialog';
import { useConfirm } from '../components/ConfirmDialog';
import { PaymentPanel } from '../components/PaymentPanel';
import { api } from '../services/api';
import { OrderResponse } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatINR, variantLabel } from '../utils/formatters';

const STEPS: OrderResponse['status'][] = ['PLACED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const STEP_LABEL: Record<string, string> = {
  PENDING: 'Awaiting payment', RETURNED: 'Returned', PLACED: 'Placed', CONFIRMED: 'Confirmed', PROCESSING: 'Packed', SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};
const PAYMENT_LABEL: Record<string, string> = {
  COLLECTION_PENDING: 'Pay on delivery', COLLECTED: 'Paid', PAID: 'Paid', PENDING: 'Not paid yet', FAILED: 'Payment failed',
  REFUNDED: 'Refunded', CANCELLED: 'Not charged', MANUAL_REVIEW_REQUIRED: 'Under review',
};
const METHOD_LABEL: Record<string, string> = { COD: 'Cash on delivery', UPI: 'UPI', CARD: 'Card' };

function formatDate(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Horizontal progress tracker for an order's fulfilment status. */
function StatusTracker({ status }: { status: OrderResponse['status'] }) {
  if (status === 'PENDING') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
        <Clock className="h-4 w-4" /> Waiting for payment. Unpaid orders are cancelled after 30 minutes.
      </div>
    );
  }
  if (status === 'RETURNED') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-subtle px-4 py-3 text-sm font-medium text-fg">
        <CheckCircle2 className="h-4 w-4 text-success" /> Returned and refunded
      </div>
    );
  }
  if (status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-sale-soft px-4 py-3 text-sm font-medium text-sale">
        <XCircle className="h-4 w-4" /> This order was cancelled
      </div>
    );
  }
  const current = Math.max(0, STEPS.indexOf(status));
  return (
    <ol className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6" aria-label={`Order status: ${STEP_LABEL[status] ?? status}`}>
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
  const [paying, setPaying] = useState<OrderResponse | null>(null);
  const [returning, setReturning] = useState<OrderResponse | null>(null);
  const [confirmDialog, confirm] = useConfirm();

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
    const ok = await confirm({
      title: `Cancel order #${order.id}?`,
      message: order.paymentStatus === 'PAID' ? `Your payment of ${formatINR(order.totalAmount)} will be refunded.` : 'The items go back on sale. This can’t be undone.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      danger: true,
    });
    if (!ok) return;
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
        <span className="grid h-14 w-14 place-items-center rounded-xl bg-subtle text-muted"><Package className="h-6 w-6" /></span>
        <h1 className="mt-5 text-xl font-semibold text-fg">Sign in to view your orders</h1>
        <button type="button" onClick={() => openAuthModal('login')} className="qk-btn qk-btn-primary mt-6">Sign in</button>
      </div>
    );
  }

  const state = location.state as { confirmedOrderId?: number; paymentMethod?: string; paid?: boolean } | null;
  const confirmedId = state?.confirmedOrderId;
  const confirmedOrder = orders.find((o) => o.id === confirmedId);
  const confirmation = !confirmedOrder
    ? `Order #${confirmedId} created.`
    : confirmedOrder.paymentMethod === 'COD'
      ? `Order #${confirmedId} placed. You’ll pay in cash when it’s delivered.`
      : confirmedOrder.paymentStatus === 'PAID'
        ? `Payment received. Order #${confirmedId} is placed.`
        : `Order #${confirmedId} is waiting for payment. Use “Pay now” below.`;

  return (
    <div className="qk-container max-w-4xl py-10">
      <AccountNav />
      {confirmDialog}
      {returning && (
        <ReturnDialog
          order={returning}
          onClose={() => setReturning(null)}
          onDone={() => { setReturning(null); void fetchOrders(); }}
        />
      )}
      {paying && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPaying(null)} aria-hidden="true" />
          <section role="dialog" aria-modal="true" aria-labelledby="pay-title" className="relative w-full rounded-t-[28px] bg-surface p-6 shadow-2xl sm:max-w-md sm:rounded-2xl">
            <h2 id="pay-title" className="qk-display mb-4 text-3xl text-fg">Complete payment</h2>
            <PaymentPanel
              order={paying}
              onPaid={() => { setPaying(null); void fetchOrders(); }}
              onLater={() => { setPaying(null); void fetchOrders(); }}
            />
          </section>
        </div>
      )}
      {confirmedId && (
        <div role="status" className="mb-8 flex items-center gap-3 rounded-xl border border-success/30 bg-success-soft p-4 text-sm text-fg animate-rise">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <span>{confirmation}</span>
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
        <div role="alert" className="mt-6 flex items-center gap-2 rounded-xl bg-sale-soft p-4 text-sm text-sale">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="mt-8 space-y-5">
        {isLoading && orders.length === 0 ? (
          [1, 2].map((n) => <div key={n} className="h-48 animate-pulse rounded-xl bg-subtle" />)
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-20 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-xl bg-subtle text-muted"><Package className="h-6 w-6" /></span>
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
                    {METHOD_LABEL[order.paymentMethod ?? ''] ?? order.paymentMethod ?? 'Payment'} ·{' '}
                    {PAYMENT_LABEL[order.paymentStatus ?? ''] ?? order.paymentStatus ?? 'Unknown'}
                  </p>
                </div>
              </header>

              <div className="space-y-6 px-6 py-5">
                <StatusTracker status={order.status} />
                {order.trackingNumber && (
                  <p className="flex flex-wrap items-center gap-x-2 text-sm text-fg">
                    <Truck className="h-4 w-4 text-muted" />
                    Shipped with <span className="font-semibold">{order.courier}</span> · tracking
                    <span className="rounded bg-subtle px-1.5 py-0.5 font-mono text-xs">{order.trackingNumber}</span>
                  </p>
                )}
                {order.returnStatus && (
                  <p className={`rounded-lg px-3 py-2 text-sm ${order.returnStatus === 'REJECTED' ? 'bg-sale-soft text-sale' : 'bg-subtle text-fg'}`}>
                    {order.returnStatus === 'REQUESTED' && 'Return requested. We will review it within 2 business days.'}
                    {order.returnStatus === 'APPROVED' && 'Return approved. Your refund has been issued.'}
                    {order.returnStatus === 'REJECTED' && 'Your return request was not approved. Contact support if you have questions.'}
                  </p>
                )}

                <ul className="divide-y divide-line">
                  {order.items?.map((item) => (
                    <li key={`${item.productId}-${item.size ?? ''}-${item.color ?? ''}`} className="flex items-center justify-between gap-4 py-3 text-sm">
                      <span className="min-w-0 text-fg">
                        <span className="text-muted">{item.quantity} ×</span> {item.productName}{variantLabel(item) && <span className="text-muted"> · {variantLabel(item)}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {order.status === 'DELIVERED' && (
                          <Link to={`/products/${item.productId}#reviews`} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                            <Star className="h-3.5 w-3.5" /> Review
                          </Link>
                        )}
                        <span className="text-fg">{formatINR(item.subtotal)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {Number(order.discountAmount) > 0 && (
                  <p className="flex justify-between text-sm text-success">
                    <span>Coupon {order.couponCode}</span>
                    <span>−{formatINR(order.discountAmount)}</span>
                  </p>
                )}

                {(order.deliveryAddress || order.cancellable || order.payable || order.returnable) && (
                  <div className="flex flex-col gap-4 rounded-xl bg-subtle p-4 sm:flex-row sm:items-center sm:justify-between">
                    {order.deliveryAddress && (
                      <div className="text-sm">
                        <p className="font-medium text-fg">Delivering to {order.recipientName}</p>
                        <p className="mt-0.5 text-muted">{order.deliveryAddress} · {order.deliveryPhone}</p>
                      </div>
                    )}
                    <div className="flex shrink-0 flex-wrap gap-2">
                    {order.status !== 'PENDING' && order.status !== 'CANCELLED' && (
                      <Link to={`/account/orders/${order.id}/invoice`} className="qk-btn qk-btn-ghost h-10 px-4">
                        <FileText className="h-4 w-4" /> Invoice
                      </Link>
                    )}
                    {order.returnable && (
                      <button type="button" className="qk-btn qk-btn-ghost h-10 px-4" onClick={() => setReturning(order)}>
                        <RotateCcw className="h-4 w-4" /> Return
                      </button>
                    )}
                    {order.payable && (
                      <button type="button" className="qk-btn qk-btn-primary h-10 px-4" onClick={() => setPaying(order)}>
                        Pay now
                      </button>
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
