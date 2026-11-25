import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import { AdminCart } from "../../types";
import { formatINR } from "../../utils/formatters";
import { AdminPageHeader, ErrorBanner, LoadingRow, StatCard, TableShell, errorMessage, formatDateTime, tdClass, thClass } from "../../components/admin/AdminUi";

/** Carts that still hold items: what shoppers are about to buy, and carts that were abandoned. */
export function AdminCartsPage() {
  const [carts, setCarts] = useState<AdminCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCarts(await api.getAdminCarts());
    } catch (err) {
      setError(errorMessage(err, "Failed to load carts."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const abandoned = carts.filter((c) => !c.updatedAt || new Date(c.updatedAt).getTime() < dayAgo);
  const value = carts.reduce((sum, c) => sum + Number(c.total), 0);

  return (
    <>
      <AdminPageHeader title="Carts" subtitle="Shoppers with items in their cart" onRefresh={load} refreshing={loading} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open carts" value={loading && !carts.length ? "…" : carts.length} />
        <StatCard label="Value in carts" value={formatINR(value)} />
        <StatCard label="Idle for 24h+" value={abandoned.length} hint="Abandoned-cart candidates" tone={abandoned.length ? "warn" : "default"} />
      </div>
      <ErrorBanner message={error} />
      <TableShell>
        <thead>
          <tr>
            <th className={thClass}>Customer</th>
            <th className={thClass}>Items</th>
            <th className={thClass}>Value</th>
            <th className={thClass}>Last change</th>
          </tr>
        </thead>
        <tbody>
          {loading && carts.length === 0 ? (
            <LoadingRow colSpan={4} />
          ) : carts.length === 0 ? (
            <LoadingRow colSpan={4} text="No open carts right now." />
          ) : (
            carts.map((c) => (
              <React.Fragment key={c.cartId}>
                <tr className="hover:bg-subtle">
                  <td className={tdClass}>
                    <button type="button" aria-expanded={open === c.cartId} onClick={() => setOpen(open === c.cartId ? null : c.cartId)} className="text-left">
                      <p className="font-semibold underline-offset-2 hover:underline">{c.customerName}</p>
                      <p className="text-xs text-muted">{c.customerEmail}</p>
                    </button>
                  </td>
                  <td className={`${tdClass} tabular-nums`}>{c.itemCount}</td>
                  <td className={`${tdClass} font-semibold tabular-nums`}>{formatINR(c.total)}</td>
                  <td className={`${tdClass} text-xs`}>{c.updatedAt ? formatDateTime(c.updatedAt) : "Before tracking started"}</td>
                </tr>
                {open === c.cartId && (
                  <tr className="bg-subtle">
                    <td colSpan={4} className="px-4 py-3 text-sm">
                      <ul className="space-y-1">
                        {c.items.map((i) => (
                          <li key={i.productId} className="flex justify-between gap-3">
                            <span>{i.quantity} × {i.productName}</span>
                            <span className="tabular-nums">{formatINR(Number(i.price) * i.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))
          )}
        </tbody>
      </TableShell>
    </>
  );
}
