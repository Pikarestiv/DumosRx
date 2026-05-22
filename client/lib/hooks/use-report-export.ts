"use client";

import { useCallback } from "react";
import { query } from "@/lib/db";

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
    const params: string[] = [];
    let where = "s._deleted = 0";
    if (dateFrom) { where += " AND s.transaction_date >= ?"; params.push(dateFrom); }
    if (dateTo) { where += " AND s.transaction_date <= ?"; params.push(dateTo); }

    const rows = await query<Record<string, any>>(
      `SELECT
        s.transaction_number as "Transaction #",
        s.transaction_date as "Date",
        COALESCE(c.first_name || ' ' || COALESCE(c.last_name, ''), 'Walk-in') as "Customer",
        s.payment_method as "Payment Method",
        s.subtotal as "Subtotal",
        s.tax_amount as "Tax",
        s.discount_total as "Discount",
        s.total_amount as "Total",
        s.payment_status as "Status"
       FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE ${where}
       ORDER BY s.transaction_date DESC`,
      params
    );

    const headers = ["Transaction #", "Date", "Customer", "Payment Method", "Subtotal", "Tax", "Discount", "Total", "Status"];
    const csv = formatCsv(headers, rows);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Sales_Report_${dateStr}.csv`;
    const bytes = triggerDownload(csv, filename);
    saveToRecent(filename, "Sales Report", bytes);
  }, []);

  const exportInventoryReport = useCallback(async () => {
    const rows = await query<Record<string, any>>(
      `SELECT
        m.name as "Medicine",
        m.generic_name as "Generic Name",
        m.dosage_form as "Form",
        m.strength as "Strength",
        SUM(inv.quantity) as "Stock Qty",
        m.reorder_level as "Reorder Level",
        inv.cost_price as "Cost Price",
        inv.selling_price as "Selling Price",
        SUM(inv.quantity * inv.cost_price) as "Stock Value",
        MIN(inv.expiry_date) as "Nearest Expiry"
       FROM inventory inv
       JOIN medicines m ON inv.medicine_id = m.id
       WHERE inv._deleted = 0 AND m._deleted = 0
       GROUP BY m.id
       ORDER BY m.name ASC`
    );

    const headers = ["Medicine", "Generic Name", "Form", "Strength", "Stock Qty", "Reorder Level", "Cost Price", "Selling Price", "Stock Value", "Nearest Expiry"];
    const csv = formatCsv(headers, rows);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Inventory_Report_${dateStr}.csv`;
    const bytes = triggerDownload(csv, filename);
    saveToRecent(filename, "Inventory Report", bytes);
  }, []);

  const exportProfitLossReport = useCallback(async (dateFrom?: string, dateTo?: string) => {
    const params: string[] = [];
    let where = "s._deleted = 0";
    if (dateFrom) { where += " AND s.transaction_date >= ?"; params.push(dateFrom); }
    if (dateTo) { where += " AND s.transaction_date <= ?"; params.push(dateTo); }

    const salesRows = await query<Record<string, any>>(
      `SELECT
        strftime('%Y-%m', s.transaction_date) as "Month",
        SUM(s.total_amount) as "Revenue",
        SUM(si.cost_price * si.quantity) as "COGS"
       FROM sales s
       LEFT JOIN sale_items si ON s.id = si.sale_id
       WHERE ${where}
       GROUP BY strftime('%Y-%m', s.transaction_date)
       ORDER BY 1 ASC`,
      params
    );

    const expParams: string[] = [];
    let expWhere = "_deleted = 0";
    if (dateFrom) { expWhere += " AND date >= ?"; expParams.push(dateFrom); }
    if (dateTo) { expWhere += " AND date <= ?"; expParams.push(dateTo); }

    const expRows = await query<Record<string, any>>(
      `SELECT strftime('%Y-%m', date) as month, SUM(amount) as expenses
       FROM expenses WHERE ${expWhere}
       GROUP BY strftime('%Y-%m', date)`,
      expParams
    );

    const merged = salesRows.map((r) => {
      const exp = expRows.find((e) => e.month === r["Month"])?.expenses || 0;
      const revenue = Number(r["Revenue"] || 0);
      const cogs = Number(r["COGS"] || 0);
      const gross = revenue - cogs;
      const net = gross - exp;
      return {
        "Month": r["Month"],
        "Revenue": revenue.toFixed(2),
        "COGS": cogs.toFixed(2),
        "Gross Profit": gross.toFixed(2),
        "Expenses": Number(exp).toFixed(2),
        "Net Profit": net.toFixed(2),
        "Margin %": revenue > 0 ? ((net / revenue) * 100).toFixed(1) + "%" : "0%",
      };
    });

    const headers = ["Month", "Revenue", "COGS", "Gross Profit", "Expenses", "Net Profit", "Margin %"];
    const csv = formatCsv(headers, merged);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `ProfitLoss_${dateStr}.csv`;
    const bytes = triggerDownload(csv, filename);
    saveToRecent(filename, "Profit & Loss", bytes);
  }, []);

  const exportCustomerReport = useCallback(async () => {
    const rows = await query<Record<string, any>>(
      `SELECT
        c.first_name || ' ' || COALESCE(c.last_name, '') as "Name",
        c.phone as "Phone",
        c.email as "Email",
        c.loyalty_points as "Loyalty Points",
        c.outstanding_balance as "Outstanding Balance",
        c.credit_limit as "Credit Limit",
        COUNT(s.id) as "Total Purchases",
        SUM(s.total_amount) as "Total Spent",
        MAX(s.transaction_date) as "Last Purchase"
       FROM customers c
       LEFT JOIN sales s ON s.customer_id = c.id AND s._deleted = 0
       WHERE c._deleted = 0
       GROUP BY c.id
       ORDER BY SUM(s.total_amount) DESC NULLS LAST`
    );

    const headers = ["Name", "Phone", "Email", "Loyalty Points", "Outstanding Balance", "Credit Limit", "Total Purchases", "Total Spent", "Last Purchase"];
    const csv = formatCsv(headers, rows);
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Customer_Report_${dateStr}.csv`;
    const bytes = triggerDownload(csv, filename);
    saveToRecent(filename, "Customer Report", bytes);
  }, []);

  const exportExpensesReport = useCallback(async (dateFrom?: string, dateTo?: string) => {
    const params: string[] = [];
    let where = "_deleted = 0";
    if (dateFrom) { where += " AND date >= ?"; params.push(dateFrom); }
    if (dateTo) { where += " AND date <= ?"; params.push(dateTo); }

    const rows = await query<Record<string, any>>(
      `SELECT
        date as "Date",
        category as "Category",
        description as "Description",
        vendor_name as "Vendor",
        amount as "Amount",
        payment_method as "Payment Method",
        reference_number as "Reference"
       FROM expenses
       WHERE ${where}
       ORDER BY date DESC`,
      params
    );

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
    exportInventoryReport,
    exportProfitLossReport,
    exportCustomerReport,
    exportExpensesReport,
    getRecentDownloads,
  };
}
