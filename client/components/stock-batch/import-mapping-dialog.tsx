"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Upload, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import type { WorkBook } from "xlsx";
import {
  readWorkbookFile,
  parseWorkbookSheet,
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

type Step = "pick-file" | "pick-sheet" | "map-columns" | "importing" | "result";

interface ImportMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

const FIELD_OPTIONS = Object.values(FIELD_LABELS);
const LABEL_TO_FIELD: Record<string, ProductField> = Object.fromEntries(
  Object.entries(FIELD_LABELS).map(([field, label]) => [
    label,
    field as ProductField,
  ]),
);

export function ImportMappingDialog({
  open,
  onOpenChange,
  onImported,
}: ImportMappingDialogProps) {
  const [step, setStep] = useState<Step>("pick-file");
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [updateStockForMatched, setUpdateStockForMatched] = useState(false);
  const { user } = useAuth();

  const reset = () => {
    setStep("pick-file");
    setWorkbook(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setProgress({ completed: 0, total: 0 });
    setResult(null);
    setUpdateStockForMatched(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const loadSheet = (wb: WorkBook, sheetName: string) => {
    const parsed = parseWorkbookSheet(wb, sheetName);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(detectColumnMapping(parsed.headers));
    setStep("map-columns");
  };

  const handleFile = async (file: File) => {
    const wb = await readWorkbookFile(file);
    setWorkbook(wb);
    if (wb.SheetNames.length > 1) {
      setStep("pick-sheet");
    } else {
      loadSheet(wb, wb.SheetNames[0]);
    }
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

    setProgress({ completed: 0, total: validRows.length });
    setStep("importing");
    try {
      const importResult = await importProductRows(
        validRows,
        (completed, total) => {
          setProgress({ completed, total });
        },
        { updateStockForMatched, performedBy: user?.id ?? null },
      );
      setResult(importResult);
      setStep("result");
      onImported();
    } catch (err) {
      console.error("Failed to import products:", err);
      toast.error("Import failed. No changes were saved.");
      setStep("map-columns");
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Import products"
      description="Upload a CSV or XLS/XLSX file."
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

        {step === "pick-sheet" && workbook && (
          <>
            <p className="text-sm text-muted-foreground">
              This file has {workbook.SheetNames.length} sheets. Select the
              one with your product list.
            </p>
            <Combobox
              options={workbook.SheetNames}
              value=""
              placeholder="Select a sheet"
              onChange={(sheetName) => loadSheet(workbook, sheetName)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
            </div>
          </>
        )}

        {step === "map-columns" && (
          <>
            <p className="text-sm text-muted-foreground">
              We matched{" "}
              {Object.values(mapping).filter((f) => f !== "ignore").length} of{" "}
              {headers.length} columns automatically. Review or correct any
              below.
            </p>
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {headers.map((header) => (
                <div
                  key={header}
                  className="grid grid-cols-2 gap-3 items-center"
                >
                  <span className="text-sm truncate" title={header}>
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
              {rows.length} row(s) will be imported; rows without a mapped
              Product Name are skipped.
            </p>
            <div className="flex items-start gap-2 rounded-md border border-border p-3">
              <Checkbox
                id="update-stock-for-matched"
                checked={updateStockForMatched}
                onCheckedChange={(checked) => setUpdateStockForMatched(checked === true)}
                className="mt-0.5"
              />
              <div className="grid gap-1">
                <Label htmlFor="update-stock-for-matched" className="text-sm font-medium cursor-pointer">
                  Also update stock for existing products
                </Label>
                <p className="text-xs text-muted-foreground">
                  Off by default: a product already in your catalog only has its
                  name/price/category updated, never its stock (so re-importing
                  the same file twice can&apos;t double-count quantity). Turn
                  this on if this file has current stock counts you want
                  applied — recorded as a proper stock adjustment, visible in
                  Stock Movements.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  workbook && workbook.SheetNames.length > 1
                    ? setStep("pick-sheet")
                    : reset()
                }
              >
                Back
              </Button>
              <Button onClick={handleConfirmImport}>
                Import {rows.length} Row(s)
              </Button>
            </div>
          </>
        )}

        {step === "importing" && (
          <div className="flex flex-col gap-3 py-4">
            <p className="text-sm text-muted-foreground">
              Importing {progress.completed} of {progress.total} row(s)...
            </p>
            <Progress
              value={
                progress.total > 0
                  ? (progress.completed / progress.total) * 100
                  : 0
              }
            />
          </div>
        )}

        {step === "result" && result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              <strong>{result.created}</strong> product(s) created,{" "}
              <strong>{result.updated}</strong> updated,{" "}
              <strong>{result.skipped.length}</strong> skipped
              {updateStockForMatched && (
                <>
                  , <strong>{result.stockAdjusted}</strong> stock count(s) adjusted
                </>
              )}
              .
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
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
