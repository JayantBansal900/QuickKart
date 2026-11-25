import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import { OrderReturn, PageResponse } from "../../types";
import { formatINR } from "../../utils/formatters";
import { useConfirm } from "../../components/ConfirmDialog";
import { AdminPageHeader, ErrorBanner, LoadingRow, Pager, StatusBadge, TableShell, errorMessage, formatDateTime, tdClass, thClass } from "../../components/admin/AdminUi";

const REASON_LABEL: Record<string, string> = {
  DAMAGED: "Arrived damaged",
  WRONG_ITEM: "Wrong item",
  NOT_AS_DESCRIBED: "Not as described",
  NO_LONGER_NEEDED: "No longer needed",
  OTHER: "Other",
};

/** Return requests: approving restocks the items and refunds the customer. */
export function AdminReturnsPage() {
  const [status, setStatus] = useState<"REQUESTED" | "APPROVED" | "REJECTED" | "ALL">("REQUESTED");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<PageResponse<OrderReturn> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmDialog, confirm] = useConfirm();

  useEffect(() => setPage(0), [status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.getAdminReturns(status, page));
    } catch (err) {
      setError(errorMessage(err, "Failed to load returns."));
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (r: OrderReturn, decision: "APPROVE" | "REJECT") => {
    const ok = await confirm(
      decision === "APPROVE"
        ? { title: `Approve the return of order #${r.orderId}?`, message: `The items go back into stock and ${formatINR(r.order.totalAmount)} is refunded. The customer is emailed.`, confirmLabel: "Approve and refund" }
        : { title: `Reject the return of order #${r.orderId}?`, message: "The order stays delivered and no refund is made.", confirmLabel: "Reject", danger: true },
    );
    if (!ok) return;
    setBusyId(r.id);
    setError(null);
    try {
      await api.resolveReturn(r.id, decision);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Could not update the return."));
    } finally {
      setBusyId(null);
    }
  };

  const rows = result?.content ?? [];
  return (
    <>
      {confirmDialog}
      <AdminPageHeader
        title="Returns"
        subtitle="Return requests from customers (within 7 days of delivery)"
        onRefresh={load}
        refreshing={loading}
        actions={
          <select aria-label="Filter returns" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <option value="REQUESTED">Waiting for a decision</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="ALL">All</option>
          </select>
        }
      />
      <ErrorBanner message={error} />
      <TableShell>
        <thead>
          <tr>
            <th className={thClass}>Order</th>
            <th className={thClass}>Customer</th>
            <th className={thClass}>Reason</th>
            <th className={thClass}>Refund</th>
            <th className={thClass}>Status</th>
            <th className={`${thClass} text-right`}>Decision</th>
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <LoadingRow colSpan={6} />
          ) : rows.length === 0 ? (
            <LoadingRow colSpan={6} text="No returns here." />
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="align-top hover:bg-subtle">
                <td className={tdClass}>
                  <p className="font-semibold">#{r.orderId}</p>
                  <p className="text-xs text-muted">Requested {formatDateTime(r.requestedAt)}</p>
                </td>
                <td className={tdClass}>
                  <p>{r.order.recipientName}</p>
                  <p className="text-xs text-muted">{r.order.userEmail}</p>
                </td>
                <td className={tdClass}>
                  <p>{REASON_LABEL[r.reason] ?? r.reason}</p>
                  {r.comment && <p className="max-w-xs text-xs text-muted">“{r.comment}”</p>}
                </td>
                <td className={`${tdClass} tabular-nums`}>
                  {formatINR(r.order.totalAmount)}
                  <p className="text-xs text-muted">{r.order.paymentMethod}</p>
                </td>
                <td className={tdClass}><StatusBadge value={r.status} /></td>
                <td className={`${tdClass} whitespace-nowrap text-right`}>
                  {r.status === "REQUESTED" ? (
                    <span className="inline-flex gap-2">
                      <button type="button" disabled={busyId === r.id} onClick={() => void decide(r, "REJECT")} className="qk-btn qk-btn-ghost h-8 px-3 text-xs">Reject</button>
                      <button type="button" disabled={busyId === r.id} onClick={() => void decide(r, "APPROVE")} className="qk-btn qk-btn-primary h-8 px-3 text-xs">Approve</button>
                    </span>
                  ) : (
                    <span className="text-xs text-muted">{r.resolvedAt ? formatDateTime(r.resolvedAt) : "—"}</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
      {result && <Pager page={result.page} totalPages={result.totalPages} totalElements={result.totalElements} onPage={setPage} label="returns" />}
    </>
  );
}
