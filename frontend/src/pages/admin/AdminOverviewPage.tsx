import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, IndianRupee, Package, ShoppingBag, Users, Wallet } from "lucide-react";
import { api } from "../../services/api";
import { AdminAnalyticsResponse, OrderResponse, Product } from "../../types";
import { formatINR } from "../../utils/formatters";
import {
  AdminPageHeader,
  ErrorBanner,
  StatCard,
  StatusBadge,
  errorMessage,
  formatDateTime,
} from "../../components/admin/AdminUi";

/** Every number here comes from the backend (analytics API, orders, products) — nothing is hardcoded. */
export function AdminOverviewPage() {
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse | null>(null);
  const [recentOrders, setRecentOrders] = useState<OrderResponse[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stats, orders, products] = await Promise.all([
        api.getAdminAnalytics(),
        api.getAllAdminOrders(),
        api.getProducts(),
      ]);
      setAnalytics(stats);
      setRecentOrders(orders.slice(0, 6));
      setLowStock(
        products
          .filter((p) => p.stockQuantity < 5)
          .sort((a, b) => a.stockQuantity - b.stockQuantity)
          .slice(0, 8),
      );
    } catch (err) {
      setError(errorMessage(err, "Failed to load dashboard data."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const a = analytics;
  const show = (value: React.ReactNode) => (a ? value : loading ? "…" : "—");

  return (
    <>
      <AdminPageHeader title="Overview" subtitle="Live store metrics" onRefresh={load} refreshing={loading} />
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Booked revenue" value={show(formatINR(a?.totalRevenue))} hint="All non-cancelled orders" icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard label="Collected revenue" value={show(formatINR(a?.collectedRevenue))} hint="Cash on delivery received" tone="good" icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Orders" value={show(a?.totalOrders)} hint={a ? `${a.pendingOrdersCount} awaiting fulfilment` : undefined} icon={<ShoppingBag className="h-4 w-4" />} />
        <StatCard label="Products" value={show(a?.totalProducts)} icon={<Package className="h-4 w-4" />} />
        <StatCard
          label="Stock alerts"
          value={show(`${a?.lowStockCount ?? 0} low · ${a?.outOfStockCount ?? 0} out`)}
          tone={a && a.outOfStockCount > 0 ? "bad" : a && a.lowStockCount > 0 ? "warn" : "default"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard label="Accounts" value={show(a?.totalUsers)} hint={a ? `${a.verifiedUsersCount} email-verified` : undefined} icon={<Users className="h-4 w-4" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5 ">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Recent orders</h2>
            <Link to="/admin/orders" className="text-xs font-semibold text-muted underline">View all</Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-muted">{loading ? "Loading…" : "No orders yet."}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">#{o.id} · {formatINR(o.totalAmount)}</p>
                    <p className="truncate text-xs text-muted">{o.userEmail ?? `User #${o.userId}`} · {formatDateTime(o.createdAt ?? o.orderDate)}</p>
                  </div>
                  <StatusBadge value={o.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-5 ">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Running low</h2>
            <Link to="/admin/inventory" className="text-xs font-semibold text-muted underline">Manage inventory</Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted">{loading ? "Loading…" : "All products are well stocked."}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className={`flex-none font-semibold tabular-nums ${p.stockQuantity <= 0 ? "text-sale" : "text-amber-700 dark:text-amber-400"}`}>
                    {p.stockQuantity <= 0 ? "Out of stock" : `${p.stockQuantity} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
