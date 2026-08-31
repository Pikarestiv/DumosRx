"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Upload, AlertTriangle } from "lucide-react";
import {
  parseSpreadsheetFile,
  detectColumnMapping,
  mapRowToProduct,
  FIELD_LABELS,
  type ColumnMapping,
  type ProductField,
  type ProductImportRow,
} from "@/lib/utils/product-import-export";
import {
  findInFileDuplicates,
  importProductRows,
  type ImportResult,
} from "@/lib/db/queries/product-import";

type Step = "pick-file" | "map-columns" | "result";

interface ImportMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

const FIELD_OPTIONS = Object.values(FIELD_LABELS);
const LABEL_TO_FIELD: Record<string, ProductField> = Object.fromEntries(
  Object.entries(FIELD_LABELS).map(([field, label]) => [label, field as ProductField]),
);

export function ImportMappingDialog({
  open,
  onOpenChange,
  onImported,
}: ImportMappingDialogProps) {
  const [step, setStep] = useState<Step>("pick-file");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setStep("pick-file");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
  };

  const handleFile = async (file: File) => {
    const parsed = await parseSpreadsheetFile(file);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(detectColumnMapping(parsed.headers));
    setStep("map-columns");
  };

  const mappedRows = (): ProductImportRow[] =>
    rows
      .map((row) => mapRowToProduct(row, mapping))
      .filter((row): row is ProductImportRow => row !== null);

  const handleConfirmImport = async () => {
    const validRows = mappedRows();
    const duplicateGroups = findInFileDuplicates(validRows);
    if (duplicateGroups.length > 0) {
      const proceed = window.confirm(
        `${duplicateGroups.length} product name(s) appear more than once in this file with the same category. Importing anyway will merge them into one product (last row wins). Continue?`,
      );
      if (!proceed) return;
    }

    setImporting(true);
    try {
      const importResult = await importProductRows(validRows);
      setResult(importResult);
      setStep("result");
      onImported();
    } catch (err) {
      console.error("Failed to import products:", err);
      toast.error("Import failed. No changes were saved.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Import products"
      description="Upload a CSV or XLS/XLSX file exported from QuickBooks, Moniebook, or DumosRx."
    >
      <div className="flex flex-col gap-4 p-4">
        {step === "pick-file" && (
          <div className="relative">
            <Button variant="outline" asChild className="cursor-pointer">
              <label htmlFor="product-import-file">
                <Upload className="w-4 h-4 mr-2" />
                Select CSV or XLS/XLSX File
              </label>
            </Button>
            <input
              type="file"
              id="product-import-file"
              className="hidden"
              accept=".csv,.xls,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        )}

        {step === "map-columns" && (
          <>
            <p className="text-sm text-muted-foreground">
              We matched {Object.values(mapping).filter((f) => f !== "ignore").length} of{" "}
              {headers.length} columns automatically. Review or correct any below.
            </p>
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {headers.map((header) => (
                <div key={header} className="flex items-center gap-3">
                  <span className="w-1/2 text-sm truncate" title={header}>
                    {header}
                  </span>
                  <Combobox
                    options={FIELD_OPTIONS}
                    value={FIELD_LABELS[mapping[header]]}
                    onChange={(label) =>
                      setMapping((prev) => ({
                        ...prev,
                        [header]: LABEL_TO_FIELD[label],
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {rows.length} row(s) will be imported; rows without a mapped Product Name are skipped.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
              <Button onClick={handleConfirmImport} disabled={importing}>
                {importing ? "Importing..." : `Import ${rows.length} Row(s)`}
              </Button>
            </div>
          </>
        )}

        {step === "result" && result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              <strong>{result.created}</strong> product(s) created,{" "}
              <strong>{result.updated}</strong> updated,{" "}
              <strong>{result.skipped.length}</strong> skipped.
            </p>
            {result.skipped.length > 0 && (
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto text-xs text-muted-foreground">
                {result.skipped.map((s) => (
                  <div key={s.row} className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Row {s.row + 1}: {s.reason}
                  </div>
                ))}
              </div>
            )}
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
