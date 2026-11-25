import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '../services/api';
import { OrderResponse } from '../types';
import { formatINR, variantLabel } from '../utils/formatters';
import { LogoMark } from '../components/Header';

/** GST rate used to show the tax included in the prices (demo: one rate for every item). */
const GST_RATE = 0.18;

/**
 * Printable tax invoice for an order. Prices at VAYU include GST, so the invoice shows the
 * taxable value and the CGST/SGST split that is already inside each amount.
 */
export function InvoicePage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = `Invoice VY-${orderId} · VAYU`;
    api.getOrderById(Number(orderId)).then(setOrder).catch((e) => setError(e instanceof Error ? e.message : 'Invoice not found.'));
    return () => { document.title = previous; };
  }, [orderId]);

  if (error) return <p role="alert" className="qk-container py-16 text-sm text-sale">{error}</p>;
  if (!order) return <p role="status" className="qk-container py-16 text-sm text-muted">Loading invoice…</p>;

  const total = Number(order.totalAmount);
  const taxable = total / (1 + GST_RATE);
  const gst = total - taxable;
  const date = new Date(order.createdAt ?? order.orderDate ?? Date.now());

  return (
    <div className="qk-container max-w-3xl py-8 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link to="/account/orders" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
        <button type="button" onClick={() => window.print()} className="qk-btn qk-btn-primary h-10 px-4 text-sm">
          <Printer className="h-4 w-4" /> Print / save as PDF
        </button>
      </div>

      <article className="rounded-xl border border-line bg-surface p-8 text-sm text-fg print:border-0 print:p-0" aria-label={`Invoice for order ${order.id}`}>
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div className="flex items-center gap-3">
            <LogoMark className="h-10 w-10" />
            <div>
              <p className="font-display text-lg font-semibold tracking-[0.28em]">VAYU</p>
              <p className="text-xs text-muted">Men’s clothing · GSTIN 29ABCDE1234F1Z5 (sample)</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold tracking-tight">Tax invoice</h1>
            <p className="text-muted">Invoice no. VY-{String(order.id).padStart(6, '0')}</p>
            <p className="text-muted">Date {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
        </header>

        <section className="grid gap-6 border-b border-line py-6 sm:grid-cols-2">
          <div>
            <h2 className="qk-eyebrow">Billed and shipped to</h2>
            <p className="mt-1.5 font-medium">{order.recipientName}</p>
            <p className="text-muted">{order.deliveryAddress}</p>
            <p className="text-muted">{order.deliveryPhone}</p>
          </div>
          <div className="sm:text-right">
            <h2 className="qk-eyebrow">Order</h2>
            <p className="mt-1.5">#{order.id} · {order.status.replace(/_/g, ' ').toLowerCase()}</p>
            <p className="text-muted">Payment: {order.paymentMethod === 'COD' ? 'Cash on delivery' : order.paymentMethod} ({(order.paymentStatus ?? '').replace(/_/g, ' ').toLowerCase()})</p>
            {order.trackingNumber && <p className="text-muted">{order.courier} · {order.trackingNumber}</p>}
          </div>
        </section>

        <table className="mt-6 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-xs uppercase text-muted">
              <th className="py-2 font-semibold">Item</th>
              <th className="whitespace-nowrap py-2 pl-4 text-right font-semibold">Qty</th>
              <th className="whitespace-nowrap py-2 pl-4 text-right font-semibold">Unit price</th>
              <th className="whitespace-nowrap py-2 pl-4 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={`${item.productId}-${item.size ?? ''}-${item.color ?? ''}`} className="border-b border-line/70">
                <td className="py-2.5 pr-4">{item.productName}{variantLabel(item) && <span className="text-muted"> ({variantLabel(item)})</span>}</td>
                <td className="whitespace-nowrap py-2.5 pl-4 text-right tabular-nums">{item.quantity}</td>
                <td className="whitespace-nowrap py-2.5 pl-4 text-right tabular-nums">{formatINR(item.price)}</td>
                <td className="whitespace-nowrap py-2.5 pl-4 text-right tabular-nums">{formatINR(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-6 w-full max-w-xs space-y-1.5 tabular-nums">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{formatINR(order.subtotalAmount ?? total)}</dd></div>
          {Number(order.discountAmount) > 0 && (
            <div className="flex justify-between text-success"><dt>Coupon {order.couponCode}</dt><dd>−{formatINR(order.discountAmount)}</dd></div>
          )}
          <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd>Free</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd>{formatINR(total)}</dd></div>
          <div className="flex justify-between text-xs text-muted"><dt>Taxable value</dt><dd>{formatINR(taxable)}</dd></div>
          <div className="flex justify-between text-xs text-muted"><dt>CGST 9% (included)</dt><dd>{formatINR(gst / 2)}</dd></div>
          <div className="flex justify-between text-xs text-muted"><dt>SGST 9% (included)</dt><dd>{formatINR(gst / 2)}</dd></div>
        </dl>

        <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
          VAYU is a portfolio demo: this invoice is generated for illustration and is not a legal tax document.
        </footer>
      </article>
    </div>
  );
}
