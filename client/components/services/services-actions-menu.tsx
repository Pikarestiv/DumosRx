"use client";

import { ChevronDown, Download, MoreHorizontal, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStore } from "@/lib/context/store-context";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { buildServiceExportRows } from "@/lib/utils/service-export";
import { buildBlobFromRows } from "@/lib/utils/spreadsheet-io";
import { generateReportPdfBlob } from "@/lib/utils/report-pdf";
import { downloadBlob } from "@/lib/utils/download-blob";
import { buildExportFilename } from "@/lib/utils/export-filename";
import type { Service } from "@/lib/types/service";

type ExportFormat = "csv" | "xlsx" | "pdf";

interface ServicesActionsMenuProps {
  services: readonly Service[];
  isFiltered: boolean;
  canManageCategories: boolean;
  onManageCategories: () => void;
}

export function ServicesActionsMenu({ services, isFiltered, canManageCategories, onManageCategories }: ServicesActionsMenuProps) {
  const { storeProfile } = useStore();
  const canExport = useHasPermission("export_product_list");

  const exportServices = async (format: ExportFormat) => {
    try {
      const { headers, rows } = buildServiceExportRows(services);
      const blob =
        format === "pdf"
          ? await generateReportPdfBlob({
              storeName: storeProfile?.name || "",
              title: "Services Export",
              subtitle: isFiltered ? `${rows.length} filtered service(s)` : `${rows.length} service(s)`,
              headers,
              rows,
            })
          : await buildBlobFromRows(headers, rows, format, "Services");
      downloadBlob(blob, buildExportFilename({ kind: "Services", extension: format, storeName: storeProfile?.name }));
      toast.success(isFiltered ? `Exported ${rows.length} filtered service(s)` : `Exported ${rows.length} service(s)`);
    } catch {
      toast.error("Could not export the services list");
    }
  };

  if (!canExport && !canManageCategories) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5 text-[12px] sm:h-9" aria-label="Services actions">
          <span className="hidden sm:inline">Services actions</span>
          <MoreHorizontal className="h-4 w-4 sm:hidden" />
          <ChevronDown className="hidden h-3.5 w-3.5 sm:inline" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canExport && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download className="h-3.5 w-3.5" />
              Export services list
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {isFiltered && (
                <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  Filter active: exports {services.length} shown service{services.length === 1 ? "" : "s"}
                </div>
              )}
              <DropdownMenuItem onSelect={() => void exportServices("csv")}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportServices("xlsx")}>Export as XLSX</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportServices("pdf")}>Export as PDF</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {canExport && canManageCategories && <DropdownMenuSeparator />}
        {canManageCategories && (
          <DropdownMenuItem onSelect={onManageCategories}>
            <Settings2 className="h-3.5 w-3.5" />
            Manage categories
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
