import { useState } from "react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { useBIData } from "@/lib/hooks/use-bi-data";
import { useReportExport } from "@/lib/hooks/use-report-export";
import { toQueryRange } from "@/lib/utils/date-range";
import type { ReportFiltersValue } from "@/components/reports/report-filters-bar";

// All business logic for the Analytics/BI dashboard:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-business-intelligence-dashboard-ts-L9
export function useBusinessIntelligenceDashboard() {
  const [filters, setFilters] = useState<ReportFiltersValue>({
    dateRange: {
      from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    },
  });
  // Owned here rather than left to Tabs' own defaultValue, so the data layer
  // can gate the reads that only feed one tab - see useBIData.
  const [activeTab, setActiveTab] = useState("sales");
  const [exporting, setExporting] = useState(false);
  const { exportReportCsv } = useReportExport();

  const handleExportReports = async () => {
    setExporting(true);
    try {
      // toQueryRange(), not manual "T00:00:00.000Z"/"T23:59:59.999Z" string concatenation:
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-business-intelligence-dashboard-ts-L27
      const { from, to } = toQueryRange(filters.dateRange);
      await exportReportCsv("profit-loss", from, to, {
        staffId: filters.staffId,
        paymentMethod: filters.paymentMethod,
      });
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

  const biData = useBIData(
    filters.dateRange,
    {
      staffId: filters.staffId,
      paymentMethod: filters.paymentMethod,
    },
    activeTab,
  );

  return {
    ...biData,
    filters,
    setFilters,
    activeTab,
    setActiveTab,
    exporting,
    handleExportReports,
  };
}
