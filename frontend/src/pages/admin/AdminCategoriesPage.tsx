import React, { useCallback, useEffect, useState } from "react";
import { Edit2, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import { api } from "../../services/api";
import { Category, CategoryRequest } from "../../types";
import { useConfirm } from "../../components/ConfirmDialog";
import {
  AdminPageHeader,
  ErrorBanner,
  LoadingRow,
  TableShell,
  errorMessage,
  tdClass,
  thClass,
} from "../../components/admin/AdminUi";

const EMPTY: CategoryRequest = { name: "", description: "", imageUrl: "", sortOrder: undefined, active: true };

/**
 * Storefront departments. Renaming a category renames it on all its products; a category that
 * still has products can't be deleted (hide it instead).
 */
export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [confirmDialog, confirm] = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await api.getAdminCategories());
    } catch (err) {
      setError(errorMessage(err, "Failed to load categories."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (c: Category) => {
    setError(null);
    try {
      await api.updateCategory(c.id, { name: c.name, description: c.description ?? "", imageUrl: c.imageUrl ?? "", sortOrder: c.sortOrder, active: !c.active });
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not update the category."));
    }
  };

  const remove = async (c: Category) => {
    if (!(await confirm({ title: `Delete "${c.name}"?`, message: "Only empty categories can be deleted.", confirmLabel: "Delete", danger: true }))) return;
    setError(null);
    try {
      await api.deleteCategory(c.id);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not delete the category."));
    }
  };

  return (
    <>
      {confirmDialog}
      <AdminPageHeader
        title="Categories"
        subtitle="Departments shown on the storefront"
        onRefresh={load}
        refreshing={loading}
        actions={
          <button type="button" onClick={() => setEditing("new")} className="qk-btn qk-btn-primary h-9 px-4 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add category
          </button>
        }
      />
      <ErrorBanner message={error} />

      <TableShell>
        <thead>
          <tr>
            <th className={thClass}>Category</th>
            <th className={thClass}>Products on sale</th>
            <th className={thClass}>Order</th>
            <th className={thClass}>Visible</th>
            <th className={`${thClass} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && categories.length === 0 ? (
            <LoadingRow colSpan={5} />
          ) : categories.length === 0 ? (
            <LoadingRow colSpan={5} text="No categories yet." />
          ) : (
            categories.map((c) => (
              <tr key={c.id} className="hover:bg-subtle">
                <td className={tdClass}>
                  <div className="flex items-center gap-3">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="h-12 w-12 flex-none rounded-xl bg-subtle object-cover" loading="lazy" />
                    ) : (
                      <div className="h-12 w-12 flex-none rounded-xl bg-subtle" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold">{c.name}</p>
                      <p className="truncate text-xs text-muted">{c.description || "—"}</p>
                    </div>
                  </div>
                </td>
                <td className={`${tdClass} tabular-nums`}>{c.productCount}</td>
                <td className={`${tdClass} tabular-nums text-muted`}>{c.sortOrder}</td>
                <td className={tdClass}>
                  <button
                    type="button"
                    onClick={() => void toggle(c)}
                    aria-label={c.active ? `Hide ${c.name}` : `Show ${c.name}`}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c.active ? "bg-success-soft text-success" : "bg-subtle text-muted"}`}
                  >
                    {c.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {c.active ? "Visible" : "Hidden"}
                  </button>
                </td>
                <td className={`${tdClass} whitespace-nowrap text-right`}>
                  <button type="button" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)} className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label={`Delete ${c.name}`} onClick={() => void remove(c)} className="rounded-md p-1.5 text-muted hover:bg-sale-soft hover:text-sale">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>

      {editing && (
        <CategoryForm
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function CategoryForm({ category, onClose, onSaved }: { category: Category | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<CategoryRequest>(
    category
      ? { name: category.name, description: category.description ?? "", imageUrl: category.imageUrl ?? "", sortOrder: category.sortOrder, active: category.active }
      : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, sortOrder: form.sortOrder === undefined || Number.isNaN(form.sortOrder) ? undefined : form.sortOrder };
      if (category) await api.updateCategory(category.id, body);
      else await api.createCategory(body);
      await onSaved();
    } catch (err) {
      setError(errorMessage(err, "Could not save the category."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-form-title"
        className="relative w-full max-w-md space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card"
      >
        <div className="flex items-center justify-between">
          <h2 id="category-form-title" className="text-lg font-semibold">{category ? "Edit category" : "New category"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-subtle">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ErrorBanner message={error} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Name</span>
          <input required maxLength={80} autoFocus className="qk-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {category && form.name.trim() !== category.name && (
            <span className="mt-1 block text-xs text-muted">All {category.productCount} product(s) move to the new name.</span>
          )}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Description</span>
          <input maxLength={300} className="qk-input" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Image URL</span>
          <input
            maxLength={1000}
            className="qk-input"
            placeholder="/categories/jackets.webp or https://…"
            value={form.imageUrl ?? ""}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          />
        </label>
        <div className="flex items-end gap-4">
          <label className="block flex-1 text-sm">
            <span className="mb-1 block font-medium">Display order</span>
            <input
              type="number"
              min={0}
              className="qk-input"
              value={form.sortOrder ?? ""}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value === "" ? undefined : Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-sm">
            <input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Visible in store
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="qk-btn qk-btn-ghost h-10 px-4 text-sm">Cancel</button>
          <button type="submit" disabled={busy || !form.name.trim()} className="qk-btn qk-btn-primary h-10 px-4 text-sm disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
