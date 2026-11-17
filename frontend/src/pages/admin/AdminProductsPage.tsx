import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { Product, ProductRequest } from "../../types";
import { formatINR } from "../../utils/formatters";
import { AdminProductModal } from "../../components/AdminProductModal";
import {
  AdminPageHeader,
  ErrorBanner,
  LoadingRow,
  StatusBadge,
  TableShell,
  errorMessage,
  tdClass,
  thClass,
} from "../../components/admin/AdminUi";

export function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await api.getProducts());
    } catch (err) {
      setError(errorMessage(err, "Failed to load products."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[])).sort(),
    [products],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (category === "ALL" || p.category === category) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          (p.brand ?? "").toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          String(p.id) === q),
    );
  }, [products, query, category]);

  const save = async (data: ProductRequest) => {
    if (editing) await api.updateProduct(editing.id, data);
    else await api.createProduct(data);
    await load();
  };

  const remove = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}" (#${product.id})? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.deleteProduct(product.id);
      await load();
    } catch (err) {
      // e.g. 409 when the product is part of existing orders — the server explains what to do instead.
      setError(errorMessage(err, "Failed to delete product."));
    }
  };

  return (
    <>
      <AdminPageHeader
        title="Products"
        subtitle={`${products.length} products in the catalog`}
        onRefresh={load}
        refreshing={loading}
        actions={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add product
          </button>
        }
      />
      <ErrorBanner message={error} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search products</span>
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, brand, SKU or ID"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-slate-900 focus:outline-none"
          />
        </label>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="ALL">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <TableShell>
        <thead>
          <tr>
            <th className={thClass}>Product</th>
            <th className={thClass}>Category</th>
            <th className={thClass}>Price</th>
            <th className={thClass}>Discount</th>
            <th className={thClass}>Stock</th>
            <th className={thClass}>Availability</th>
            <th className={`${thClass} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && products.length === 0 ? (
            <LoadingRow colSpan={7} />
          ) : visible.length === 0 ? (
            <LoadingRow colSpan={7} text="No products match your filters." />
          ) : (
            visible.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className={tdClass}>
                  <div className="flex items-center gap-3">
                    {p.thumbnailUrl || p.imageUrl ? (
                      <img src={p.thumbnailUrl || p.imageUrl} alt="" className="h-9 w-9 flex-none rounded-md object-cover" loading="lazy" />
                    ) : (
                      <div className="h-9 w-9 flex-none rounded-md bg-slate-100" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-xs text-slate-500">#{p.id}{p.sku ? ` · ${p.sku}` : ""}</p>
                    </div>
                  </div>
                </td>
                <td className={tdClass}>{p.category || "—"}</td>
                <td className={`${tdClass} font-semibold tabular-nums`}>{formatINR(p.price)}</td>
                <td className={`${tdClass} tabular-nums`}>{p.discountPercentage ? `${p.discountPercentage}%` : "—"}</td>
                <td className={`${tdClass} tabular-nums ${p.stockQuantity <= 0 ? "text-rose-700 font-bold" : p.stockQuantity < 5 ? "text-amber-700 font-bold" : ""}`}>
                  {p.stockQuantity}
                </td>
                <td className={tdClass}><StatusBadge value={p.availability} /></td>
                <td className={`${tdClass} whitespace-nowrap text-right`}>
                  <button
                    type="button"
                    aria-label={`Edit ${p.name}`}
                    onClick={() => {
                      setEditing(p);
                      setModalOpen(true);
                    }}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => void remove(p)}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>

      <AdminProductModal
        isOpen={modalOpen}
        product={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={save}
      />
    </>
  );
}
