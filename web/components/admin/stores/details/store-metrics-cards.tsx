"use client";

import { Activity, Boxes, ClipboardList, TrendingDown, TrendingUp } from "lucide-react";
import { DetailCard, Field } from "@/components/admin/stores/details/store-detail-primitives";
import type { AdminStoreDetail } from "@/lib/types/admin";

const formatGrowth = (pct: number | null) => {
  if (pct === null) return "New activity";
  return `${pct > 0 ? "+" : ""}${pct}%`;
};

function GrowthPill({ pct, label }: { pct: number | null; label: string }) {
  const positive = pct === null || pct >= 0;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black ${
          positive
            ? "bg-emerald-500/10 text-emerald-600"
            : "bg-rose-500/10 text-rose-600"
        }`}
      >
        {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {formatGrowth(pct)}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
    </div>
  );
}

export function StoreBusinessMetricsCard({ store }: { store: AdminStoreDetail }) {
  const metrics = store.business_metrics;

  if (!metrics) return null;

  const peak = Math.max(...metrics.monthly_trend.map((month) => month.revenue_raw), 1);

  return (
    <DetailCard title="Business Metrics" icon={<TrendingUp className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Lifetime Revenue" value={metrics.revenue} />
        <Field label="Orders" value={metrics.order_count.toLocaleString()} />
        <Field label="Average Order Value" value={metrics.average_order_value} />
        <Field label="Trading Days" value={metrics.active_days.toLocaleString()} />
        <Field label="First Sale" value={metrics.first_sale_at} />
        <Field label="Last Sale" value={metrics.last_sale_at} />
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <GrowthPill pct={metrics.revenue_growth_pct} label={`revenue vs prior ${metrics.window_days}d`} />
        <GrowthPill pct={metrics.order_growth_pct} label={`orders vs prior ${metrics.window_days}d`} />
      </div>

      <div className="space-y-2 pt-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Revenue, last {metrics.monthly_trend.length} months
        </p>
        {metrics.monthly_trend.map((month) => (
          <div key={month.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[10px] font-bold uppercase text-slate-400">
              {month.label}
            </span>
            <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500"
                style={{ width: `${Math.round((month.revenue_raw / peak) * 100)}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs font-bold text-slate-600 dark:text-slate-300">
              {month.revenue}
            </span>
          </div>
        ))}
      </div>
    </DetailCard>
  );
}

export function StoreOperationalMetricsCard({ store }: { store: AdminStoreDetail }) {
  const metrics = store.operational_metrics;

  if (!metrics) return null;

  return (
    <DetailCard title="Operational Metrics" icon={<Activity className="h-4 w-4" />}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Staff Accounts" value={metrics.staff_count.toLocaleString()} />
        {/* A-142: device_count can only ever be 0 or 1 (a single device_id
            column, not a real per-device table), so it never actually
            counts anything — show it as the yes/no it really is instead
            of implying a count that would hide a store's other devices. */}
        <Field label="Device Registered" value={metrics.device_count > 0 ? "Yes" : "No"} />
        <Field label="Device ID" value={metrics.device_id} mono />
        <Field label="Active Sessions" value={metrics.active_sessions.toLocaleString()} />
        <Field
          label="Last Active"
          value={
            metrics.last_active_by
              ? `${metrics.last_active_human} — ${metrics.last_active_by}`
              : metrics.last_active_human
          }
        />
        <Field label="Sync Health" value={metrics.sync_health} />
      </div>

      <div className="grid grid-cols-2 gap-4 pt-2">
        <Field
          label="Inventory"
          value={
            <span className="inline-flex items-center gap-2">
              <Boxes className="h-3.5 w-3.5 text-slate-400" />
              {metrics.inventory.products.toLocaleString()} products ·{" "}
              {metrics.inventory.categories.toLocaleString()} categories
            </span>
          }
        />
        <Field
          label="Book"
          value={`${metrics.inventory.customers.toLocaleString()} customers · ${metrics.inventory.suppliers.toLocaleString()} suppliers`}
        />
        <Field
          label="Stock Adjustments"
          value={
            <span className="inline-flex items-center gap-2">
              <ClipboardList className="h-3.5 w-3.5 text-slate-400" />
              {metrics.stock_activity.movements.toLocaleString()} total ·{" "}
              {metrics.stock_activity.movements_last_window.toLocaleString()} recent
            </span>
          }
        />
        <Field
          label="Stock Audits"
          value={`${metrics.stock_activity.audits.toLocaleString()} total · ${metrics.stock_activity.audits_last_window.toLocaleString()} recent`}
        />
      </div>
    </DetailCard>
  );
}
