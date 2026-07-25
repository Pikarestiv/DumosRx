"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, subDays, subMonths } from "date-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  BarChart,
  ClipboardList,
  Wallet,
  Users,
  Calendar as CalendarIcon,
  Loader2,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useReportExport,
  RecentDownload,
} from "@/lib/hooks/use-report-export";
import { toast } from "sonner";

const DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "Last 3 Months", value: "90d" },
  { label: "Last Year", value: "1y" },
  { label: "All Time", value: "all" },
];

function getDateRange(preset: string): { from?: string; to?: string } {
  const now = new Date();
  const to = now.toISOString();
  if (preset === "today") return { from: new Date(now.setHours(0, 0, 0, 0)).toISOString(), to };
  if (preset === "7d") return { from: subDays(now, 7).toISOString(), to };
  if (preset === "30d") return { from: subDays(now, 30).toISOString(), to };
  if (preset === "90d") return { from: subMonths(now, 3).toISOString(), to };
  if (preset === "1y") return { from: subMonths(now, 12).toISOString(), to };
  return {};
}

export function ReportCenter() {
  const router = useRouter();
  const [datePreset, setDatePreset] = useState("30d");
  const [loadingReport, setLoadingReport] = useState<string | null>(null);
  const [recentDownloads, setRecentDownloads] = useState<RecentDownload[]>([]);

  const {
    exportSalesReport,
    exportStockBatchReport,
    exportProfitLossReport,
    exportCustomerReport,
    exportExpensesReport,
    getRecentDownloads,
  } = useReportExport();

  const refreshRecent = useCallback(() => {
    setRecentDownloads(getRecentDownloads());
  }, [getRecentDownloads]);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  const runExport = async (reportId: string) => {
    const { from, to } = getDateRange(datePreset);
    setLoadingReport(reportId);
    try {
      switch (reportId) {
        case "sales":
          await exportSalesReport(from, to);
          break;
        case "stock_batches":
          await exportStockBatchReport();
          break;
        case "profit-loss":
          await exportProfitLossReport(from, to);
          break;
        case "customers":
          await exportCustomerReport();
          break;
        case "expenses":
          await exportExpensesReport(from, to);
          break;
      }
      refreshRecent();
      toast.success("Export successful", { description: "Your report has been downloaded." });
    } catch (err) {
      console.error(err);
      toast.error("Export failed", {
        description: "Something went wrong generating the report.",
      });
    } finally {
      setLoadingReport(null);
    }
  };

  const runPrint = (reportId: string) => {
    const { from, to } = getDateRange(datePreset);
    const params = new URLSearchParams({ report: reportId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const printUrl = `/reports/print?${params.toString()}`;
    router.push(printUrl);
  };

  const runPreview = (reportId: string) => {
    const { from, to } = getDateRange(datePreset);
    const params = new URLSearchParams({ report: reportId, preview: "true" });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const printUrl = `/reports/print?${params.toString()}`;
    router.push(printUrl);
  };

  const reports = [
    {
      id: "sales",
      title: "Detailed Sales Report",
      description: "Itemized list of all transactions with tax and discount breakdown.",
      icon: FileText,
      category: "Financial",
    },
    {
      id: "stock_batches",
      title: "Stock Batch Valuation",
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
  ];

  return (
    <div className="space-y-5">
      {/* Date filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="flex items-center gap-2 bg-background border rounded-[10px] px-3.5 py-1.5 w-full sm:w-[220px]">
          <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="border-0 shadow-none focus:ring-0 p-0 h-auto text-[13px] w-full bg-transparent outline-none">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-[13px]">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] gap-1.5 flex-1 md:flex-none border-border"
                        onClick={() => runPreview(report.id)}
                        disabled={isLoading}
                      >
                        <Eye className="h-3 w-3" />
                        Preview
                      </Button>
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
                          <DropdownMenuItem onClick={() => runExport(report.id)} className="cursor-pointer text-[12px]">
                            Export CSV
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => runPrint(report.id)} className="cursor-pointer text-[12px]">
                            Export PDF
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Recent Downloads */}
        <Card className="border rounded-2xl p-5 shadow-sm">
          <div>
            <div className="text-[14.5px] font-semibold mb-0.5">Recent Downloads</div>
            <div className="text-[12px] text-muted-foreground">Reports generated in this browser session</div>
          </div>
          <div>
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
