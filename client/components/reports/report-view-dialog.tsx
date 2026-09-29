"use client";

import { useMemo, useState } from "react";
import { Download, FileDown, FileText, Info, Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { SearchInput } from "@/components/ui/search-input";
import { genericFuzzySearch } from "@/lib/utils/search";
import {
  getReportNote,
  reportSupportsDateRange,
  reportSupportsSalesFilters,
  type ReportId,
} from "@/lib/hooks/use-report-export";
import {
  ReportFiltersBar,
  type ReportFiltersValue,
} from "./report-filters-bar";
import { ReportTableView, type ReportRow } from "./report-table-view";

interface ReportViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: ReportId;
  title: string;
  subtitle?: string;
  rows: ReportRow[];
  headers: string[];
  /** The Report Center card's filters at the moment "View" was clicked. A
   * seed only: the modal owns its filter state from then on. */
  initialFilters: ReportFiltersValue;
  /** Fired when a filter the report's query actually takes changes, so the
   * opener re-runs the same getRows() the card uses. */
  onFiltersChange: (filters: ReportFiltersValue) => void;
  isLoading: boolean;
  isExporting: boolean;
  /** Mirrors the Report Center card's own `export_reports` gate so the
   * in-dialog Export/Print buttons can't be the way round it. */
  canExport?: boolean;
  onExport: (action: "csv" | "pdf" | "print") => void;
}

/** On-screen counterpart to the Report Center's export/print actions: the
 * same rows getRows() already fetches, rendered sortably, searchable and
 * re-filterable without closing the modal, with Export and Print still
 * reachable from inside the view rather than only from the card that opened
 * it. */
export function ReportViewDialog({
  open,
  onOpenChange,
  reportId,
  title,
  subtitle,
  rows,
  headers,
  initialFilters,
  onFiltersChange,
  isLoading,
  isExporting,
  canExport = true,
  onExport,
}: ReportViewDialogProps) {
  const [filters, setFilters] = useState<ReportFiltersValue>(initialFilters);
  const [search, setSearch] = useState("");

  const showDateRange = reportSupportsDateRange(reportId);
  const showSalesFilters = reportSupportsSalesFilters(reportId);
  const hasRefetchFilters = showDateRange || showSalesFilters;

  const note = getReportNote(reportId, {
    staffId: filters.staffId,
    paymentMethod: filters.paymentMethod,
  });

  const columns = useMemo(
    () => (headers.length > 0 ? headers : rows.length > 0 ? Object.keys(rows[0]) : []),
    [headers, rows],
  );

  const visibleRows = useMemo(
    () =>
      search.trim()
        ? genericFuzzySearch(search, rows, columns as (keyof ReportRow)[]).results
        : rows,
    [search, rows, columns],
  );

  const applyFilters = (next: ReportFiltersValue) => {
    setFilters(next);
    onFiltersChange(next);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="font-serif font-bold text-xl">{title}</span>}
      description={
        subtitle ??
        `${visibleRows.length} row${visibleRows.length === 1 ? "" : "s"} for the selected filters. Click a column header to sort.`
      }
      className="sm:max-w-5xl h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden"
      footer={!canExport ? undefined : (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5" disabled={isExporting}>
                {isExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onExport("pdf")}
                className="cursor-pointer text-[12px] gap-2"
              >
                <FileDown className="h-3.5 w-3.5 text-inherit" />
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onExport("csv")}
                className="cursor-pointer text-[12px] gap-2"
              >
                <FileText className="h-3.5 w-3.5 text-inherit" />
                Download CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => onExport("print")}
            disabled={isExporting}
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      )}
    >
      <div className="flex-1 min-h-0 overflow-auto space-y-3 pb-2 px-0.5 pt-0.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search these rows..."
            aria-label="Search report rows"
          />
          {hasRefetchFilters && (
            <ReportFiltersBar
              value={filters}
              onChange={applyFilters}
              compact
              showDateRange={showDateRange}
              showStaff={showSalesFilters}
              showPaymentMethod={showSalesFilters}
            />
          )}
        </div>
        {hasRefetchFilters && (
          <p className="text-[11px] text-muted-foreground">
            Search filters the rows already loaded. Changing the date range
            {showSalesFilters ? ", staff or payment method" : ""} reloads the
            report.
          </p>
        )}
        {note && (
          <div className="flex items-start gap-1.5 p-2 rounded-[10px] border border-amber-500/30 bg-amber-500/10">
            <Info className="h-3 w-3 text-amber-600 dark:text-amber-500 shrink-0 mt-[1px]" />
            <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
              {note}
            </p>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-[13px]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading report...
          </div>
        ) : (
          <ReportTableView rows={visibleRows} headers={headers} />
        )}
      </div>
    </ResponsiveModal>
  );
}
