"use client";

import { useState } from "react";
import { useDailyCloseData } from "@/lib/hooks/use-daily-close-data";
import { TransactionDetailsDialog } from "@/components/pos/transaction-details-dialog";

import { DailyCloseHeader } from "./daily-close/daily-close-header";
import { DailyCloseMetrics } from "./daily-close/daily-close-metrics";
import { PaymentBreakdownCard } from "./daily-close/payment-breakdown-card";
import { HighestSellingMedicinesCard } from "./daily-close/highest-selling-medicines-card";
import { DailyCloseActions } from "./daily-close/daily-close-actions";
import { SalesListModal } from "./daily-close/sales-list-modal";

export function DailyCloseReport() {
  const {
    currencyCode,
    reportDate,
    setReportDate,
    salesToday,
    aggregatedTotals,
    totalProfit,
    topSellingMeds,
    exportToCSV,
  } = useDailyCloseData();

  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [paymentFilter, setPaymentFilter] = useState("all");

  const openSalesModal = (filter: string) => {
    setPaymentFilter(filter);
    setIsSalesModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <DailyCloseHeader
        reportDate={reportDate}
        setReportDate={setReportDate}
      />

      <DailyCloseMetrics
        currencyCode={currencyCode}
        aggregatedTotals={aggregatedTotals}
        totalProfit={totalProfit}
        openSalesModal={openSalesModal}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PaymentBreakdownCard
          currencyCode={currencyCode}
          aggregatedTotals={aggregatedTotals}
        />

        <HighestSellingMedicinesCard
          currencyCode={currencyCode}
          topSellingMeds={topSellingMeds}
        />
      </div>

      <DailyCloseActions exportToCSV={exportToCSV} />

      <SalesListModal
        isOpen={isSalesModalOpen}
        onOpenChange={setIsSalesModalOpen}
        reportDate={reportDate}
        salesToday={salesToday}
        paymentFilter={paymentFilter}
        setPaymentFilter={setPaymentFilter}
        setSelectedSale={setSelectedSale}
        currencyCode={currencyCode}
      />

      <TransactionDetailsDialog
        sale={selectedSale}
        open={!!selectedSale}
        onOpenChange={(open) => !open && setSelectedSale(null)}
      />
    </div>
  );
}
