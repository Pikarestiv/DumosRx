import { useState } from "react";
import { subDays } from "date-fns";
import { toast } from "sonner";
import { useBIData } from "@/lib/hooks/use-bi-data";
import { useReportExport } from "@/lib/hooks/use-report-export";

const TIME_RANGE_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

/** All business logic for the Analytics/BI dashboard — time range selection, export, and BI data. */
export function useBusinessIntelligenceDashboard() {
  const [timeRange, setTimeRange] = useState("30d");
  const [exporting, setExporting] = useState(false);
  const { exportProfitLossReport } = useReportExport();

  const handleExportReports = async () => {
    setExporting(true);
    try {
      const days = TIME_RANGE_DAYS[timeRange] ?? 30;
      const to = new Date().toISOString();
      const from = subDays(new Date(), days).toISOString();
      await exportProfitLossReport(from, to);
      toast.success("Export successful", {
        description: "Your report has been downloaded.",
      });
    } catch (err) {
      console.error(err);
      toast.error("Export failed", {
        description: "Something went wrong generating the report.",
      });
    } finally {
      setExporting(false);
    }
  };

  const biData = useBIData(timeRange);

  return {
    ...biData,
    timeRange,
    setTimeRange,
    exporting,
    handleExportReports,
  };
}
