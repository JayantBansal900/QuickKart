import React, { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../../services/api";
import { OrderResponse, OrderStatus, PageResponse } from "../../types";
import { formatINR } from "../../utils/formatters";
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
};

const ALL_STATUSES: OrderStatus[] = ["PENDING", "PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];

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

  const changeStatus = async (order: OrderResponse, next: OrderStatus) => {
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
      const updated = await api.updateOrderStatus(order.id, { status: next });
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
                        <select
                          aria-label={`Update status for order ${o.id}`}
                          disabled={updatingId === o.id}
                          value=""
                          onChange={(e) => e.target.value && void changeStatus(o, e.target.value as OrderStatus)}
                          className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs font-semibold"
                        >
                          <option value="">Move to…</option>
                          {nextOptions.map((s) => (
                            <option key={s} value={s}>{label(s)}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-subtle">
                      <td colSpan={6} className="px-4 py-4 text-sm">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <h3 className="mb-1 text-xs font-semibold uppercase text-muted">Items</h3>
                            <ul className="space-y-1">
                              {o.items.map((item) => (
                                <li key={item.productId} className="flex justify-between gap-3">
                                  <span>{item.quantity} × {item.productName}</span>
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
