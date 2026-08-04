"use client";

import { useCallback } from "react";
import {
  fetchSalesReportData,
  fetchStockBatchReportData,
  fetchProfitLossReportData,
  fetchCustomerReportData,
  fetchExpensesReportData,
} from "@/lib/db/queries/reports";
import { useStore } from "@/lib/context/store-context";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import {
  generateReportPdfBlob,
  downloadBlob,
  openBlobForPrint,
} from "@/lib/utils/report-pdf";

export interface RecentDownload {
  id: string;
  name: string;
  type: string;
  generatedAt: string;
  sizeLabel: string;
}

const STORAGE_KEY = "drx_recent_downloads";

const REPORT_CONFIG = {
  sales: {
    label: "Sales Report",
    filenamePrefix: "Sales_Report",
    fetch: fetchSalesReportData,
    headers: ["Transaction #", "Date", "Customer", "Payment Method", "Subtotal", "Tax", "Discount", "Total", "Refunded", "Net Total", "Status"],
    dateColumns: ["Date"],
    takesDateRange: true,
  },
  stock_batches: {
    label: "Inventory Valuation Report",
    filenamePrefix: "Inventory_Valuation_Report",
    fetch: () => fetchStockBatchReportData(),
    headers: ["Product", "Generic Name", "Form", "Strength", "Stock Qty", "Reorder Level", "Cost Price", "Selling Price", "Stock Value", "Nearest Expiry"],
    dateColumns: ["Nearest Expiry"],
    takesDateRange: false,
  },
  "profit-loss": {
    label: "Profit & Loss",
    filenamePrefix: "ProfitLoss",
    fetch: fetchProfitLossReportData,
    headers: ["Month", "Revenue", "COGS", "Gross Profit", "Expenses", "Net Profit", "Margin %"],
    dateColumns: [],
    takesDateRange: true,
  },
  customers: {
    label: "Customer Report",
    filenamePrefix: "Customer_Report",
    fetch: () => fetchCustomerReportData(),
    headers: ["Name", "Phone", "Email", "Loyalty Points", "Outstanding Balance", "Credit Limit", "Total Purchases", "Total Spent", "Last Purchase"],
    dateColumns: ["Last Purchase"],
    takesDateRange: false,
  },
  expenses: {
    label: "Expenses Report",
    filenamePrefix: "Expenses",
    fetch: fetchExpensesReportData,
    headers: ["Date", "Category", "Description", "Vendor", "Amount", "Payment Method", "Reference"],
    dateColumns: ["Date"],
    takesDateRange: true,
  },
} as const;

export type ReportId = keyof typeof REPORT_CONFIG;

function formatCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const headerRow = headers.map(escape).join(",");
  const dataRows = rows.map((row) => headers.map((h) => escape(row[h])).join(","));
  return [headerRow, ...dataRows].join("\n");
}

function triggerCsvDownload(content: string, filename: string): number {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  return downloadBlob(blob, filename);
}

function saveToRecent(name: string, type: string, bytes: number) {
  const existing: RecentDownload[] = JSON.parse(
    localStorage.getItem(STORAGE_KEY) || "[]"
  );
  const kb = (bytes / 1024).toFixed(1);
  const mb = (bytes / 1024 / 1024).toFixed(2);
  const sizeLabel = bytes > 1024 * 100 ? `${mb} MB` : `${kb} KB`;
  const entry: RecentDownload = {
    id: crypto.randomUUID(),
    name,
    type,
    generatedAt: new Date().toISOString(),
    sizeLabel,
  };
  const updated = [entry, ...existing].slice(0, 10);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return entry;
}

export function useReportExport() {
  const { storeProfile } = useStore();

  const getRows = useCallback(
    async (reportId: ReportId, dateFrom?: string, dateTo?: string) => {
      const config = REPORT_CONFIG[reportId];
      const rows = await (config.takesDateRange
        ? (config.fetch as (from?: string, to?: string) => Promise<Record<string, unknown>[]>)(dateFrom, dateTo)
        : (config.fetch as () => Promise<Record<string, unknown>[]>)());

      // The DB stores these as raw date/datetime strings — format them
      // consistently (dd/mm/yyyy) instead of leaking whatever precision
      // the underlying column happens to have (e.g. full ISO timestamps)
      // into the exported CSV/PDF.
      const dateColumns = config.dateColumns as readonly string[];
      if (dateColumns.length === 0) return rows;
      return rows.map((row) => {
        const formatted = { ...row };
        for (const col of dateColumns) {
          const value = formatted[col];
          if (typeof value === "string" || value instanceof Date) {
            formatted[col] = formatDateToDDMMYYYY(value);
          }
        }
        return formatted;
      });
    },
    [],
  );

  const exportReportCsv = useCallback(
    async (reportId: ReportId, dateFrom?: string, dateTo?: string) => {
      const config = REPORT_CONFIG[reportId];
      const rows = await getRows(reportId, dateFrom, dateTo);
      const csv = formatCsv(config.headers as unknown as string[], rows);
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `${config.filenamePrefix}_${dateStr}.csv`;
      const bytes = triggerCsvDownload(csv, filename);
      saveToRecent(filename, config.label, bytes);
    },
    [getRows],
  );

  const buildReportPdfBlob = useCallback(
    async (reportId: ReportId, dateFrom?: string, dateTo?: string) => {
      const config = REPORT_CONFIG[reportId];
      const rows = await getRows(reportId, dateFrom, dateTo);
      const subtitle =
        dateFrom && dateTo
          ? `${new Date(dateFrom).toLocaleDateString()} – ${new Date(dateTo).toLocaleDateString()}`
          : undefined;
      return generateReportPdfBlob({
        storeName: storeProfile?.name || "Store",
        title: config.label,
        subtitle,
        headers: config.headers as unknown as string[],
        rows,
      });
    },
    [getRows, storeProfile?.name],
  );

  const downloadReportPdf = useCallback(
    async (reportId: ReportId, dateFrom?: string, dateTo?: string) => {
      const config = REPORT_CONFIG[reportId];
      const blob = await buildReportPdfBlob(reportId, dateFrom, dateTo);
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `${config.filenamePrefix}_${dateStr}.pdf`;
      const bytes = downloadBlob(blob, filename);
      saveToRecent(filename, config.label, bytes);
    },
    [buildReportPdfBlob],
  );

  const printReport = useCallback(
    async (reportId: ReportId, dateFrom?: string, dateTo?: string) => {
      const blob = await buildReportPdfBlob(reportId, dateFrom, dateTo);
      openBlobForPrint(blob);
    },
    [buildReportPdfBlob],
  );

  const getRecentDownloads = useCallback((): RecentDownload[] => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }, []);

  return {
    exportReportCsv,
    downloadReportPdf,
    printReport,
    getRecentDownloads,
    reportList: Object.entries(REPORT_CONFIG).map(([id, c]) => ({
      id: id as ReportId,
      label: c.label,
    })),
  };
}
