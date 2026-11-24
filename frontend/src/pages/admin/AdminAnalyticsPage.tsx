import React, { useCallback, useEffect, useMemo, useState } from "react";
import { IndianRupee, ShoppingBag, TrendingUp, UserPlus } from "lucide-react";
import { api } from "../../services/api";
import { AnalyticsInsights } from "../../types";
import { formatINR } from "../../utils/formatters";
import { AdminPageHeader, ErrorBanner, StatCard, errorMessage } from "../../components/admin/AdminUi";

const RANGES = [7, 30, 90] as const;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const compactINR = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`;

/** Sales analytics: every number is computed by the monolith from the live database. */
export function AdminAnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<AnalyticsInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getAnalyticsInsights(days));
    } catch (err) {
      setError(errorMessage(err, "Failed to load analytics."));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const d = data;
  const show = (v: React.ReactNode) => (d ? v : loading ? "…" : "—");

  return (
    <>
      <AdminPageHeader
        title="Analytics"
        subtitle="Booked sales: placed orders that were not cancelled"
        onRefresh={load}
        refreshing={loading}
        actions={
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-1" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={days === r}
                onClick={() => setDays(r)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${days === r ? "bg-fg text-bg" : "text-muted hover:bg-subtle hover:text-fg"}`}
              >
                {r} days
              </button>
            ))}
          </div>
        }
      />
      <ErrorBanner message={error} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue" value={show(formatINR(d?.revenue))} hint={`Last ${days} days`} icon={<IndianRupee className="h-4 w-4" />} />
        <StatCard label="Orders" value={show(d?.orders)} icon={<ShoppingBag className="h-4 w-4" />} />
        <StatCard label="Average order" value={show(formatINR(d?.averageOrderValue))} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="New customers" value={show(d?.newCustomers)} hint="Verified sign-ups" icon={<UserPlus className="h-4 w-4" />} />
      </div>

      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Revenue per day</h2>
          <button type="button" onClick={() => setShowTable((v) => !v)} className="text-xs font-semibold text-muted underline">
            {showTable ? "Show chart" : "Show as table"}
          </button>
        </div>
        {!d ? (
          <p className="py-16 text-center text-sm text-muted" role="status">{loading ? "Loading…" : "No data"}</p>
        ) : showTable ? (
          <DailyTable data={d} />
        ) : (
          <DailyColumns data={d} />
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Best-selling products" empty={!d?.topProducts.length} loading={loading}>
          <BarList
            rows={(d?.topProducts ?? []).map((p) => ({ key: String(p.productId), label: p.name, value: p.units, note: formatINR(p.revenue) }))}
            format={(v) => `${v} sold`}
          />
        </Panel>
        <Panel title="Revenue by category" empty={!d?.categories.length} loading={loading}>
          <BarList
            rows={(d?.categories ?? []).map((c) => ({ key: c.category, label: c.category, value: Number(c.revenue), note: `${c.units} items` }))}
            format={(v) => formatINR(v)}
          />
        </Panel>
        <Panel title="Orders by status" empty={!d?.ordersByStatus.length} loading={loading}>
          <BarList
            rows={(d?.ordersByStatus ?? []).map((s) => ({ key: s.name, label: s.name.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), value: s.count }))}
            format={(v) => String(v)}
          />
        </Panel>
        <Panel title="Payment methods" empty={!d?.paymentMethods.length} loading={loading}>
          <BarList
            rows={(d?.paymentMethods ?? []).map((p) => ({ key: p.name, label: p.name === "COD" ? "Cash on delivery" : p.name, value: p.count }))}
            format={(v) => `${v} orders`}
          />
        </Panel>
      </div>
    </>
  );
}

function Panel({ title, empty, loading, children }: { title: string; empty: boolean; loading: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {empty ? <p className="text-sm text-muted">{loading ? "Loading…" : "No orders in this period yet."}</p> : children}
    </section>
  );
}

/** Horizontal bars, one hue (magnitude), value text in ink colours, bars anchored at zero. */
function BarList({ rows, format }: { rows: { key: string; label: string; value: number; note?: string }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${format(r.value)}${r.note ? ` · ${r.note}` : ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-fg">{r.label}</span>
            <span className="flex-none tabular-nums text-fg">
              {format(r.value)}
              {r.note && <span className="ml-2 text-xs text-muted">{r.note}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-subtle">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Daily revenue columns with a hover tooltip (revenue, orders, sign-ups). One series, so no legend. */
function DailyColumns({ data }: { data: AnalyticsInsights }) {
  const [hover, setHover] = useState<number | null>(null);
  const points = data.daily;
  const W = 720;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 52 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = useMemo(() => {
    const m = Math.max(0, ...points.map((p) => Number(p.revenue)));
    if (m === 0) return 1000;
    const step = 10 ** Math.floor(Math.log10(m));
    return Math.ceil(m / step) * step;
  }, [points]);
  const slot = innerW / points.length;
  const barW = Math.max(2, Math.min(28, slot - 2)); // 2px surface gap between neighbours
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const labelEvery = Math.ceil(points.length / 8);
  const hovered = hover == null ? null : points[hover];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Revenue per day for the last ${data.days} days`}>
        {ticks.map((t) => {
          const y = pad.top + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="var(--qk-border)" strokeWidth={1} />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--qk-muted)">{compactINR(t)}</text>
            </g>
          );
        })}
        {points.map((p, i) => {
          const v = Number(p.revenue);
          const h = (v / max) * innerH;
          const x = pad.left + i * slot + (slot - barW) / 2;
          const y = pad.top + innerH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={p.date}>
              {v > 0 && (
                <path
                  d={`M${x},${pad.top + innerH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${pad.top + innerH} Z`}
                  fill="var(--qk-accent)"
                  opacity={hover == null || hover === i ? 1 : 0.45}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--qk-muted)">{shortDate(p.date)}</text>
              )}
              {/* Hit target: the whole column slot, taller than the mark. */}
              <rect
                x={pad.left + i * slot}
                y={pad.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-2 z-10 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-card"
          style={{ left: `${Math.min(80, Math.max(5, ((pad.left + (hover! + 0.5) * slot) / W) * 100))}%`, transform: "translateX(-50%)" }}
        >
          <p className="font-semibold text-fg">{shortDate(hovered.date)}</p>
          <p className="text-fg tabular-nums">{formatINR(hovered.revenue)}</p>
          <p className="text-muted tabular-nums">{hovered.orders} orders · {hovered.registrations} sign-ups</p>
        </div>
      )}
    </div>
  );
}

function DailyTable({ data }: { data: AnalyticsInsights }) {
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-surface text-xs uppercase text-muted">
          <tr>
            <th className="py-2">Date</th>
            <th className="py-2 text-right">Revenue</th>
            <th className="py-2 text-right">Orders</th>
            <th className="py-2 text-right">Sign-ups</th>
          </tr>
        </thead>
        <tbody>
          {[...data.daily].reverse().map((p) => (
            <tr key={p.date} className="border-t border-line">
              <td className="py-1.5">{shortDate(p.date)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatINR(p.revenue)}</td>
              <td className="py-1.5 text-right tabular-nums">{p.orders}</td>
              <td className="py-1.5 text-right tabular-nums">{p.registrations}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
