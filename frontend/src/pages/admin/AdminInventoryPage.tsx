import React, { useCallback, useEffect, useState } from "react";
import { History, Search, X } from "lucide-react";
import { api } from "../../services/api";
import { AdminAnalyticsResponse, PageResponse, Product, StockMovement } from "../../types";
import {
  AdminPageHeader,
  ErrorBanner,
  LoadingRow,
  PAGE_SIZE,
  Pager,
  StatCard,
  StatusBadge,
  TableShell,
  errorMessage,
  formatDateTime,
  tdClass,
  thClass,
  useDebounced,
} from "../../components/admin/AdminUi";

export const LOW_STOCK_THRESHOLD = 5;
type Filter = "ALL" | "LOW" | "OUT";

const REASONS: Record<string, string> = {
  ORDER_PLACED: "Order placed",
  ORDER_CANCELLED: "Order cancelled",
  RESTOCK: "Restock",
  CORRECTION: "Correction",
  ADMIN_EDIT: "Edited in product form",
  INITIAL_STOCK: "Product created",
  ORDER_RETURNED: "Return approved",
};

/**
 * Inventory uses RELATIVE adjustments (+restock / -correction) via PATCH /admin/products/{id}/stock.
 * The server applies them under a row lock, so a checkout that happens at the same moment is never
 * overwritten (an absolute "set stock to N" could silently undo it). Every change is recorded in
 * the stock history.
 */
