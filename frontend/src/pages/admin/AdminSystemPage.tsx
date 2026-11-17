import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../services/api";
import { SystemStatusResponse } from "../../types";
import { AdminPageHeader, ErrorBanner, StatusBadge, errorMessage, formatDateTime } from "../../components/admin/AdminUi";

/** Safe operational view: UP/DOWN + latency per dependency. No hosts, ports or credentials are ever returned. */
export function AdminSystemPage() {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await api.getSystemStatus());
    } catch (err) {
      setError(errorMessage(err, "Failed to load system status."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <AdminPageHeader
        title="System Status"
        subtitle={status ? `Checked ${formatDateTime(status.checkedAt)}` : "Health of backend dependencies"}
        onRefresh={load}
        refreshing={loading}
      />
      <ErrorBanner message={error} />
      {status && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-5 ">
          <span className="text-sm font-semibold text-muted">Overall</span>
          <StatusBadge value={status.overall} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(status?.components ?? []).map((c) => (
          <div key={c.name} className="rounded-xl border border-line bg-surface p-5 ">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{c.name}</h2>
              <StatusBadge value={c.status} />
            </div>
            <p className="mt-2 text-sm text-muted">{c.detail}</p>
            <p className="mt-1 text-xs text-muted tabular-nums">{c.latencyMs} ms</p>
          </div>
        ))}
        {!status && loading && <p role="status" className="text-sm text-muted">Checking services…</p>}
      </div>
    </>
  );
}
