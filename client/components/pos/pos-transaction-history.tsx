"use client";
import { TransactionMetrics } from './transaction-metrics';
import { TransactionFilters } from './transaction-filters';
import { TransactionList } from './transaction-list';

import React, { useState, useMemo } from "react";
import { isToday, isYesterday, parseISO } from "date-fns";


import { useAuth } from "@/lib/context/auth-context";
import { TransactionDetailsDialog } from "./transaction-details-dialog";
import { calculateNetSaleAmount, calculateAvgBasket } from "@/lib/utils/pos-calculations";
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
  const [dateFilter, setDateFilter] = useState<string>("All");
  const [paymentFilter, setPaymentFilter] = useState<string>("All");

  const { user } = useAuth();
  const canReturn =
    user?.role === "store_owner" ||
    user?.role === "admin" ||
    user?.role === "manager";

  // Compute metrics for "Today"
  const todayMetrics = useMemo(() => {
    const todaySales = (recentSales || []).filter(
      (s) => s.created_at && isToday(parseISO(s.created_at)),
    );

    // Net of refunds — a fully-returned sale should not still count toward
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
  }, [recentSales]);

  // Filtered sales
  const filteredSales = useMemo(() => {
    return (recentSales || []).filter((sale) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesCustomer = (sale.customer_name || "Walk-in")
          .toLowerCase()
          .includes(q);
        const matchesReceipt = sale.transaction_number
          ?.toLowerCase()
          .includes(q);
        if (!matchesCustomer && !matchesReceipt) return false;
      }

      if (dateFilter === "Today") {
        if (!sale.created_at || !isToday(parseISO(sale.created_at)))
          return false;
      } else if (dateFilter === "This week") {
        if (!sale.created_at) return false;
        const diff = Date.now() - new Date(sale.created_at).getTime();
        if (diff > 7 * 24 * 60 * 60 * 1000) return false;
      }

      if (paymentFilter !== "All") {
        if (sale.payment_method?.toLowerCase() !== paymentFilter.toLowerCase())
          return false;
      }

      return true;
    });
  }, [recentSales, searchQuery, dateFilter, paymentFilter]);

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

      <TransactionFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        paymentFilter={paymentFilter}
        setPaymentFilter={setPaymentFilter}
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

