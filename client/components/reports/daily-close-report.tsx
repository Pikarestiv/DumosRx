"use client";

import { useRef, useState } from "react";
import { useDailyCloseData } from "@/lib/hooks/use-daily-close-data";
import { useStore } from "@/lib/context/store-context";
import { TransactionDetailsDialog } from "@/components/pos/transaction-details-dialog";

import { DailyCloseHeader } from "./daily-close/daily-close-header";
import { DailyCloseMetrics } from "./daily-close/daily-close-metrics";
import { PaymentBreakdownCard } from "./daily-close/payment-breakdown-card";
import { HighestSellingProductsCard } from "./daily-close/highest-selling-products-card";
import { DailyCloseActions } from "./daily-close/daily-close-actions";
import { SalesListModal } from "./daily-close/sales-list-modal";

interface DailyCloseReportProps {
  reportDate: string;
}

export function DailyCloseReport({ reportDate }: DailyCloseReportProps) {
  const { storeProfile } = useStore();
  const {
    currencyCode,
    salesToday,
    aggregatedTotals,
    totalProfit,
    topSellingMeds,
    exportToCSV,
  } = useDailyCloseData(reportDate);

  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const printRef = useRef<HTMLDivElement>(null);

  const openSalesModal = (filter: string) => {
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

      <TransactionDetailsDialog
        sale={selectedSale}
        open={!!selectedSale}
        onOpenChange={(open) => !open && setSelectedSale(null)}
      />
    </div>
  );
}
