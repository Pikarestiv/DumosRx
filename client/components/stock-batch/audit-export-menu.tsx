import { ChevronDown, Printer } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AuditExportMenuProps {
  menuDisabled: boolean;
  exportDisabled: boolean;
  onPrint: () => void;
  onDownloadPdf: () => void;
  onExport: (format: "csv" | "xlsx") => void;
  onStartOver: () => void;
}

export function AuditExportMenu({
  menuDisabled,
  exportDisabled,
  onPrint,
  onDownloadPdf,
  onExport,
  onStartOver,
}: AuditExportMenuProps) {
  return (
    <DropdownMenu>
      <div className="flex">
        <button
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-l-full border border-r-0 border-border hover:bg-muted transition-colors disabled:opacity-60"
          onClick={onPrint}
          disabled={menuDisabled || exportDisabled}
        >
          <Printer className="w-3.5 h-3.5" />
          Print
        </button>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="More export options"
            className="flex items-center px-2 py-1.5 rounded-r-full border border-border hover:bg-muted transition-colors disabled:opacity-60"
            disabled={menuDisabled}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={exportDisabled} onClick={onDownloadPdf}>
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem disabled={exportDisabled} onClick={() => onExport("csv")}>
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem disabled={exportDisabled} onClick={() => onExport("xlsx")}>
          Export Excel
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onStartOver}>
          Start over
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
