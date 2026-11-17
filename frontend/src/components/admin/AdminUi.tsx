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
        <h1 className="qk-display text-4xl text-fg">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh"
            className="qk-btn qk-btn-ghost h-9 px-3.5 text-xs"
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
    default: "text-fg",
    good: "text-success",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-sale",
  }[tone];
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 transition-shadow hover:shadow-card">
      <div className="flex items-center justify-between text-muted">
        <span className="qk-eyebrow">{label}</span>
        {icon}
      </div>
      <div className={`mt-3 text-3xl font-semibold tracking-tight tabular-nums ${toneClass}`}>{value}</div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const NEUTRAL = "bg-subtle text-muted";
const GOOD = "bg-success-soft text-success";
const WARN = "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
const BAD = "bg-sale-soft text-sale";
const INFO = "bg-accent-soft text-accent";

const BADGE_TONES: Record<string, string> = {
  // order statuses
  PENDING: NEUTRAL,
  CONFIRMED: INFO,
  PROCESSING: WARN,
  SHIPPED: INFO,
  DELIVERED: GOOD,
  CANCELLED: BAD,
  // payment / account / health
  COLLECTED: GOOD,
  COLLECTION_PENDING: WARN,
  ACTIVE: GOOD,
  SUSPENDED: BAD,
  DISABLED: NEUTRAL,
  PENDING_VERIFICATION: WARN,
  UP: GOOD,
  DOWN: BAD,
  DEGRADED: WARN,
  ADMIN: "bg-fg text-bg",
  USER: NEUTRAL,
};

export function StatusBadge({ value }: { value?: string | null }) {
  const text = value || "UNKNOWN";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        BADGE_TONES[text] ?? NEUTRAL
      }`}
    >
      {text.replace(/_/g, " ")}
    </span>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-2xl bg-sale-soft p-3.5 text-sm text-sale">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
      <span>{message}</span>
    </div>
  );
}

export function LoadingRow({ colSpan, text = "Loading…" }: { colSpan: number; text?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-10 text-center text-sm text-muted" role="status">
        {text}
      </td>
    </tr>
  );
}

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export const thClass = "border-b border-line bg-subtle/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted";
export const tdClass = "border-b border-line/70 px-4 py-3.5 align-middle text-fg";

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
