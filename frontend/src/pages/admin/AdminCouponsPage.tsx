import React, { useCallback, useEffect, useState } from "react";
import { Edit2, Plus, Trash2, X } from "lucide-react";
import { api } from "../../services/api";
import { Coupon, CouponRequest } from "../../types";
import { formatINR } from "../../utils/formatters";
import { useConfirm } from "../../components/ConfirmDialog";
import { AdminPageHeader, ErrorBanner, LoadingRow, StatusBadge, TableShell, errorMessage, formatDateTime, tdClass, thClass } from "../../components/admin/AdminUi";

const describe = (c: Coupon) =>
  c.discountType === "PERCENT"
    ? `${c.discountValue}% off${c.maxDiscount ? ` (max ${formatINR(c.maxDiscount)})` : ""}`
    : `${formatINR(c.discountValue)} off`;

/** Discount codes: create, edit, switch off, delete when unused. */
export function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [confirmDialog, confirm] = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCoupons(await api.getAdminCoupons());
    } catch (err) {
      setError(errorMessage(err, "Failed to load coupons."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (c: Coupon) => {
    if (!(await confirm({ title: `Delete ${c.code}?`, message: "Only coupons that were never used can be deleted.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await api.deleteCoupon(c.id);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not delete the coupon."));
    }
  };

  return (
    <>
      {confirmDialog}
      <AdminPageHeader
        title="Coupons"
        subtitle="Discount codes customers enter at checkout"
        onRefresh={load}
        refreshing={loading}
        actions={
          <button type="button" onClick={() => setEditing("new")} className="qk-btn qk-btn-primary h-9 px-4 text-xs">
            <Plus className="h-3.5 w-3.5" /> New coupon
          </button>
        }
      />
      <ErrorBanner message={error} />
      <TableShell>
        <thead>
          <tr>
            <th className={thClass}>Code</th>
            <th className={thClass}>Discount</th>
            <th className={thClass}>Minimum order</th>
            <th className={thClass}>Used</th>
            <th className={thClass}>Valid until</th>
            <th className={thClass}>Status</th>
            <th className={`${thClass} text-right`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && coupons.length === 0 ? (
            <LoadingRow colSpan={7} />
          ) : coupons.length === 0 ? (
            <LoadingRow colSpan={7} text="No coupons yet." />
          ) : (
            coupons.map((c) => (
              <tr key={c.id} className="hover:bg-subtle">
                <td className={tdClass}>
                  <p className="font-mono font-bold">{c.code}</p>
                  <p className="max-w-[16rem] truncate text-xs text-muted">{c.description || "—"}</p>
                </td>
                <td className={tdClass}>{describe(c)}</td>
                <td className={`${tdClass} tabular-nums`}>{Number(c.minOrderAmount) > 0 ? formatINR(c.minOrderAmount) : "—"}</td>
                <td className={`${tdClass} tabular-nums`}>
                  {c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""}
                  {c.oncePerCustomer && <span className="block text-xs text-muted">once per customer</span>}
                </td>
                <td className={`${tdClass} text-xs`}>{c.expiresAt ? formatDateTime(c.expiresAt) : "No end date"}</td>
                <td className={tdClass}><StatusBadge value={c.active ? "ACTIVE" : "DISABLED"} /></td>
                <td className={`${tdClass} whitespace-nowrap text-right`}>
                  <button type="button" aria-label={`Edit ${c.code}`} onClick={() => setEditing(c)} className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label={`Delete ${c.code}`} onClick={() => void remove(c)} className="rounded-md p-1.5 text-muted hover:bg-sale-soft hover:text-sale">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
      {editing && (
        <CouponForm
          coupon={editing === "new" ? null : editing}
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

const toLocalInput = (iso?: string | null) => (iso ? iso.slice(0, 16) : "");

function CouponForm({ coupon, onClose, onSaved }: { coupon: Coupon | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    code: coupon?.code ?? "",
    description: coupon?.description ?? "",
    discountType: coupon?.discountType ?? ("PERCENT" as "PERCENT" | "FLAT"),
    discountValue: coupon ? String(coupon.discountValue) : "",
    maxDiscount: coupon?.maxDiscount != null ? String(coupon.maxDiscount) : "",
    minOrderAmount: coupon ? String(coupon.minOrderAmount) : "0",
    usageLimit: coupon?.usageLimit != null ? String(coupon.usageLimit) : "",
    oncePerCustomer: coupon?.oncePerCustomer ?? true,
    expiresAt: toLocalInput(coupon?.expiresAt),
    active: coupon?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: CouponRequest = {
      code: form.code.trim(),
      description: form.description.trim() || undefined,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      maxDiscount: form.discountType === "PERCENT" && form.maxDiscount ? Number(form.maxDiscount) : null,
      minOrderAmount: Number(form.minOrderAmount || 0),
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      oncePerCustomer: form.oncePerCustomer,
      expiresAt: form.expiresAt ? `${form.expiresAt}:00` : null,
      active: form.active,
    };
    try {
      await api.saveCoupon(body, coupon?.id);
      await onSaved();
    } catch (err) {
      setError(errorMessage(err, "Could not save the coupon."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="coupon-form-title"
        className="relative max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center justify-between">
          <h2 id="coupon-form-title" className="text-lg font-semibold">{coupon ? `Edit ${coupon.code}` : "New coupon"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted hover:bg-subtle"><X className="h-4 w-4" /></button>
        </div>
        <ErrorBanner message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Code</span>
            <input required minLength={3} maxLength={40} pattern="[A-Za-z0-9_\-]+" className="qk-input font-mono uppercase" value={form.code} onChange={set("code")} autoFocus />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Description (shown to customers)</span>
            <input maxLength={200} className="qk-input" value={form.description} onChange={set("description")} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Type</span>
            <select className="qk-input" value={form.discountType} onChange={set("discountType")}>
              <option value="PERCENT">Percentage</option>
              <option value="FLAT">Flat amount (₹)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{form.discountType === "PERCENT" ? "Percent off" : "Amount off (₹)"}</span>
            <input required type="number" min="0.01" max={form.discountType === "PERCENT" ? 90 : undefined} step="0.01" className="qk-input" value={form.discountValue} onChange={set("discountValue")} />
          </label>
          {form.discountType === "PERCENT" && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Maximum discount (₹, optional)</span>
              <input type="number" min="0.01" step="0.01" className="qk-input" value={form.maxDiscount} onChange={set("maxDiscount")} />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Minimum order (₹)</span>
            <input type="number" min="0" step="0.01" className="qk-input" value={form.minOrderAmount} onChange={set("minOrderAmount")} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Total uses (optional)</span>
            <input type="number" min="1" step="1" className="qk-input" value={form.usageLimit} onChange={set("usageLimit")} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Ends (optional)</span>
            <input type="datetime-local" className="qk-input" value={form.expiresAt} onChange={set("expiresAt")} />
          </label>
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.oncePerCustomer} onChange={set("oncePerCustomer")} /> Once per customer</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={set("active")} /> Active</label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="qk-btn qk-btn-ghost h-10 px-4 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="qk-btn qk-btn-primary h-10 px-4 text-sm">{busy ? "Saving…" : "Save coupon"}</button>
        </div>
      </form>
    </div>
  );
}
