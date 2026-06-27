"use client";

import { useCallback } from "react";
import {
  fetchSalesReportData,
  fetchStockBatchReportData,
  fetchProfitLossReportData,
  fetchCustomerReportData,
  fetchExpensesReportData,
} from "./report-queries";

export interface RecentDownload {
  id: string;
  name: string;
  type: string;
  generatedAt: string;
  sizeLabel: string;
}

const STORAGE_KEY = "drx_recent_downloads";

function formatCsv(headers: string[], rows: Record<string, any>[]): string {
  const escape = (v: any) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const headerRow = headers.map(escape).join(",");
  const dataRows = rows.map((row) => headers.map((h) => escape(row[h])).join(","));
  return [headerRow, ...dataRows].join("\n");
}

function triggerDownload(content: string, filename: string): number {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return blob.size;
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
  const exportSalesReport = useCallback(async (dateFrom?: string, dateTo?: string) => {
    const rows = await fetchSalesReportData(dateFrom, dateTo);
    const headers = ["Transaction #", "Date", "Customer", "Payment Method", "Subtotal", "Tax", "Discount", "Total", "Status"];
    const csv = formatCsv(headers, rows);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Sales_Report_${dateStr}.csv`;
    const bytes = triggerDownload(csv, filename);
    saveToRecent(filename, "Sales Report", bytes);
  }, []);

  const exportStockBatchReport = useCallback(async () => {
    const rows = await fetchStockBatchReportData();
    const headers = ["Product", "Generic Name", "Form", "Strength", "Stock Qty", "Reorder Level", "Cost Price", "Selling Price", "Stock Value", "Nearest Expiry"];
    const csv = formatCsv(headers, rows);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `StockBatch_Report_${dateStr}.csv`;
    const bytes = triggerDownload(csv, filename);
    saveToRecent(filename, "StockBatch Report", bytes);
  }, []);

  const exportProfitLossReport = useCallback(async (dateFrom?: string, dateTo?: string) => {
    const rows = await fetchProfitLossReportData(dateFrom, dateTo);
    const headers = ["Month", "Revenue", "COGS", "Gross Profit", "Expenses", "Net Profit", "Margin %"];
    const csv = formatCsv(headers, rows);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `ProfitLoss_${dateStr}.csv`;
    const bytes = triggerDownload(csv, filename);
    saveToRecent(filename, "Profit & Loss", bytes);
  }, []);

  const exportCustomerReport = useCallback(async () => {
    const rows = await fetchCustomerReportData();
    const headers = ["Name", "Phone", "Email", "Loyalty Points", "Outstanding Balance", "Credit Limit", "Total Purchases", "Total Spent", "Last Purchase"];
    const csv = formatCsv(headers, rows);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Customer_Report_${dateStr}.csv`;
    const bytes = triggerDownload(csv, filename);
    saveToRecent(filename, "Customer Report", bytes);
  }, []);

  const exportExpensesReport = useCallback(async (dateFrom?: string, dateTo?: string) => {
    const rows = await fetchExpensesReportData(dateFrom, dateTo);
    const headers = ["Date", "Category", "Description", "Vendor", "Amount", "Payment Method", "Reference"];
    const csv = formatCsv(headers, rows);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Expenses_${dateStr}.csv`;
    const bytes = triggerDownload(csv, filename);
    saveToRecent(filename, "Expenses Report", bytes);
  }, []);

  const getRecentDownloads = useCallback((): RecentDownload[] => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }, []);

  return {
    exportSalesReport,
    exportStockBatchReport,
    exportProfitLossReport,
    exportCustomerReport,
    exportExpensesReport,
    getRecentDownloads,
  };
}
