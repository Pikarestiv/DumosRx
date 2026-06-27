"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format, subDays, subMonths } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Download,
  Printer,
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
      title: "StockBatch Valuation",
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
    <div className="space-y-6">
      {/* Date filter */}
      <div className="flex items-center gap-3">
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        <Select value={datePreset} onValueChange={setDatePreset}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          Reports will be generated for this time range
        </span>
      </div>

      {/* Report grid */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-bold">Standard Reports</CardTitle>
          <CardDescription>Select a report to generate or export as CSV</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {reports.map((report) => {
              const isLoading = loadingReport === report.id;
              return (
                <div
                  key={report.id}
                  className="flex items-start gap-4 p-4 rounded-xl border border-border hover:bg-muted/50 transition-all group"
                >
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform shrink-0">
                    <report.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-sm">{report.title}</h3>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {report.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {report.description}
                    </p>
                    <div className="flex items-center gap-3 mt-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-2"
                        onClick={() => runPreview(report.id)}
                        disabled={isLoading}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-2"
                        onClick={() => runPrint(report.id)}
                        disabled={isLoading}
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Print
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-2"
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            Export
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => runExport(report.id)} className="cursor-pointer">
                            Export CSV
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => runPrint(report.id)} className="cursor-pointer">
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
        </CardContent>
      </Card>

      {/* Recent Downloads */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-bold">Recent Downloads</CardTitle>
          <CardDescription>Reports generated in this browser session</CardDescription>
        </CardHeader>
        <CardContent>
          {recentDownloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 opacity-20 mb-3" />
              <p className="font-semibold">No reports generated yet</p>
              <p className="text-sm mt-1">Export a report above to see it here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentDownloads.map((dl) => (
                <div
                  key={dl.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">{dl.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {dl.type} •{" "}
                        {format(new Date(dl.generatedAt), "MMM d, yyyy 'at' h:mm a")} •{" "}
                        {dl.sizeLabel}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
                    Downloaded
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
