"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import {
  fetchSalesReportData,
  fetchInventoryReportData,
  fetchProfitLossReportData,
  fetchCustomerReportData,
  fetchExpensesReportData,
} from "@/lib/hooks/report-queries";

import { Suspense } from "react";

export default function PrintReportPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center font-sans text-xl">Loading report...</div>}>
      <PrintReportContent />
    </Suspense>
  );
}

function PrintReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reportType = searchParams.get("report");
  const dateFrom = searchParams.get("from") || undefined;
  const dateTo = searchParams.get("to") || undefined;

  const [data, setData] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    async function loadData() {
      try {
        let rows: Record<string, any>[] = [];
        let cols: string[] = [];
        
        switch (reportType) {
          case "sales":
            rows = await fetchSalesReportData(dateFrom, dateTo);
            cols = ["Transaction #", "Date", "Customer", "Payment Method", "Subtotal", "Tax", "Discount", "Total", "Status"];
            break;
          case "inventory":
            rows = await fetchInventoryReportData();
            cols = ["Medicine", "Generic Name", "Form", "Strength", "Stock Qty", "Reorder Level", "Cost Price", "Selling Price", "Stock Value", "Nearest Expiry"];
            break;
          case "profit-loss":
            rows = await fetchProfitLossReportData(dateFrom, dateTo);
            cols = ["Month", "Revenue", "COGS", "Gross Profit", "Expenses", "Net Profit", "Margin %"];
            break;
          case "customers":
            rows = await fetchCustomerReportData();
            cols = ["Name", "Phone", "Email", "Loyalty Points", "Outstanding Balance", "Credit Limit", "Total Purchases", "Total Spent", "Last Purchase"];
            break;
          case "expenses":
            rows = await fetchExpensesReportData(dateFrom, dateTo);
            cols = ["Date", "Category", "Description", "Vendor", "Amount", "Payment Method", "Reference"];
            break;
          default:
            throw new Error("Invalid report type");
        }
        
        if (isMounted) {
          setData(rows);
          setHeaders(cols);
          setLoading(false);
          // Wait for DOM to render then trigger print
          setTimeout(() => {
            window.print();
          }, 500);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load report data");
          setLoading(false);
        }
      }
    }
    
    if (reportType) {
      loadData();
    } else {
      setError("No report specified");
      setLoading(false);
    }
    
    return () => { isMounted = false; };
  }, [reportType, dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="p-10 text-center font-sans">
        <p className="text-xl">Generating report...</p>
        <p className="text-gray-500 mt-2">Please wait while we prepare your data for printing.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-center font-sans text-red-600">
        <p className="text-xl font-bold">Error</p>
        <p className="mt-2">{error}</p>
      </div>
    );
  }

  const reportTitleMap: Record<string, string> = {
    "sales": "Sales Report",
    "inventory": "Inventory Valuation Report",
    "profit-loss": "Profit & Loss Summary",
    "customers": "Customer Loyalty Report",
    "expenses": "Expenses Report"
  };

  const title = reportType ? reportTitleMap[reportType] || "Report" : "Report";
  const dateStr = new Date().toLocaleDateString();

  return (
    <div className="p-8 max-w-[1200px] mx-auto font-sans bg-white text-black min-h-screen">
      <div className="mb-6 print:hidden flex justify-between items-center bg-gray-50 p-4 rounded-lg border">
        <button 
          onClick={() => router.back()} 
          className="flex items-center gap-2 text-gray-700 hover:text-black font-medium px-4 py-2 bg-white rounded-md border shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Reports
        </button>
        <button 
          onClick={() => window.print()} 
          className="flex items-center gap-2 text-white bg-blue-600 hover:bg-blue-700 font-medium px-4 py-2 rounded-md shadow-sm"
        >
          <Printer className="w-4 h-4" />
          Print Now
        </button>
      </div>

      <div className="mb-8 border-b pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold font-serif mb-1">{title}</h1>
          <p className="text-gray-600 text-sm">
            Generated on: {dateStr}
            {dateFrom && ` | From: ${new Date(dateFrom).toLocaleDateString()}`}
            {dateTo && ` | To: ${new Date(dateTo).toLocaleDateString()}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold text-lg">DumosRx Pharmacy</p>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="text-center text-gray-500 my-12">No data found for the selected criteria.</p>
      ) : (
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black">
              {headers.map(h => (
                <th key={h} className="py-2 pr-2 font-bold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-gray-200">
                {headers.map(h => (
                  <td key={h} className="py-2 pr-2">{row[h] ?? "-"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { background: white; margin: 0; padding: 0; }
          @page { margin: 1cm; size: landscape; }
        }
      `}} />
    </div>
  );
}
