import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../../services/api";
import { Product } from "../../types";
import {
  AdminPageHeader,
  ErrorBanner,
  LoadingRow,
  StatCard,
  StatusBadge,
  TableShell,
  errorMessage,
  tdClass,
  thClass,
} from "../../components/admin/AdminUi";

export const LOW_STOCK_THRESHOLD = 5;
type Filter = "ALL" | "LOW" | "OUT";

/**
 * Inventory uses RELATIVE adjustments (+restock / -correction) via PATCH /admin/products/{id}/stock.
 * The server applies them under a row lock, so a checkout that happens at the same moment is never
 * overwritten (an absolute "set stock to N" could silently undo it).
 */
export function AdminInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("LOW");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await api.getProducts());
    } catch (err) {
      setError(errorMessage(err, "Failed to load inventory."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const outCount = products.filter((p) => p.stockQuantity <= 0).length;
  const lowCount = products.filter((p) => p.stockQuantity > 0 && p.stockQuantity < LOW_STOCK_THRESHOLD).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) =>
        filter === "OUT" ? p.stockQuantity <= 0 : filter === "LOW" ? p.stockQuantity < LOW_STOCK_THRESHOLD : true,
      )
      .filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.id) === q || (p.sku ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.stockQuantity - b.stockQuantity);
  }, [products, filter, query]);

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
      setProducts((list) => list.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      setDrafts((d) => ({ ...d, [product.id]: "" }));
      setNotice(`${product.name}: stock ${product.stockQuantity} → ${updated.stockQuantity}`);
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
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filter === value ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <AdminPageHeader title="Inventory" subtitle="Restock and correct stock levels" onRefresh={load} refreshing={loading} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Products tracked" value={loading && !products.length ? "…" : products.length} />
        <StatCard label={`Low stock (1–${LOW_STOCK_THRESHOLD - 1})`} value={lowCount} tone={lowCount ? "warn" : "default"} />
        <StatCard label="Out of stock" value={outCount} tone={outCount ? "bad" : "default"} />
      </div>
      <ErrorBanner message={error} />
      {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {tab("LOW", "Needs attention")}
          {tab("OUT", "Out of stock")}
          {tab("ALL", "All")}
        </div>
        <label className="relative flex-1">
          <span className="sr-only">Search inventory</span>
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, SKU or ID"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-slate-900 focus:outline-none"
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
          </tr>
        </thead>
        <tbody>
          {loading && products.length === 0 ? (
            <LoadingRow colSpan={4} />
          ) : visible.length === 0 ? (
            <LoadingRow colSpan={4} text={filter === "ALL" ? "No products found." : "Nothing needs attention here."} />
          ) : (
            visible.map((p) => {
              const busy = savingId === p.id;
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className={tdClass}>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-slate-500">#{p.id}{p.sku ? ` · ${p.sku}` : ""}</p>
                  </td>
                  <td className={`${tdClass} text-lg font-black tabular-nums ${p.stockQuantity <= 0 ? "text-rose-700" : p.stockQuantity < LOW_STOCK_THRESHOLD ? "text-amber-700" : ""}`}>
                    {p.stockQuantity}
                  </td>
                  <td className={tdClass}><StatusBadge value={p.availability} /></td>
                  <td className={tdClass}>
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
                        className="w-24 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                      />
                      <button type="submit" disabled={busy || !drafts[p.id]} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                        Apply
                      </button>
                      {[10, 25].map((n) => (
                        <button
                          key={n}
                          type="button"
                          disabled={busy}
                          onClick={() => void apply(p, n)}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          +{n}
                        </button>
                      ))}
                    </form>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </TableShell>
    </>
  );
}
