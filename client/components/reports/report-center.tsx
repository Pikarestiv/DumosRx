"use client";

import { useState, useEffect, useCallback } from "react";
import { format, subDays } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  FileDown,
  Printer,
  BarChart,
  ClipboardList,
  Wallet,
  Users,
  Loader2,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/date-range-picker";
import {
  useReportExport,
  RecentDownload,
  ReportId,
} from "@/lib/hooks/use-report-export";
import { toast } from "sonner";

function toQueryRange(range: DateRangeValue): { from?: string; to?: string } {
  return {
    from: range.from ? `${range.from}T00:00:00.000Z` : undefined,
    to: range.to ? `${range.to}T23:59:59.999Z` : undefined,
  };
}

export function ReportCenter() {
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  });
  const [loadingReport, setLoadingReport] = useState<string | null>(null);
  const [recentDownloads, setRecentDownloads] = useState<RecentDownload[]>([]);

  const { exportReportCsv, downloadReportPdf, printReport, getRecentDownloads } =
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
    const { from, to } = toQueryRange(dateRange);
    setLoadingReport(reportId);
    try {
      if (action === "csv") {
        await exportReportCsv(reportId, from, to);
        toast.success("Export successful", { description: "Your CSV has been downloaded." });
      } else if (action === "pdf") {
        await downloadReportPdf(reportId, from, to);
        toast.success("Export successful", { description: "Your PDF has been downloaded." });
      } else {
        await printReport(reportId, from, to);
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

  return (
    <div className="space-y-5">
      {/* Date filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <DateRangePicker value={dateRange} onChange={setDateRange} className="w-full sm:w-auto" />
        <span className="text-[12.5px] text-muted-foreground">
          Reports will be generated for this time range
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
            {reports.map((report) => {
              const isLoading = loadingReport === report.id;
              return (
                <div
                  key={report.id}
                  className="flex items-start gap-3 p-4 rounded-[14px] border hover:bg-primary/5 transition-all group"
                >
                  <div className="h-10 w-10 rounded-[10px] bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform shrink-0">
                    <report.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-bold text-[13px]">{report.title}</h3>
                      <Badge variant="secondary" className="text-[9px] shrink-0 font-bold bg-primary/10 text-primary border-none">
                        {report.category}
                      </Badge>
                    </div>
                    <p className="text-[11.5px] text-muted-foreground line-clamp-2 leading-snug">
                      {report.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] gap-1.5 flex-1 md:flex-none border-border"
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            Export
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => runAction(report.id, "pdf")} className="cursor-pointer text-[12px] gap-2">
                            <FileDown className="h-3.5 w-3.5 text-inherit" />
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => runAction(report.id, "csv")} className="cursor-pointer text-[12px] gap-2">
                            <FileText className="h-3.5 w-3.5 text-inherit" />
                            Download CSV
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1.5 flex-1 md:flex-none border-border"
                        onClick={() => runAction(report.id, "print")}
                        disabled={isLoading}
                      >
                        <Printer className="h-3 w-3" />
                        Print
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Recent Downloads — min-h-0 stops this card's own content from
            growing the shared grid row taller than Report Center's natural
            height; the list scrolls internally instead once it overflows
            whatever height that row ends up being. */}
        <Card className="border rounded-2xl p-5 shadow-sm flex flex-col min-h-0">
          <div className="shrink-0">
            <div className="text-[14.5px] font-semibold mb-0.5">Recent Downloads</div>
            <div className="text-[12px] text-muted-foreground">Reports generated in this browser session</div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {recentDownloads.length === 0 ? (
              <RecentDownloadsEmptyState />
            ) : (
              <RecentDownloadsList downloads={recentDownloads} />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function RecentDownloadsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
      <CheckCircle2 className="h-8 w-8 opacity-20 mb-3" />
      <p className="font-semibold text-[13.5px]">No reports generated yet</p>
      <p className="text-[12px] mt-1">Export a report to see it here.</p>
    </div>
  );
}

function RecentDownloadsList({ downloads }: { downloads: RecentDownload[] }) {
  return (
    <div className="space-y-3">
      {downloads.map((dl) => (
        <div
          key={dl.id}
          className="flex items-start gap-3 p-3 rounded-xl border bg-primary/5"
        >
          <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1 w-full">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold truncate">{dl.name}</p>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              {dl.type}
            </p>
            <div className="flex flex-col gap-0.5 mt-1">
              <p className="text-[11px] text-muted-foreground">
                {format(new Date(dl.generatedAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {dl.sizeLabel}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
