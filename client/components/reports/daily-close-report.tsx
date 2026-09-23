"use client";

import { useRef, useState } from "react";
import { useDailyCloseData } from "@/lib/hooks/use-daily-close-data";
import { useStore } from "@/lib/context/store-context";
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
  const { storeProfile } = useStore();
  const { user } = useAuth();
  // Profit is hidden from cashiers specifically, not everyone who isn't
  // admin - an auditor has read access to every sale/return/expense this
  // figure is derived from, so there's no reason to hide the derived number.
  const showProfit = user?.role !== "sales_staff";
  const {
    currencyCode,
    salesToday,
    returnsToday,
    aggregatedTotals,
    totalProfit,
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
    <div className="space-y-4 sm:space-y-6">
      <DailyCloseHeader reportDate={reportDate} />

      <div ref={printRef} className="space-y-4 sm:space-y-6">
        <DailyCloseMetrics
          currencyCode={currencyCode}
          aggregatedTotals={aggregatedTotals}
          totalProfit={totalProfit}
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
          totalProfit,
          topSellingMeds,
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
