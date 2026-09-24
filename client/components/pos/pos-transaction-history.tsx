"use client";
import { TransactionMetrics } from './transaction-metrics';
import { TransactionFilters } from './transaction-filters';
import { TransactionList } from './transaction-list';

import React, { useState, useMemo } from "react";
import { isToday, isYesterday, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";

import { useAuth, checkIsAdmin, checkCanViewAllActivity } from "@/lib/context/auth-context";
import { TransactionDetailsDialog } from "./transaction-details-dialog";
import { calculateNetSaleAmount, calculateAvgBasket } from "@/lib/utils/pos-calculations";
import { genericFuzzySearch } from "@/lib/utils/search";
import { getRecentSales, getPendingResellerCommissionTotal } from "@/lib/db/queries/sales";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency, getLocalTodayDate } from "@/lib/utils";
import type { DateRangeValue } from "@/components/ui/date-range-picker";
import type { SaleWithDetails } from "@/lib/types/sale";

// ============================================================================
// Types
// ============================================================================

interface POSTransactionHistoryProps {
  recentSales: SaleWithDetails[];
  onReturnClick: (sale: SaleWithDetails) => void;
  currencyCode?: string;
}

// ============================================================================
// Main Component
// ============================================================================

export function POSTransactionHistory({
  recentSales,
  onReturnClick,
  currencyCode,
}: POSTransactionHistoryProps) {
  const [selectedSale, setSelectedSale] = useState<SaleWithDetails | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>({});
  const [paymentFilter, setPaymentFilter] = useState<string>("All");
  const [saleTypeFilter, setSaleTypeFilter] = useState<string>("All");

  const { user } = useAuth();
  // Was only checking the literal strings "store_owner"/"admin"/"manager".
  // Silently excluded super_admin (a real bug: the platform's own top role
  // couldn't process a return) and every other seeded role, since exact-
  // string checks don't recognize role variants the way checkIsAdmin does.
  const canReturn = checkIsAdmin(user?.role);
  const canViewAllActivity = checkCanViewAllActivity(user?.role);

  // Surfaced only while filtering to reseller sales, replacing the summary
  // card the old standalone Reseller Commission tab used to show.
  const { data: pendingCommissionTotal } = useQuery({
    ...queryKeys.reseller.commissionPendingTotal(),
    queryFn: () => getPendingResellerCommissionTotal(),
    enabled: canReturn && saleTypeFilter === "Reseller",
  });

  // The `recentSales` prop is a fixed 100-row snapshot (see usePOSData) -
  // fine as the default view, but a picked date range can reach further back
  // than those 100 rows cover. Once a range is picked, fetch it directly
  // (unbounded by that snapshot) instead of filtering the prop in memory.
  const rangeUserId = canViewAllActivity ? undefined : user?.id;
  const { data: rangeSales } = useQuery({
    ...queryKeys.sales.recent(rangeUserId, dateRange),
    queryFn: () => getRecentSales(rangeUserId, dateRange),
    enabled: !!dateRange.from,
  });
  const salesSource = dateRange.from ? rangeSales : recentSales;

  // Today's metric cards are fetched date-scoped in SQL rather than derived
  // from the `recentSales` prop: that prop is an undated, LIMIT-100 snapshot
  // (see usePOSData), so on a busy day - or any day following one with 100+
  // sales - today's earliest (or all of today's) rows were pushed out of the
  // snapshot before the client-side "is it today" filter ever ran, and the
  // cards understated revenue/transactions. Same pattern as
  // use-my-today-sales.ts, scoped to everyone when the viewer may see all
  // activity (matching how usePOSData scopes `recentSales`). Today's local
  // date is part of the query key, so the cards also roll over at midnight.
  const today = getLocalTodayDate();
  const { data: todaySalesData } = useQuery({
    ...queryKeys.sales.recent(rangeUserId, { from: today, to: today }),
    queryFn: () => getRecentSales(rangeUserId, { from: today, to: today }),
  });

  const todayMetrics = useMemo(() => {
    const todaySales = todaySalesData || [];

    // Net of refunds: a fully-returned sale should not still count toward
    // today's revenue, here or anywhere else that reads this figure.
    const totalSales = todaySales.reduce(
      (acc, s) =>
        acc +
        calculateNetSaleAmount(
          Number(s.total_amount) || Number(s.total) || 0,
          Number(s.total_refunded) || 0,
        ),
      0,
    );
    const transactions = todaySales.length;
    const refunded = todaySales.filter(
      (s) =>
        (Number(s.total_refunded) || 0) > 0 ||
        s.payment_status?.toLowerCase() === "refunded" ||
        s.status?.toLowerCase() === "refunded",
    ).length;
    const avgBasket = calculateAvgBasket(
      todaySales.map((s) => ({
        totalAmount: Number(s.total_amount) || Number(s.total) || 0,
        totalRefunded: Number(s.total_refunded) || 0,
      })),
    );

    return { totalSales, transactions, refunded, avgBasket };
  }, [todaySalesData]);

  // Filtered sales. Date range filtering happens at the query level (see
  // salesSource above) - not here - since a picked range can reach past the
  // `recentSales` prop's fixed 100-row snapshot.
  const filteredSales = useMemo(() => {
    const base = salesSource || [];
    let searched = base;

    if (searchQuery.trim()) {
      // genericFuzzySearch needs plain object keys, not a computed value, so
      // build small search-only records rather than passing salesSource
      // itself - the "||" join separator (see getRecentSales) is replaced
      // with a space first: it isn't whitespace, so leaving it in would glue
      // the item on one side of it onto the next token during tokenization
      // (Tier 3/4 both split on /\s+/), corrupting matches right at that
      // boundary.
      const searchable = base.map((sale) => ({
        id: sale.id,
        customer_name: sale.customer_name || "Walk-in",
        transaction_number: sale.transaction_number || "",
        item_names: sale.item_names?.replace(/\|\|/g, " ") || "",
      }));
      const { results } = genericFuzzySearch(searchQuery, searchable, [
        "customer_name",
        "transaction_number",
        "item_names",
      ]);
      // Filter the original array by matched id rather than returning
      // `results` directly, so relevance scoring doesn't reorder sales out
      // of their existing chronological order (filteredSales feeds
      // groupedSales' TODAY/YESTERDAY/THIS WEEK/OLDER buckets next).
      const matchedIds = new Set(results.map((r) => r.id));
      searched = base.filter((sale) => matchedIds.has(sale.id));
    }

    return searched.filter((sale) => {
      if (paymentFilter !== "All") {
        if (sale.payment_method?.toLowerCase() !== paymentFilter.toLowerCase())
          return false;
      }
      if (saleTypeFilter === "Reseller" && (!sale.is_reseller_sale || sale.markup_type === "store")) {
        return false;
      }
      if (saleTypeFilter === "StoreMarkup" && (!sale.is_reseller_sale || sale.markup_type !== "store")) {
        return false;
      }
      return true;
    });
  }, [salesSource, searchQuery, paymentFilter, saleTypeFilter]);

  // Group by relative date
  const groupedSales = useMemo(() => {
    const groups: { [key: string]: SaleWithDetails[] } = {
      TODAY: [],
      YESTERDAY: [],
      "THIS WEEK": [],
      OLDER: [],
    };

    filteredSales.forEach((sale) => {
      if (!sale.created_at) {
        groups["OLDER"].push(sale);
        return;
      }
      const d = parseISO(sale.created_at);
      if (isToday(d)) {
        groups["TODAY"].push(sale);
      } else if (isYesterday(d)) {
        groups["YESTERDAY"].push(sale);
      } else {
        const diff = Date.now() - d.getTime();
        if (diff <= 7 * 24 * 60 * 60 * 1000) {
          groups["THIS WEEK"].push(sale);
        } else {
          groups["OLDER"].push(sale);
        }
      }
    });

    return groups;
  }, [filteredSales]);

  return (
    <div className="flex flex-col gap-6">
      <TransactionMetrics metrics={todayMetrics} currencyCode={currencyCode} />

      {canReturn && saleTypeFilter === "Reseller" && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-900 px-4 py-3">
          <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
            Pending reseller commissions
          </span>
          <span className="text-sm font-bold text-violet-700 dark:text-violet-300">
            {formatCurrency(pendingCommissionTotal || 0, currencyCode)}
          </span>
        </div>
      )}

      <TransactionFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        dateRange={dateRange}
        setDateRange={setDateRange}
        paymentFilter={paymentFilter}
        setPaymentFilter={setPaymentFilter}
        saleTypeFilter={saleTypeFilter}
        setSaleTypeFilter={setSaleTypeFilter}
      />

      <TransactionList
        groupedSales={groupedSales}
        currencyCode={currencyCode}
        canReturn={canReturn}
        onSelectSale={setSelectedSale}
        onReturnClick={onReturnClick}
        hasFilters={filteredSales.length === 0}
      />

      <TransactionDetailsDialog
        sale={selectedSale}
        open={!!selectedSale}
        onOpenChange={(open) => !open && setSelectedSale(null)}
        currencyCode={currencyCode}
        onReturnClick={canReturn ? onReturnClick : undefined}
      />
    </div>
  );
}

