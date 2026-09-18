"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload, Download, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  downloadBlob,
  generateReportPdfBlob,
  openBlobForPrint,
} from "@/lib/utils/report-pdf";
import {
  EXPORT_COLUMNS,
  buildExportBlob,
  buildExportRows,
  buildStockAuditRows,
} from "@/lib/utils/product-import-export";
import {
  getProductsForExport,
  type ExportableProduct,
} from "@/lib/db/queries/product-export";
import { useStore } from "@/lib/context/store-context";
import { ImportMappingDialog } from "./import-mapping-dialog";
import { ExportColumnsDialog } from "./export-columns-dialog";

interface ImportExportToolbarProps {
  onImported: () => void;
  /** The catalog table's currently-filtered product ids (search/category/
   * status), so Export defaults to "what's on screen" instead of always the
   * whole store — undefined (no filter active) exports everything. */
  filteredProductIds?: string[];
}

export function ImportExportToolbar({
  onImported,
  filteredProductIds,
}: ImportExportToolbarProps) {
  const { storeProfile } = useStore();
  const [showImport, setShowImport] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<
    "csv" | "xlsx" | "pdf" | null
  >(null);
  const isFiltered = filteredProductIds !== undefined;

  const runExport = async (
    format: "csv" | "xlsx" | "pdf",
    columns: (keyof ExportableProduct)[],
  ) => {
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
  };

  const handleExportClick = (
    format: "csv" | "xlsx" | "pdf",
    chooseColumns: boolean,
  ) => {
    if (chooseColumns) {
      setPendingFormat(format);
      setShowColumnPicker(true);
      return;
    }
    runExport(
      format,
      EXPORT_COLUMNS.map((c) => c.key),
    );
  };

  const handlePrintStockAudit = async () => {
    const products = await getProductsForExport(filteredProductIds);
    const { headers, rows, columnFlex } = buildStockAuditRows(products);
    const blob = await generateReportPdfBlob({
      storeName: storeProfile?.name || "",
      title: "Stock Audit Sheet",
      subtitle: isFiltered
        ? `${products.length} filtered product(s)`
        : `${products.length} product(s)`,
      headers,
      rows,
      columnFlex,
    });
    openBlobForPrint(blob);
  };

  return (
    <>
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

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-[12px]"
        onClick={handlePrintStockAudit}
      >
        <ClipboardCheck className="h-3.5 w-3.5" />
        Print Stock Audit
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
          <DropdownMenuItem onClick={() => handleExportClick("csv", false)}>
            Export as CSV (all columns)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportClick("xlsx", false)}>
            Export as XLSX (all columns)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportClick("csv", true)}>
            Export as CSV (choose columns)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportClick("xlsx", true)}>
            Export as XLSX (choose columns)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportClick("pdf", false)}>
            Export as PDF (all columns)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportClick("pdf", true)}>
            Export as PDF (choose columns)
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