export function AdminInventoryPage() {
  const [result, setResult] = useState<PageResponse<Product> | null>(null);
  const [stats, setStats] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("LOW");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [historyFor, setHistoryFor] = useState<Product | null>(null);
  const q = useDebounced(query.trim());

  useEffect(() => setPage(0), [q, filter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [products, analytics] = await Promise.all([
        api.getAdminProducts({ q, stock: filter, sort: "stock", page, size: PAGE_SIZE }),
        api.getAdminAnalytics(),
      ]);
      setResult(products);
      setStats(analytics);
    } catch (err) {
      setError(errorMessage(err, "Failed to load inventory."));
    } finally {
      setLoading(false);
    }
  }, [q, filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const products = result?.content ?? [];

  const apply = async (product: Product, adjustment: number) => {
    if (!Number.isInteger(adjustment) || adjustment === 0) {
      setError("Enter a whole number other than 0 (e.g. 10 to restock, -2 to correct).");
      return;
    }
    if (product.stockQuantity + adjustment < 0) {
      setError(`Stock for "${product.name}" cannot go below 0 (currently ${product.stockQuantity}).`);
      return;
    }
    setSavingId(product.id);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.adjustStock(product.id, adjustment);
      setResult((r) => r && { ...r, content: r.content.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)) });
      setDrafts((d) => ({ ...d, [product.id]: "" }));
      setNotice(`${product.name}: stock ${product.stockQuantity} → ${updated.stockQuantity}`);
      api.getAdminAnalytics().then(setStats).catch(() => undefined);
    } catch (err) {
      setError(errorMessage(err, "Stock update failed."));
    } finally {
      setSavingId(null);
    }
  };

  /** Per-size stock: saved through the product update, which sets the product total to the sum of its sizes. */
  const saveSizes = async (product: Product, stocks: Record<number, number>) => {
    setSavingId(product.id);
    setError(null);
    setNotice(null);
    try {
      const variants = (product.variants ?? []).map((v) => ({ size: v.size, color: v.color || undefined, stockQuantity: stocks[v.id] ?? v.stockQuantity }));
      const updated = await api.updateProduct(product.id, {
        name: product.name, brand: product.brand, description: product.description, price: product.price,
        discountPercentage: product.discountPercentage ?? undefined, category: product.category, sku: product.sku,
        imageUrl: product.imageUrl, thumbnailUrl: product.thumbnailUrl, availability: product.availability,
        stockQuantity: variants.reduce((sum, v) => sum + v.stockQuantity, 0), variants,
      });
      setResult((r) => r && { ...r, content: r.content.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)) });
      setNotice(`${product.name}: stock ${product.stockQuantity} → ${updated.stockQuantity}`);
      api.getAdminAnalytics().then(setStats).catch(() => undefined);
    } catch (err) {
      setError(errorMessage(err, "Stock update failed."));
    } finally {
      setSavingId(null);
    }
  };

  const tab = (value: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === value ? "bg-fg text-bg" : "bg-surface text-fg hover:bg-subtle"}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <AdminPageHeader title="Inventory" subtitle="Restock, correct and audit stock levels" onRefresh={load} refreshing={loading} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Products tracked" value={stats ? stats.totalProducts : "…"} />
        <StatCard label={`Low stock (1–${LOW_STOCK_THRESHOLD - 1})`} value={stats ? stats.lowStockCount : "…"} tone={stats?.lowStockCount ? "warn" : "default"} />
        <StatCard label="Out of stock" value={stats ? stats.outOfStockCount : "…"} tone={stats?.outOfStockCount ? "bad" : "default"} />
      </div>
      <ErrorBanner message={error} />
      {notice && <p role="status" className="rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success">{notice}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {tab("LOW", "Needs attention")}
          {tab("OUT", "Out of stock")}
          {tab("ALL", "All")}
        </div>
        <label className="relative flex-1">
          <span className="sr-only">Search inventory</span>
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, SKU or ID"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
          />
        </label>
      </div>

      <TableShell>
        <thead>
          <tr>
            <th className={thClass}>Product</th>
            <th className={thClass}>Current stock</th>
            <th className={thClass}>Availability</th>
            <th className={thClass}>Adjust</th>
            <th className={`${thClass} text-right`}>History</th>
          </tr>
        </thead>
        <tbody>
          {loading && products.length === 0 ? (
            <LoadingRow colSpan={5} />
          ) : products.length === 0 ? (
            <LoadingRow colSpan={5} text={filter === "ALL" ? "No products found." : "Nothing needs attention here."} />
          ) : (
            products.map((p) => {
              const busy = savingId === p.id;
              return (
                <tr key={p.id} className="hover:bg-subtle">
                  <td className={tdClass}>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-muted">#{p.id}{p.sku ? ` · ${p.sku}` : ""}</p>
                  </td>
                  <td className={`${tdClass} text-lg font-semibold tabular-nums ${p.stockQuantity <= 0 ? "text-sale" : p.stockQuantity < LOW_STOCK_THRESHOLD ? "text-amber-700 dark:text-amber-400" : ""}`}>
                    {p.stockQuantity}
                  </td>
                  <td className={tdClass}><StatusBadge value={p.availability} /></td>
                  <td className={tdClass}>
                    {(p.variants?.length ?? 0) > 0 ? (
                      <SizeStockEditor product={p} busy={busy} onSave={(stocks) => void saveSizes(p, stocks)} />
                    ) : (
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void apply(p, Number(drafts[p.id]));
                      }}
                    >
                      <input
                        type="number"
                        step={1}
                        aria-label={`Stock adjustment for ${p.name}`}
                        placeholder="+10 / -2"
                        value={drafts[p.id] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                        className="w-24 rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
                      />
                      <button type="submit" disabled={busy || !drafts[p.id]} className="rounded-md bg-fg px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-40">
                        Apply
                      </button>
                      {[10, 25].map((n) => (
                        <button
                          key={n}
                          type="button"
                          disabled={busy}
                          onClick={() => void apply(p, n)}
                          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-fg hover:bg-subtle disabled:opacity-40"
                        >
                          +{n}
                        </button>
                      ))}
                    </form>
                    )}
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <button
                      type="button"
                      onClick={() => setHistoryFor(p)}
                      aria-label={`Stock history for ${p.name}`}
                      className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg"
                    >
                      <History className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>
      {result && (
        <Pager page={result.page} totalPages={result.totalPages} totalElements={result.totalElements} onPage={setPage} label="products" />
      )}
      {historyFor && <StockHistoryPanel product={historyFor} onClose={() => setHistoryFor(null)} />}
    </>
  );
}

/** Slide-over listing every stock change of one product, newest first. */
function StockHistoryPanel({ product, onClose }: { product: Product; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageResponse<StockMovement> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .getStockMovements(product.id, page, 15)
      .then((r) => alive && setData(r))
      .catch((err) => alive && setError(errorMessage(err, "Could not load the stock history.")));
    return () => {
      alive = false;
    };
  }, [product.id, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-label={`Stock history for ${product.name}`} className="relative flex h-full w-full max-w-md flex-col bg-surface shadow-card">
        <header className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <p className="qk-eyebrow">Stock history</p>
            <h2 className="mt-1 truncate text-lg font-semibold">{product.name}</h2>
            <p className="text-xs text-muted">Now {product.stockQuantity} in stock</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" autoFocus className="rounded-full p-2 text-muted hover:bg-subtle hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <ErrorBanner message={error} />
          {!data && !error ? (
            <p className="text-sm text-muted" role="status">Loading…</p>
          ) : data && data.content.length === 0 ? (
            <p className="text-sm text-muted">No stock changes recorded yet. Changes are recorded from now on.</p>
          ) : (
            <ol className="space-y-3">
              {data?.content.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{REASONS[m.reason] ?? m.reason}{m.reference ? ` · ${m.reference}` : ""}</p>
                    <p className="truncate text-xs text-muted">{formatDateTime(m.createdAt)}{m.actor ? ` · ${m.actor}` : ""}</p>
                  </div>
                  <div className="flex-none text-right tabular-nums">
                    <p className={`font-semibold ${m.change > 0 ? "text-success" : "text-sale"}`}>{m.change > 0 ? `+${m.change}` : m.change}</p>
                    <p className="text-xs text-muted">→ {m.stockAfter}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        {data && data.totalPages > 1 && (
          <footer className="border-t border-line p-4">
            <Pager page={data.page} totalPages={data.totalPages} totalElements={data.totalElements} onPage={setPage} label="changes" />
          </footer>
        )}
      </aside>
    </div>
  );
}

/** One number box per size (and colour). Save sends all of them; the product total follows. */
function SizeStockEditor({ product, busy, onSave }: { product: Product; busy: boolean; onSave: (stocks: Record<number, number>) => void }) {
  const variants = product.variants ?? [];
  const [draft, setDraft] = useState<Record<number, string>>({});
  const dirty = variants.some((v) => draft[v.id] !== undefined && Number(draft[v.id]) !== v.stockQuantity);
  return (
    <div>
      <ul className="grid max-w-md grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {variants.map((v) => {
          const label = [v.size, v.color].filter(Boolean).join(" · ");
          return (
            <li key={v.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted" title={label}>{label}</span>
              <input
                type="number"
                min={0}
                step={1}
                aria-label={`Stock for ${product.name} ${label}`}
                value={draft[v.id] ?? String(v.stockQuantity)}
                onChange={(e) => setDraft((d) => ({ ...d, [v.id]: e.target.value }))}
                className={`w-14 rounded-md border border-line bg-surface px-1.5 py-1 text-right text-xs tabular-nums ${v.stockQuantity <= 0 ? "text-sale" : ""}`}
              />
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={busy || !dirty}
        onClick={() => onSave(Object.fromEntries(variants.map((v) => [v.id, Math.max(0, Math.floor(Number(draft[v.id] ?? v.stockQuantity) || 0))])))}
        className="mt-2 rounded-md bg-fg px-3 py-1.5 text-xs font-semibold text-bg disabled:opacity-40"
      >
        Save sizes
      </button>
    </div>
  );
}
