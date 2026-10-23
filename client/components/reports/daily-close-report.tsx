"use client";

import { useRef, useState } from "react";
import { useDailyCloseData } from "@/lib/hooks/use-daily-close-data";
import { useStore } from "@/lib/context/store-context";
import { useDisplayName } from "@/lib/hooks/use-uppercase-display";
import { useAuth } from "@/lib/context/auth-context";
import { TransactionDetailsDialog } from "@/components/pos/transaction-details-dialog";
import type { Sale } from "@/lib/types/sale";

import { DailyCloseHeader } from "./daily-close/daily-close-header";
import { DailyCloseMetrics } from "./daily-close/daily-close-metrics";
import { PaymentBreakdownCard } from "./daily-close/payment-breakdown-card";
import { HighestSellingProductsCard } from "./daily-close/highest-selling-products-card";
import { DailyCloseActions } from "./daily-close/daily-close-actions";
import { SalesListModal } from "./daily-close/sales-list-modal";
import { RefundsListModal } from "./daily-close/refunds-list-modal";

interface DailyCloseReportProps {
  reportDate: string;
}

export function DailyCloseReport({ reportDate }: DailyCloseReportProps) {
  const displayName = useDisplayName();
  const { storeProfile } = useStore();
  const { user } = useAuth();
  // Profit is hidden from cashiers specifically, not everyone who isn't admin - an auditor has read access to every sale/ret…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-reports-daily-close-report-tsx-L29
  const showProfit = user?.role !== "sales_staff";
  const {
    currencyCode,
    salesToday,
    returnsToday,
    aggregatedTotals,
    cashExpenses,
    totalProfit,
    profitAfterExpenses,
    netCashExpected,
    netCashBreakdown,
    profitBreakdown,
    profitAfterExpensesBreakdown,
    topSellingMeds,
    exportToCSV,
  } = useDailyCloseData(reportDate, showProfit);

  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
  const [isRefundsModalOpen, setIsRefundsModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const printRef = useRef<HTMLDivElement>(null);

  const openSalesModal = (filter: string) => {
    if (filter === "refunds") {
      setIsRefundsModalOpen(true);
      return;
    }
    setPaymentFilter(filter);
    setIsSalesModalOpen(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6 mb-20 lg:mb-4">
      <DailyCloseHeader reportDate={reportDate} />

      <div ref={printRef} className="space-y-4 sm:space-y-6">
        <DailyCloseMetrics
          currencyCode={currencyCode}
          aggregatedTotals={aggregatedTotals}
          cashExpenses={cashExpenses}
          netCashBreakdown={netCashBreakdown}
          profitBreakdown={profitBreakdown}
          profitAfterExpensesBreakdown={profitAfterExpensesBreakdown}
          openSalesModal={openSalesModal}
          showProfit={showProfit}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PaymentBreakdownCard
            currencyCode={currencyCode}
            aggregatedTotals={aggregatedTotals}
          />

          <HighestSellingProductsCard
            currencyCode={currencyCode}
            topSellingMeds={topSellingMeds}
          />
        </div>
      </div>

      <DailyCloseActions
        exportToCSV={exportToCSV}
        printRef={printRef}
        pdfInput={{
          storeName: storeProfile?.name || "Store",
          reportDate,
          currencyCode,
          aggregatedTotals,
          cashExpenses,
          netCashExpected,
          totalProfit,
          profitAfterExpenses,
          topSellingMeds: topSellingMeds.map((med) => ({
            ...med,
            name: displayName(med.name),
          })),
          showProfit,
        }}
      />

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

      <RefundsListModal
        isOpen={isRefundsModalOpen}
        onOpenChange={setIsRefundsModalOpen}
        reportDate={reportDate}
        returnsToday={returnsToday}
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
