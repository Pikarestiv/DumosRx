"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldAlert, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuthStore, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";
import {
  TREND_WINDOWS,
  TREND_WINDOW_LABELS,
  useAdminTrends,
  type TrendWindow,
} from "@/lib/api/admin-hooks-trends";
import { TrendChart } from "@/components/admin/trends/trend-chart";
import { CashCollectedChart } from "@/components/admin/trends/cash-collected-chart";

function NotAvailable() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="p-4 bg-muted text-muted-foreground rounded-full">
        <ShieldAlert className="h-10 w-10" />
      </div>
      <div>
        <p className="font-bold text-foreground">This page is only available to super admins</p>
        <p className="text-sm text-muted-foreground mt-1">
          Trends include platform revenue, so they are restricted.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/admin">Back to Overview</Link>
      </Button>
    </div>
  );
}

export default function TrendsPage() {
  const { user } = useAdminAuthStore();

  if (!checkIsSuperAdmin(user?.role)) {
    return <NotAvailable />;
  }

  return <TrendsContent />;
}

function TrendsContent() {
  const [window, setWindow] = useState<TrendWindow>("6m");
  const { data } = useAdminTrends(window);
  const granularity = data?.granularity ?? (window === "30d" ? "day" : "month");

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
            <TrendingUp className="h-8 w-8 text-indigo-500" />
            Trends
          </h1>
          <p className="text-muted-foreground mt-1">
            Which way the platform is moving, from measured events only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {TREND_WINDOWS.map((option) => (
            <Button
              key={option}
              variant={option === window ? "default" : "outline"}
              size="sm"
              onClick={() => setWindow(option)}
            >
              {TREND_WINDOW_LABELS[option]}
            </Button>
          ))}
        </div>
      </div>

      <CashCollectedChart series={data?.cash_collected} granularity={granularity} />

      <div className="grid lg:grid-cols-2 gap-6">
        <TrendChart
          title="New paid subscriptions"
          description="Distinct owners starting a paid plan, not renewals."
          series={data?.new_paid_subscriptions}
          granularity={granularity}
          valueKeys={["count"]}
        />
        <TrendChart
          title="Trial starts"
          description="Distinct owners beginning a trial."
          series={data?.trial_starts}
          granularity={granularity}
          valueKeys={["count"]}
        />
        <TrendChart
          title="Store signups"
          description="Counted in the month they signed up, demo stores excluded."
          series={data?.store_signups}
          granularity={granularity}
          valueKeys={["count"]}
        />
        <TrendChart
          title="Churn"
          description="Owners whose subscription lapsed past the grace window."
          series={data?.churn}
          granularity={granularity}
          valueKeys={["count"]}
        />
      </div>
    </div>
  );
}
