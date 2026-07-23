"use client";

import { useState } from "react";
import { useDailyCloseData } from "@/lib/hooks/use-daily-close-data";
import { TransactionDetailsDialog } from "@/components/pos/transaction-details-dialog";

import { DailyCloseHeader } from "./daily-close/daily-close-header";
import { DailyCloseMetrics } from "./daily-close/daily-close-metrics";
import { PaymentBreakdownCard } from "./daily-close/payment-breakdown-card";
import { HighestSellingProductsCard } from "./daily-close/highest-selling-products-card";
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

      <div className="bg-[#F3F7FF] border border-[#D6E2FC] rounded-[16px] px-5 py-4 flex flex-col md:flex-row md:items-center gap-4 shadow-sm">
        <div className="w-9 h-9 rounded-[8px] bg-[#EAF0FE] text-primary flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-semibold text-foreground">Daily Close Ready</div>
          <div className="text-[12.5px] text-muted-foreground mt-0.5">
            This report aggregates all transactions made on {reportDate}. Use this for end-of-day reconciliation.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 bg-background border px-3.5 py-2 rounded-lg text-[12.5px] font-semibold text-foreground hover:bg-secondary/50 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 21v-8H7v8M7 3v5h8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Download Backup
          </button>
          <button className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3.5 py-2 rounded-lg text-[12.5px] font-semibold hover:bg-primary/90 transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 11-2.64-6.36M21 4v6h-6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Cloud Sync Now
          </button>
        </div>
      </div>

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
