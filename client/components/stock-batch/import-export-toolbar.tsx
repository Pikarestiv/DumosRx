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
import { downloadBlob } from "@/lib/utils/report-pdf";
import { EXPORT_COLUMNS, buildExportBlob } from "@/lib/utils/product-import-export";
import { getProductsForExport, type ExportableProduct } from "@/lib/db/queries/product-export";
import { ImportMappingDialog } from "./import-mapping-dialog";
import { ExportColumnsDialog } from "./export-columns-dialog";

interface ImportExportToolbarProps {
  onImported: () => void;
}

export function ImportExportToolbar({ onImported }: ImportExportToolbarProps) {
  const [showImport, setShowImport] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<"csv" | "xlsx" | null>(null);

  const runExport = async (
    format: "csv" | "xlsx",
    columns: (keyof ExportableProduct)[],
  ) => {
    const products = await getProductsForExport();
    const blob = buildExportBlob(products, columns, format);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `DumosRx_Products_${dateStr}.${format}`);
    toast.success(`Exported ${products.length} product(s)`);
  };

  const handleExportClick = (format: "csv" | "xlsx", chooseColumns: boolean) => {
    if (chooseColumns) {
      setPendingFormat(format);
      setShowColumnPicker(true);
      return;
    }
    runExport(format, EXPORT_COLUMNS.map((c) => c.key));
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-[12px]">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
