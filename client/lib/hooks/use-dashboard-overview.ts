import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDashboardOverviewData } from "@/lib/db/queries/reports";
import { useStockBatchStats } from "@/lib/hooks/use-stock-batch-stats";
import { useStore } from "@/lib/context/store-context";
import { useAuth, checkCanViewAllActivity } from "@/lib/context/auth-context";
import { formatCurrency } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import type { DashboardActivity, ActivityFeedItem } from "@/lib/types/dashboard-activity";

export type SalesComparison =
  | { state: "none" }
  | { state: "up" | "down"; percent: number };

/** All business logic for the Dashboard home page — stats, recent activity feed, and the sales-vs-yesterday comparison. */
export function useDashboardOverview() {
  const { t, storeProfile } = useStore();
  const { user } = useAuth();
  const [selectedActivity, setSelectedActivity] =
    useState<ActivityFeedItem | null>(null);

  // Single source of truth for all stock-batch-related stat cards
  const stock_batchStats = useStockBatchStats();

  const viewerId = checkCanViewAllActivity(user?.role) ? undefined : user?.id;
  const { data: dashboardData } = useQuery({
    ...queryKeys.dashboard.overview(viewerId),
    queryFn: () => getDashboardOverviewData(viewerId),
  });

  const salesToday = dashboardData?.salesToday
    ? [dashboardData.salesToday]
    : [];
  const refundsToday = dashboardData?.refundsToday
    ? [dashboardData.refundsToday]
    : [];
  const recentActivities = dashboardData?.recentActivities || [];
  const salesYesterday = dashboardData?.salesYesterday?.total || 0;
  const activeCategories = dashboardData?.activeCategories || 0;

  const todayRevenue =
    (salesToday[0]?.total || 0) - (refundsToday[0]?.total || 0);

  let salesComparison: SalesComparison = { state: "none" };
  if (salesYesterday > 0) {
    const diff = todayRevenue - salesYesterday;
    const percent = (Math.abs(diff) / salesYesterday) * 100;
    salesComparison = { state: diff >= 0 ? "up" : "down", percent };
  } else if (todayRevenue > 0) {
    salesComparison = { state: "up", percent: 100 };
  }

  const stats = {
    totalProducts: stock_batchStats.activeProducts,
    dailySalesRevenue: todayRevenue,
    expiringSoonCount: stock_batchStats.expiringSoonCount,
    lowStockCount: stock_batchStats.lowStockCount,
    missingExpiryCount: stock_batchStats.missingExpiryCount,
  };

  const activities = recentActivities.slice(0, 5).map((activity: DashboardActivity) => {
    let message = "";
    let amount = "";

    if (activity.activity_type === "sale") {
      message = activity.prescription_id
        ? `Rx sale: ${activity.transaction_number || activity.id.slice(0, 8)}`
        : `${t("product")} sale: ${activity.transaction_number || activity.id.slice(0, 8)}`;
      const val = Number(
        activity.total_amount !== undefined
          ? activity.total_amount
          : activity.total,
      );
      amount = isNaN(val) ? "N/A" : formatCurrency(val, storeProfile?.currency);
    } else if (activity.activity_type === "stock_movement") {
      message = `Stock ${activity.movement_type}: ${Math.abs(activity.quantity ?? 0)} units`;
      const val = Number(activity.total_cost);
      if (!isNaN(val) && val > 0) {
        amount = formatCurrency(val, storeProfile?.currency);
      }
    } else if (activity.activity_type === "prescription") {
      message = `Prescription logged: ${activity.patient_name || "Patient"}`;
      amount = activity.total_cost
        ? formatCurrency(activity.total_cost, storeProfile?.currency)
        : "";
    } else if (activity.activity_type === "expense") {
      message = `Expense: ${activity.category}`;
      amount = formatCurrency(activity.amount ?? 0, storeProfile?.currency);
    } else if (activity.activity_type === "purchase_order") {
      message = `Procurement PO: ${activity.po_number || activity.id.slice(0, 8)}`;
      amount = activity.total_amount
        ? formatCurrency(activity.total_amount, storeProfile?.currency)
        : "";
    }

    return {
      id: activity.id,
      type: activity.activity_type,
      // Distinguishes a prescription-dispensed sale from a walk-in sale for
      // icon/color purposes only — `type` stays "sale" so the transaction
      // details dialog click-handler (keyed on type === "sale") still works.
      displayType:
        activity.activity_type === "sale" && activity.prescription_id
          ? "prescription_sale"
          : activity.activity_type,
      message,
      timestamp:
        activity.created_at || activity.date || activity.transaction_date || "",
      amount,
      rawSale: activity.activity_type === "sale" ? activity : undefined,
      rawActivity: activity,
    };
  });

  const getActivityColor = (type: string) => {
    switch (type) {
      case "sale":
        return "bg-green-500/10 text-green-600";
      case "prescription_sale":
        return "bg-violet-500/10 text-violet-600";
      case "stock_movement":
        return "bg-blue-500/10 text-blue-600";
      case "prescription":
        return "bg-purple-500/10 text-purple-600";
      case "expense":
        return "bg-red-500/10 text-red-600";
      case "purchase_order":
        return "bg-orange-500/10 text-orange-600";
      case "alert":
        return "bg-red-500/10 text-red-600";
      default:
        return "bg-gray-500/10 text-gray-600";
    }
  };

  return {
    t,
    storeProfile,
    selectedActivity,
    setSelectedActivity,
    stock_batchStats,
    stats,
    activeCategories,
    salesToday,
    salesComparison,
    activities,
    getActivityColor,
    isLoading: stock_batchStats.loading && !salesToday.length,
  };
}
