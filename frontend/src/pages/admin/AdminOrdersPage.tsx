import React, { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../../services/api";
import { OrderResponse, OrderStatus, PageResponse } from "../../types";
import { formatINR, variantLabel } from "../../utils/formatters";
import { useConfirm } from "../../components/ConfirmDialog";
import {
  AdminPageHeader,
  ErrorBanner,
  LoadingRow,
  PAGE_SIZE,
  Pager,
  StatusBadge,
  TableShell,
  errorMessage,
  formatDateTime,
  tdClass,
  thClass,
  useDebounced,
} from "../../components/admin/AdminUi";

/**
 * Mirrors the server-side state machine in order-service; the server still validates every transition.
 * PENDING -> PLACED only happens when an online payment succeeds, so admins can't skip it.
 */
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [],
  PLACED: ["CONFIRMED"],
  CONFIRMED: ["PROCESSING"],
  PROCESSING: ["SHIPPED"],
  SHIPPED: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
};

/** Button text for moving an order to the next step. */
const ACTION: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "Confirm order",
  PROCESSING: "Start packing",
  SHIPPED: "Ship…",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Mark delivered",
};

/** The delivery journey shown in the order details. */
const JOURNEY: OrderStatus[] = ["PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];

const COURIERS = ["Delhivery", "Blue Dart", "Ekart", "DTDC", "India Post", "Xpressbees"];

const ALL_STATUSES: OrderStatus[] = ["PENDING", "PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED"];

const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function AdminOrdersPage() {
  const [result, setResult] = useState<PageResponse<OrderResponse> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus>("ALL");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [dispatching, setDispatching] = useState<OrderResponse | null>(null);
  const [confirmDialog, confirm] = useConfirm();
  const q = useDebounced(query.trim());

  useEffect(() => setPage(0), [q, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.getAdminOrders({ q, status: statusFilter === "ALL" ? undefined : statusFilter, page, size: PAGE_SIZE }));
    } catch (err) {
      setError(errorMessage(err, "Failed to load orders."));
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const orders = result?.content ?? [];

  const changeStatus = async (order: OrderResponse, next: OrderStatus, dispatch?: { courier: string; trackingNumber: string }) => {
    if (next === "SHIPPED" && !dispatch) {
      setDispatching(order); // courier + tracking number first
      return;
    }
    if (
      next === "CANCELLED" &&
      !(await confirm({
        title: `Cancel order #${order.id}?`,
        message: order.paymentStatus === "PAID"
          ? "Stock goes back to inventory and the online payment is refunded."
          : "Stock goes back to inventory. The customer is emailed.",
        confirmLabel: "Cancel order",
        cancelLabel: "Keep order",
        danger: true,
      }))
    ) return;
    setUpdatingId(order.id);
    setError(null);
    try {
      const updated = await api.updateOrderStatus(order.id, { status: next, ...dispatch });
      setResult((r) => r && { ...r, content: r.content.map((o) => (o.id === updated.id ? updated : o)) });
    } catch (err) {
      setError(errorMessage(err, "Failed to update order status."));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <>
      {confirmDialog}
      {dispatching && (
        <DispatchDialog
          order={dispatching}
          onClose={() => setDispatching(null)}
          onDispatch={async (details) => {
            const order = dispatching;
            setDispatching(null);
            await changeStatus(order, "SHIPPED", details);
          }}
        />
      )}
      <AdminPageHeader
        title="Orders"
        subtitle={result ? `${result.totalElements} ${statusFilter === "ALL" && !q ? "orders in total" : "matching orders"}` : "Loading…"}
        onRefresh={load}
        refreshing={loading}
      />
      <ErrorBanner message={error} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search orders</span>
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by order #, customer email or recipient"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "ALL" | OrderStatus)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        >
          <option value="ALL">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
      </div>

      <TableShell>
        <thead>
          <tr>
            <th className={thClass}>Order</th>
            <th className={thClass}>Customer</th>
            <th className={thClass}>Total</th>
            <th className={thClass}>Payment</th>
            <th className={thClass}>Status</th>
            <th className={`${thClass} text-right`}>Action</th>
          </tr>
        </thead>
        <tbody>
          {loading && orders.length === 0 ? (
            <LoadingRow colSpan={6} />
          ) : orders.length === 0 ? (
            <LoadingRow colSpan={6} text="No orders match your filters." />
          ) : (
            orders.map((o) => {
              const nextOptions = [...NEXT_STATUS[o.status], ...(o.cancellable ? (["CANCELLED"] as OrderStatus[]) : [])];
              const isOpen = expanded === o.id;
              return (
                <React.Fragment key={o.id}>
                  <tr className="hover:bg-subtle">
                    <td className={tdClass}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : o.id)}
                        className="text-left font-semibold underline-offset-2 hover:underline"
                      >
                        #{o.id}
                      </button>
                      <p className="text-xs text-muted">{formatDateTime(o.createdAt ?? o.orderDate)}</p>
                    </td>
                    <td className={tdClass}>{o.userEmail ?? `User #${o.userId}`}</td>
                    <td className={`${tdClass} font-semibold tabular-nums`}>{formatINR(o.totalAmount)}</td>
                    <td className={tdClass}>
                      <p className="text-xs text-muted">{o.paymentMethod ?? "—"}</p>
                      <StatusBadge value={o.paymentStatus} />
                    </td>
                    <td className={tdClass}><StatusBadge value={o.status} /></td>
                    <td className={`${tdClass} text-right`}>
                      {nextOptions.length === 0 ? (
                        <span className="text-xs text-muted">{o.status === "PENDING" ? "Awaiting payment" : "Final"}</span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          {NEXT_STATUS[o.status].map((s) => (
                            <button
                              key={s}
                              type="button"
                              aria-label={`${ACTION[s] ?? label(s)} for order ${o.id}`}
                              disabled={updatingId === o.id}
                              onClick={() => void changeStatus(o, s)}
                              className="rounded-md bg-fg px-3 py-1.5 text-xs font-semibold text-bg hover:opacity-90 disabled:opacity-40"
                            >
                              {ACTION[s] ?? label(s)}
                            </button>
                          ))}
                          {o.cancellable && (
                            <button
                              type="button"
                              aria-label={`Cancel order ${o.id}`}
                              disabled={updatingId === o.id}
                              onClick={() => void changeStatus(o, "CANCELLED")}
                              className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-sale hover:bg-sale-soft disabled:opacity-40"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-subtle">
                      <td colSpan={6} className="px-4 py-4 text-sm">
                        {JOURNEY.includes(o.status) && (
                          <ol className="mb-4 flex flex-wrap items-center gap-1 text-xs" aria-label={`Progress of order ${o.id}`}>
                            {JOURNEY.map((step, i) => {
                              const done = JOURNEY.indexOf(o.status) >= i;
                              return (
                                <li key={step} className={`rounded-full px-2.5 py-1 ${done ? "bg-fg text-bg" : "bg-surface text-muted"}`} aria-current={o.status === step ? "step" : undefined}>
                                  {label(step)}
                                </li>
                              );
                            })}
                          </ol>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <h3 className="mb-1 text-xs font-semibold uppercase text-muted">Items</h3>
                            <ul className="space-y-1">
                              {o.items.map((item) => (
                                <li key={`${item.productId}-${item.size ?? ''}-${item.color ?? ''}`} className="flex justify-between gap-3">
                                  <span>{item.quantity} × {item.productName}{variantLabel(item) ? ` (${variantLabel(item)})` : ""}</span>
                                  <span className="tabular-nums">{formatINR(item.subtotal)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h3 className="mb-1 text-xs font-semibold uppercase text-muted">Delivery</h3>
                            <p>{o.recipientName ?? "—"}</p>
                            <p className="text-muted">{o.deliveryAddress ?? "—"}</p>
                            <p className="text-muted">{o.deliveryPhone ?? ""}</p>
                            {o.trackingNumber && <p className="mt-2">Shipped with {o.courier} · <span className="font-mono">{o.trackingNumber}</span></p>}
                            {Number(o.discountAmount) > 0 && <p className="mt-2 text-success">Coupon {o.couponCode}: −{formatINR(o.discountAmount)}</p>}
                            {o.cancelledAt && (
                              <p className="mt-2 text-sale">Cancelled {formatDateTime(o.cancelledAt)} by {o.cancelledBy}</p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </TableShell>
      {result && (
        <Pager page={result.page} totalPages={result.totalPages} totalElements={result.totalElements} onPage={setPage} label="orders" />
      )}
    </>
  );
}

/** Dispatch: courier and tracking number are required before an order can be marked shipped. */
function DispatchDialog({ order, onClose, onDispatch }: {
  order: OrderResponse;
  onClose: () => void;
  onDispatch: (details: { courier: string; trackingNumber: string }) => Promise<void>;
}) {
  const [courier, setCourier] = useState(COURIERS[0]);
  const [trackingNumber, setTrackingNumber] = useState("");
  const valid = /^[A-Za-z0-9-]{4,80}$/.test(trackingNumber.trim());
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-title"
        className="relative w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void onDispatch({ courier, trackingNumber: trackingNumber.trim() });
        }}
      >
        <h2 id="dispatch-title" className="text-lg font-semibold">Dispatch order #{order.id}</h2>
        <p className="text-sm text-muted">{order.recipientName} · {order.deliveryAddress}</p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Courier</span>
          <select className="qk-input" value={courier} onChange={(e) => setCourier(e.target.value)}>
            {COURIERS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tracking number</span>
          <input className="qk-input font-mono uppercase" autoFocus maxLength={80} placeholder="e.g. DL1234567890" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
          <span className="mt-1 block text-xs text-muted">The customer gets it by email with the shipping update.</span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="qk-btn qk-btn-ghost h-10 px-4 text-sm">Cancel</button>
          <button type="submit" disabled={!valid} className="qk-btn qk-btn-primary h-10 px-4 text-sm disabled:opacity-50">Mark as shipped</button>
        </div>
      </form>
    </div>
  );
}

