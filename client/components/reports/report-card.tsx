"use client";

import {
  FileText,
  Download,
  FileDown,
  Printer,
  Loader2,
  Info,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReportId } from "@/lib/hooks/use-report-export";

interface ReportCardProps {
  report: {
    id: ReportId;
    title: string;
    description: string;
    icon: LucideIcon;
    category: string;
  };
  note: string | undefined;
  isLoading: boolean;
  canExportReports: boolean;
  onView: () => void;
  onExportPdf: () => void;
  onExportCsv: () => void;
  onPrint: () => void;
}

export function ReportCard({
  report,
  note,
  isLoading,
  canExportReports,
  onView,
  onExportPdf,
  onExportCsv,
  onPrint,
}: ReportCardProps) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-[14px] border hover:bg-primary/5 transition-all group">
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
        {/* min-h reserves room for a full 2 lines (line-clamp-2's cap) even
            when the description only wraps to 1, so the button row below
            never shifts between cards. */}
        <p className="text-[11.5px] text-muted-foreground line-clamp-2 leading-snug min-h-[2.75em]">
          {report.description}
        </p>
        {note && (
          <div className="flex items-start gap-1.5 mt-2 p-2 rounded-[10px] border border-amber-500/30 bg-amber-500/10">
            <Info className="h-3 w-3 text-amber-600 dark:text-amber-500 shrink-0 mt-[1px]" />
            <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
              {note}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1.5 flex-1 md:flex-none border-border"
            onClick={onView}
            disabled={isLoading}
          >
            <Eye className="h-3 w-3" />
            View
          </Button>
          {canExportReports && (
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
                <DropdownMenuItem onClick={onExportPdf} className="cursor-pointer text-[12px] gap-2">
                  <FileDown className="h-3.5 w-3.5 text-inherit" />
                  Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportCsv} className="cursor-pointer text-[12px] gap-2">
                  <FileText className="h-3.5 w-3.5 text-inherit" />
                  Download CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canExportReports && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1.5 flex-1 md:flex-none border-border"
              onClick={onPrint}
              disabled={isLoading}
            >
              <Printer className="h-3 w-3" />
              Print
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
