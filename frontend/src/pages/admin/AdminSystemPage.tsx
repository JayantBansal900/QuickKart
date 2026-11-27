import React, { useCallback, useEffect, useState } from "react";
import { ChevronRight, RefreshCw, Wrench, X } from "lucide-react";
import { api } from "../../services/api";
import { ComponentDetail, SystemStatusResponse } from "../../types";
import { AdminPageHeader, ErrorBanner, StatusBadge, errorMessage, formatDateTime } from "../../components/admin/AdminUi";
import { useConfirm } from "../../components/ConfirmDialog";

/**
 * Health of every dependency. Click a card to see why it is in that state: its numbers, the
 * problems found, what to do, and the fixes that are safe to run from here. The server never
 * returns hosts, ports or credentials.
 */
export function AdminSystemPage() {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

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
        subtitle={status ? `Checked ${formatDateTime(status.checkedAt)} · click a component to troubleshoot it` : "Health of backend dependencies"}
        onRefresh={load}
        refreshing={loading}
      />
      <ErrorBanner message={error} />
      {status && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-5 ">
          <span className="text-sm font-semibold text-muted">Overall</span>
          <StatusBadge value={status.overall} />
          {status.overall !== "UP" && <span className="text-sm text-muted">Open the red component below to see what to do.</span>}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(status?.components ?? []).map((c) => (
          <button
            key={c.key ?? c.name}
            type="button"
            onClick={() => setOpenKey(c.key)}
            aria-label={`Troubleshoot ${c.name}`}
            className={`group rounded-xl border bg-surface p-5 text-left transition-colors hover:border-fg ${c.status === "UP" ? "border-line" : "border-sale"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{c.name}</h2>
              <StatusBadge value={c.status} />
            </div>
            <p className="mt-2 text-sm text-muted">{c.detail}</p>
            <p className="mt-3 flex items-center justify-between text-xs text-muted">
              <span className="tabular-nums">{c.latencyMs} ms</span>
              <span className="inline-flex items-center gap-0.5 font-semibold text-fg group-hover:underline">
                Details <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </p>
          </button>
        ))}
        {!status && loading && <p role="status" className="text-sm text-muted">Checking services…</p>}
      </div>
      {openKey && <ComponentPanel componentKey={openKey} onClose={() => { setOpenKey(null); void load(); }} />}
    </>
  );
}

/** Side panel with the troubleshooting view of one component. */
function ComponentPanel({ componentKey, onClose }: { componentKey: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ComponentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [confirmDialog, confirm] = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await api.getSystemComponent(componentKey));
    } catch (err) {
      setError(errorMessage(err, "Could not check this component."));
    } finally {
      setLoading(false);
    }
  }, [componentKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (action: ComponentDetail["actions"][number]) => {
    const ok = await confirm({ title: action.label, message: action.description, confirmLabel: action.label });
    if (!ok) return;
    setRunning(action.id);
    setError(null);
    setNotice(null);
    try {
      const result = await api.runSystemAction(componentKey, action.id);
      setNotice(result.message);
      await load();
    } catch (err) {
      setError(errorMessage(err, "The fix could not be run."));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="component-title" className="flex h-full w-full max-w-lg flex-col bg-surface shadow-2xl animate-slide-in-right">
        <header className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Troubleshoot</p>
            <h2 id="component-title" className="mt-1 flex items-center gap-2 text-xl font-semibold">
              {detail?.name ?? "Checking…"} {detail && <StatusBadge value={detail.status} />}
            </h2>
            {detail && <p className="mt-1 text-xs text-muted">Checked {formatDateTime(detail.checkedAt)} · {detail.latencyMs} ms</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5 text-sm">
          {error && <p role="alert" className="rounded-lg bg-sale-soft p-3 text-sale">{error}</p>}
          {notice && <p role="status" className="rounded-lg bg-success-soft p-3 text-success">{notice}</p>}
          {loading && !detail && <p role="status" className="text-muted">Checking…</p>}

          {detail && (
            <>
              {detail.facts.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Numbers</h3>
                  <dl className="divide-y divide-line rounded-lg border border-line">
                    {detail.facts.map((f) => (
                      <div key={f.label} className="flex justify-between gap-4 px-3 py-2">
                        <dt className="text-muted">{f.label.trim()}</dt>
                        <dd className="text-right font-medium tabular-nums">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Problems found</h3>
                {detail.problems.length === 0 ? (
                  <p className="rounded-lg bg-success-soft p-3 text-success">No problems found.</p>
                ) : (
                  <ul className="space-y-2">
                    {detail.problems.map((p) => <li key={p} className="rounded-lg bg-sale-soft p-3 text-sale">{p}</li>)}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">What to do</h3>
                <ul className="space-y-2">
                  {detail.advice.map((a) => <li key={a} className="rounded-lg bg-subtle p-3 leading-relaxed">{a}</li>)}
                </ul>
              </section>

              {detail.actions.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Fix from here</h3>
                  <ul className="space-y-3">
                    {detail.actions.map((a) => (
                      <li key={a.id} className="rounded-lg border border-line p-3">
                        <p className="text-muted">{a.description}</p>
                        <button
                          type="button"
                          disabled={running !== null}
                          onClick={() => void run(a)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-fg px-3 py-2 text-xs font-semibold text-bg disabled:opacity-40"
                        >
                          <Wrench className="h-3.5 w-3.5" /> {running === a.id ? "Running…" : a.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        <footer className="border-t border-line p-4">
          <button type="button" onClick={() => void load()} disabled={loading} className="qk-btn qk-btn-ghost w-full">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Check again
          </button>
        </footer>
      </aside>
      {confirmDialog}
    </div>
  );
}
