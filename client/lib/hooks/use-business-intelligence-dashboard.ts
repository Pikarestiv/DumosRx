import { useState } from "react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import { useBIData } from "@/lib/hooks/use-bi-data";
import { useReportExport } from "@/lib/hooks/use-report-export";
import { toQueryRange } from "@/lib/utils/date-range";
import type { ReportFiltersValue } from "@/components/reports/report-filters-bar";

/** All business logic for the Analytics/BI dashboard: shared filter state
 * (date range, staff, payment method - no branch/store filter, since
 * switching stores via the header selector already re-scopes every query),
 * export, and BI data. */
export function useBusinessIntelligenceDashboard() {
  const [filters, setFilters] = useState<ReportFiltersValue>({
    dateRange: {
      from: format(subDays(new Date(), 30), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    },
  });
  const [exporting, setExporting] = useState(false);
  const { exportReportCsv } = useReportExport();

  const handleExportReports = async () => {
    setExporting(true);
    try {
      // toQueryRange(), not manual "T00:00:00.000Z"/"T23:59:59.999Z" string
      // concatenation: the picker's date-only values name days on the store's
      // LOCAL wall clock, which is the calendar every report query buckets
      // against (strftime(..., 'localtime')). Pinning them to literal UTC
      // midnight shifted this export's day/month boundaries by the store's
      // UTC offset relative to the very same P&L export run from Report
      // Center, which already goes through toQueryRange().
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

  const biData = useBIData(filters.dateRange, {
    staffId: filters.staffId,
    paymentMethod: filters.paymentMethod,
  });

  return {
    ...biData,
    filters,
    setFilters,
    exporting,
    handleExportReports,
  };
}
