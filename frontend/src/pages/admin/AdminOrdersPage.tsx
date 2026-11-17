import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../../services/api";
import { OrderResponse } from "../../types";
import { formatINR } from "../../utils/formatters";
import {
  AdminPageHeader,
  ErrorBanner,
  LoadingRow,
  StatusBadge,
  TableShell,
  errorMessage,
  formatDateTime,
  tdClass,
  thClass,
} from "../../components/admin/AdminUi";

type Status = OrderResponse["status"];

/** Mirrors the server-side state machine in order-service; the server still validates every transition. */
export const NEXT_STATUS: Record<Status, Status[]> = {
  PENDING: ["CONFIRMED"],
  CONFIRMED: ["PROCESSING"],
  PROCESSING: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const ALL_STATUSES: Status[] = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await api.getAllAdminOrders());
    } catch (err) {
      setError(errorMessage(err, "Failed to load orders."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return orders.filter(
      (o) =>
        (statusFilter === "ALL" || o.status === statusFilter) &&
        (!q ||
          String(o.id) === q ||
          (o.userEmail ?? "").toLowerCase().includes(q) ||
          (o.recipientName ?? "").toLowerCase().includes(q)),
    );
  }, [orders, query, statusFilter]);

  const changeStatus = async (order: OrderResponse, next: Status) => {
    if (next === "CANCELLED" && !window.confirm(`Cancel order #${order.id}? Stock will be returned to inventory.`)) return;
    setUpdatingId(order.id);
    setError(null);
    try {
      const updated = await api.updateOrderStatus(order.id, { status: next });
      setOrders((list) => list.map((o) => (o.id === updated.id ? updated : o)));
    } catch (err) {
      setError(errorMessage(err, "Failed to update order status."));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <>
      <AdminPageHeader title="Orders" subtitle={`${orders.length} orders`} onRefresh={load} refreshing={loading} />
      <ErrorBanner message={error} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search orders</span>
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by order #, customer email or recipient"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "ALL" | Status)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="ALL">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
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
          ) : visible.length === 0 ? (
            <LoadingRow colSpan={6} text="No orders match your filters." />
          ) : (
            visible.map((o) => {
              const nextOptions = [...NEXT_STATUS[o.status], ...(o.cancellable ? (["CANCELLED"] as Status[]) : [])];
              const isOpen = expanded === o.id;
              return (
                <React.Fragment key={o.id}>
                  <tr className="hover:bg-slate-50">
                    <td className={tdClass}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : o.id)}
                        className="text-left font-semibold underline-offset-2 hover:underline"
                      >
                        #{o.id}
                      </button>
                      <p className="text-xs text-slate-500">{formatDateTime(o.createdAt ?? o.orderDate)}</p>
                    </td>
                    <td className={tdClass}>{o.userEmail ?? `User #${o.userId}`}</td>
                    <td className={`${tdClass} font-semibold tabular-nums`}>{formatINR(o.totalAmount)}</td>
                    <td className={tdClass}>
                      <p className="text-xs text-slate-500">{o.paymentMethod ?? "—"}</p>
                      <StatusBadge value={o.paymentStatus} />
                    </td>
                    <td className={tdClass}><StatusBadge value={o.status} /></td>
                    <td className={`${tdClass} text-right`}>
                      {nextOptions.length === 0 ? (
                        <span className="text-xs text-slate-400">Final</span>
                      ) : (
                        <select
                          aria-label={`Update status for order ${o.id}`}
                          disabled={updatingId === o.id}
                          value=""
                          onChange={(e) => e.target.value && void changeStatus(o, e.target.value as Status)}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold"
                        >
                          <option value="">Move to…</option>
                          {nextOptions.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50">
                      <td colSpan={6} className="px-4 py-4 text-sm">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Items</h3>
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
                            <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Delivery</h3>
                            <p>{o.recipientName ?? "—"}</p>
                            <p className="text-slate-600">{o.deliveryAddress ?? "—"}</p>
                            <p className="text-slate-600">{o.deliveryPhone ?? ""}</p>
                            {o.cancelledAt && (
                              <p className="mt-2 text-rose-700">Cancelled {formatDateTime(o.cancelledAt)} by {o.cancelledBy}</p>
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
    </>
  );
}
