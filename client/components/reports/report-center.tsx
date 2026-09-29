"use client";

import { useState, useEffect, useCallback } from "react";
import { format, subDays } from "date-fns";
import { Card } from "@/components/ui/card";
import {
  BarChart,
  ClipboardList,
  Wallet,
  Users,
  TrendingUp,
  FileText,
} from "lucide-react";
import { ReportCard } from "@/components/reports/report-card";
import { ReportFiltersBar, type ReportFiltersValue } from "@/components/reports/report-filters-bar";
import {
  useReportExport,
  getReportNote,
  getReportHeaders,
  RecentDownload,
  ReportId,
} from "@/lib/hooks/use-report-export";
import { ReportViewDialog } from "@/components/reports/report-view-dialog";
import type { ReportRow } from "@/components/reports/report-table-view";
import { ScrollFade } from "@/components/ui/scroll-fade";
import {
  RecentDownloadsEmptyState,
  RecentDownloadsList,
} from "@/components/reports/recent-downloads-list";
import { toQueryRange } from "@/lib/utils/date-range";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { toast } from "sonner";

export function ReportCenter() {
  const canExportReports = useHasPermission("export_reports");
  const canViewFinancialReports = useHasPermission("view_financial_reports");
  const [filters, setFilters] = useState<ReportFiltersValue>({
    dateRange: {
      from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    },
  });
  const [loadingReport, setLoadingReport] = useState<string | null>(null);
  const [recentDownloads, setRecentDownloads] = useState<RecentDownload[]>([]);
  const [viewing, setViewing] = useState<{
    id: ReportId;
    title: string;
  } | null>(null);
  const [viewRows, setViewRows] = useState<ReportRow[]>([]);
  const [isViewLoading, setIsViewLoading] = useState(false);

  const { getRows, exportReportCsv, downloadReportPdf, printReport, getRecentDownloads } =
    useReportExport();

  const refreshRecent = useCallback(() => {
    setRecentDownloads(getRecentDownloads());
  }, [getRecentDownloads]);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  const runAction = async (
    reportId: ReportId,
    action: "csv" | "pdf" | "print",
  ) => {
    const { from, to } = toQueryRange(filters.dateRange);
    const salesFilters = { staffId: filters.staffId, paymentMethod: filters.paymentMethod };
    setLoadingReport(reportId);
    try {
      if (action === "csv") {
        await exportReportCsv(reportId, from, to, salesFilters);
        toast.success("Export successful", { description: "Your CSV has been downloaded." });
      } else if (action === "pdf") {
        await downloadReportPdf(reportId, from, to, salesFilters);
        toast.success("Export successful", { description: "Your PDF has been downloaded." });
      } else {
        await printReport(reportId, from, to, salesFilters);
      }
      refreshRecent();
    } catch (err) {
      console.error(err);
      toast.error("Export failed", {
        description: "Something went wrong generating the report.",
      });
    } finally {
      setLoadingReport(null);
    }
  };

  const loadViewRows = async (
    reportId: ReportId,
    viewFilters: ReportFiltersValue,
  ) => {
    const { from, to } = toQueryRange(viewFilters.dateRange);
    setIsViewLoading(true);
    try {
      const rows = await getRows(reportId, from, to, {
        staffId: viewFilters.staffId,
        paymentMethod: viewFilters.paymentMethod,
      });
      setViewRows(rows);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't load this report", {
        description: "Something went wrong reading the data.",
      });
    } finally {
      setIsViewLoading(false);
    }
  };

  const openView = async (reportId: ReportId, title: string) => {
    setViewing({ id: reportId, title });
    setViewRows([]);
    await loadViewRows(reportId, filters);
  };

  const reports: {
    id: ReportId;
    title: string;
    description: string;
    icon: typeof FileText;
    category: string;
  }[] = [
    {
      id: "sales",
      title: "Detailed Sales Report",
      description: "Itemized list of all transactions with tax and discount breakdown.",
      icon: FileText,
      category: "Financial",
    },
    {
      id: "stock_batches",
      title: "Inventory Valuation",
      description: "Current stock levels, cost value, and potential selling value.",
      icon: ClipboardList,
      category: "Operations",
    },
    {
      id: "profit-loss",
      title: "Profit & Loss Summary",
      description: "Comparative view of revenue vs expenses for the selected period.",
      icon: BarChart,
      category: "Financial",
    },
    {
      id: "customers",
      title: "Customer Loyalty Report",
      description: "Analysis of top customers, points balance, and outstanding balances.",
      icon: Users,
      category: "CRM",
    },
    {
      id: "expenses",
      title: "Expense Categories",
      description: "Breakdown of operating costs by category.",
      icon: Wallet,
      category: "Financial",
    },
    {
      id: "top_sellers",
      title: "Top Sellers",
      description: "Best-performing products by revenue for the selected period.",
      icon: TrendingUp,
      category: "Operations",
    },
  ];

  const visibleReports = canViewFinancialReports
    ? reports
    : reports.filter((report) => report.id !== "profit-loss");

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <ReportFiltersBar value={filters} onChange={setFilters} />
        <span className="text-[12.5px] text-muted-foreground">
          Reports will be generated for these filters
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
        {/* Report Center */}
        <Card className="border rounded-2xl p-5 shadow-sm">
          <div>
            <div className="text-[14.5px] font-semibold mb-0.5">Report Center</div>
            <div className="text-[12px] text-muted-foreground">Generate and download structured data exports</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleReports.map((report) => {
              const isLoading = loadingReport === report.id;
              // Only set for a report whose figures the active filters change
              // the meaning of - today, a staff/payment-method-filtered
              // Profit & Loss, which reports no expenses on purpose. Same
              // copy the exported CSV/PDF carries.
              const note = getReportNote(report.id, {
                staffId: filters.staffId,
                paymentMethod: filters.paymentMethod,
              });
              return (
                <ReportCard
                  key={report.id}
                  report={report}
                  note={note}
                  isLoading={isLoading}
                  canExportReports={canExportReports}
                  onView={() => void openView(report.id, report.title)}
                  onExportPdf={() => void runAction(report.id, "pdf")}
                  onExportCsv={() => void runAction(report.id, "csv")}
                  onPrint={() => void runAction(report.id, "print")}
                />
              );
            })}
          </div>
        </Card>

        {/* Recent Downloads: min-h-0 stops this card's own content from
            growing the shared grid row taller than Report Center's natural
            height; the list scrolls internally instead once it overflows
            whatever height that row ends up being. */}
        <Card className="border rounded-2xl p-5 shadow-sm flex flex-col min-h-0">
          <div className="shrink-0">
            <div className="text-[14.5px] font-semibold mb-0.5">Recent Downloads</div>
            <div className="text-[12px] text-muted-foreground">Reports generated in this browser session</div>
          </div>
          <ScrollFade containerClassName="flex-1">
            {recentDownloads.length === 0 ? (
              <RecentDownloadsEmptyState />
            ) : (
              <RecentDownloadsList downloads={recentDownloads} />
            )}
          </ScrollFade>
        </Card>
      </div>

      {viewing && (
        <ReportViewDialog
          // Remounting per report is what gives each opened report a clean
          // search box and a fresh seed from the card's current filters.
          key={viewing.id}
          open={!!viewing}
          onOpenChange={(open) => {
            if (!open) setViewing(null);
          }}
          reportId={viewing.id}
          title={viewing.title}
          initialFilters={filters}
          onFiltersChange={(next) => void loadViewRows(viewing.id, next)}
          rows={viewRows}
          headers={getReportHeaders(viewing.id)}
          isLoading={isViewLoading}
          isExporting={loadingReport === viewing.id}
          canExport={canExportReports}
          onExport={(action) => void runAction(viewing.id, action)}
        />
      )}
    </div>
  );
}
