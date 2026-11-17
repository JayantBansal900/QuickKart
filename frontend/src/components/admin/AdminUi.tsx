import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

/** Small presentational building blocks shared by every admin page. */

export function AdminPageHeader({
  title,
  subtitle,
  onRefresh,
  refreshing = false,
  actions,
}: {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
  icon?: React.ReactNode;
}) {
  const toneClass = {
    default: "text-slate-900",
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-rose-700",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className={`mt-2 text-2xl font-black tabular-nums ${toneClass}`}>{value}</div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  // order statuses
  PENDING: "bg-slate-100 text-slate-700",
  CONFIRMED: "bg-indigo-50 text-indigo-700",
  PROCESSING: "bg-amber-50 text-amber-800",
  SHIPPED: "bg-sky-50 text-sky-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-rose-50 text-rose-700",
  // payment / account / health
  COLLECTED: "bg-emerald-50 text-emerald-700",
  COLLECTION_PENDING: "bg-amber-50 text-amber-800",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  SUSPENDED: "bg-rose-50 text-rose-700",
  DISABLED: "bg-slate-200 text-slate-700",
  PENDING_VERIFICATION: "bg-amber-50 text-amber-800",
  UP: "bg-emerald-50 text-emerald-700",
  DOWN: "bg-rose-50 text-rose-700",
  DEGRADED: "bg-amber-50 text-amber-800",
  ADMIN: "bg-slate-900 text-white",
  USER: "bg-slate-100 text-slate-700",
};

export function StatusBadge({ value }: { value?: string | null }) {
  const text = value || "UNKNOWN";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
        BADGE_TONES[text] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {text.replace(/_/g, " ")}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
      <span>{message}</span>
    </div>
  );
}

export function LoadingRow({ colSpan, text = "Loading…" }: { colSpan: number; text?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-8 text-center text-sm text-slate-500" role="status">
        {text}
      </td>
    </tr>
  );
}

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export const thClass = "border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500";
export const tdClass = "border-b border-slate-100 px-4 py-3 align-top";

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
