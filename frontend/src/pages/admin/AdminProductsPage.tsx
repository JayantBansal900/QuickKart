import React, { useCallback, useEffect, useState } from "react";
import { Edit2, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { Category, PageResponse, Product, ProductRequest } from "../../types";
import { formatINR } from "../../utils/formatters";
import { AdminProductModal } from "../../components/AdminProductModal";
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
  tdClass,
  thClass,
  useDebounced,
} from "../../components/admin/AdminUi";

export function AdminProductsPage() {
  const [result, setResult] = useState<PageResponse<Product> | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [confirmDialog, confirm] = useConfirm();
  const q = useDebounced(query.trim());

  useEffect(() => setPage(0), [q, category]);

  useEffect(() => {
    api.getAdminCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.getAdminProducts({ q, category: category === "ALL" ? undefined : category, page, size: PAGE_SIZE }));
    } catch (err) {
      setError(errorMessage(err, "Failed to load products."));
    } finally {
      setLoading(false);
    }
  }, [q, category, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const products = result?.content ?? [];

  const save = async (data: ProductRequest, photo: File | null) => {
    const saved = editing ? await api.updateProduct(editing.id, data) : await api.createProduct(data);
    try {
      if (photo) await api.uploadProductImage(saved.id, photo);
    } finally {
      await load(); // the product itself is saved even if the photo upload failed
    }
  };

  const remove = async (product: Product) => {
    const ok = await confirm({
      title: `Delete "${product.name}"?`,
      message: "This can't be undone. Products that appear in past orders can't be deleted: set them to Discontinued instead.",
      confirmLabel: "Delete product",
      danger: true,
    });
    if (!ok) return;
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
      {confirmDialog}
      <AdminPageHeader
        title="Products"
        subtitle={result ? `${result.totalElements} ${category === "ALL" && !q ? "products in the catalog" : "matching products"}` : "Loading…"}
        onRefresh={load}
        refreshing={loading}
        actions={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="qk-btn qk-btn-primary h-9 px-4 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Add product
          </button>
        }
      />
      <ErrorBanner message={error} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search products</span>
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, brand, SKU or ID"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
          />
        </label>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        >
          <option value="ALL">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      <TableShell>
        <thead>
          <tr>
            <th className={thClass}>Product</th>
            <th className={thClass}>Category</th>
            <th className={thClass}>Price</th>
            <th className={thClass}>Rating</th>
            <th className={thClass}>Stock</th>
            <th className={thClass}>Availability</th>
            <th className={`${thClass} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && products.length === 0 ? (
            <LoadingRow colSpan={7} />
          ) : products.length === 0 ? (
            <LoadingRow colSpan={7} text="No products match your filters." />
          ) : (
            products.map((p) => (
              <tr key={p.id} className="hover:bg-subtle">
                <td className={tdClass}>
                  <div className="flex items-center gap-3">
                    {p.thumbnailUrl || p.imageUrl ? (
                      <img src={p.thumbnailUrl || p.imageUrl} alt="" className="h-12 w-12 flex-none rounded-xl bg-subtle object-cover" loading="lazy" />
                    ) : (
                      <div className="h-12 w-12 flex-none rounded-xl bg-subtle" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-xs text-muted">#{p.id}{p.sku ? ` · ${p.sku}` : ""}{p.brand ? ` · ${p.brand}` : ""}</p>
                    </div>
                  </div>
                </td>
                <td className={tdClass}>{p.category || "—"}</td>
                <td className={`${tdClass} tabular-nums`}>
                  <span className="font-semibold">{formatINR(p.price)}</span>
                  {p.discountPercentage ? <span className="ml-1.5 text-xs text-success">−{Math.round(p.discountPercentage)}%</span> : null}
                </td>
                <td className={`${tdClass} tabular-nums text-xs`}>
                  {p.rating ? `${p.rating.toFixed(1)} ★` : "—"} <span className="text-muted">({p.reviewCount ?? 0})</span>
                </td>
                <td className={`${tdClass} tabular-nums ${p.stockQuantity <= 0 ? "text-sale font-semibold" : p.stockQuantity < 5 ? "text-amber-700 dark:text-amber-400 font-semibold" : ""}`}>
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
                    className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => void remove(p)}
                    className="rounded-md p-1.5 text-muted hover:bg-sale-soft hover:text-sale"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
      {result && (
        <Pager page={result.page} totalPages={result.totalPages} totalElements={result.totalElements} onPage={setPage} label="products" />
      )}

      <AdminProductModal
        isOpen={modalOpen}
        product={editing}
        categories={categories.map((c) => c.name)}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={save}
      />
    </>
  );
}
