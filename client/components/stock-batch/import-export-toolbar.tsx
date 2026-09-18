"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { downloadBlob, generateReportPdfBlob } from "@/lib/utils/report-pdf";
import {
  buildExportBlob,
  buildExportRows,
} from "@/lib/utils/product-import-export";
import {
  getProductsForExport,
  type ExportableProduct,
} from "@/lib/db/queries/product-export";
import { useStore } from "@/lib/context/store-context";
import { ImportMappingDialog } from "./import-mapping-dialog";
import { ExportColumnsDialog } from "./export-columns-dialog";

type ExportFormat = "csv" | "xlsx" | "pdf";

interface ImportExportToolbarProps {
  onImported: () => void;
  /** The catalog table's currently-filtered product ids (search/category/
   * status), so Export defaults to "what's on screen" instead of always the
   * whole store — undefined (no filter active) exports everything. */
  filteredProductIds?: string[];
}

/** Lets the loading overlay actually paint before the (synchronous,
 * main-thread-blocking) export work starts - otherwise the browser never
 * gets a chance to render it and the app just looks hung. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function ImportExportToolbar({
  onImported,
  filteredProductIds,
}: ImportExportToolbarProps) {
  const { storeProfile } = useStore();
  const [showImport, setShowImport] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<ExportFormat | null>(
    null,
  );
  const [isExporting, setIsExporting] = useState(false);
  const isFiltered = filteredProductIds !== undefined;

  const runExport = async (
    format: ExportFormat,
    columns: (keyof ExportableProduct)[],
  ) => {
    setIsExporting(true);
    await nextFrame();
    try {
      const products = await getProductsForExport(filteredProductIds);
      const dateStr = new Date().toISOString().slice(0, 10);

      if (format === "pdf") {
        const { headers, rows } = buildExportRows(products, columns);
        const blob = await generateReportPdfBlob({
          storeName: storeProfile?.name || "",
          title: "Product Export",
          subtitle: isFiltered
            ? `${products.length} filtered product(s)`
            : `${products.length} product(s)`,
          headers,
          rows,
        });
        downloadBlob(blob, `DumosRx_Products_${dateStr}.pdf`);
      } else {
        const blob = buildExportBlob(products, columns, format);
        downloadBlob(blob, `DumosRx_Products_${dateStr}.${format}`);
      }

      toast.success(
        isFiltered
          ? `Exported ${products.length} filtered product(s)`
          : `Exported ${products.length} product(s)`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportClick = (format: ExportFormat) => {
    setPendingFormat(format);
    setShowColumnPicker(true);
  };

  return (
    <>
      {isExporting && <LoadingOverlay message="Generating export..." />}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-[12px]"
        onClick={() => setShowImport(true)}
      >
        <Upload className="h-3.5 w-3.5" />
        Import
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-[12px]"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isFiltered && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
              Filter active: exports {filteredProductIds.length} shown product
              {filteredProductIds.length === 1 ? "" : "s"}
            </div>
          )}
          <DropdownMenuItem onClick={() => handleExportClick("csv")}>
            Export as CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportClick("xlsx")}>
            Export as XLSX
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportClick("pdf")}>
            Export as PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportMappingDialog
        open={showImport}
        onOpenChange={setShowImport}
        onImported={onImported}
      />

      <ExportColumnsDialog
        open={showColumnPicker}
        onOpenChange={setShowColumnPicker}
        onConfirm={(columns) => {
          if (pendingFormat) runExport(pendingFormat, columns);
          setPendingFormat(null);
        }}
      />
    </>
  );
}
