"use client";

import { useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EXPORT_COLUMNS } from "@/lib/utils/product-import-export";
import type { ExportableProduct } from "@/lib/db/queries/product-export";

const STORAGE_KEY = "drx_export_columns";

export function getStoredExportColumns(): (keyof ExportableProduct)[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredExportColumns(columns: (keyof ExportableProduct)[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
}

interface ExportColumnsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (columns: (keyof ExportableProduct)[]) => void;
}

export function ExportColumnsDialog({
  open,
  onOpenChange,
  onConfirm,
}: ExportColumnsDialogProps) {
  const allKeys = EXPORT_COLUMNS.map((c) => c.key);
  const [selected, setSelected] = useState<Set<keyof ExportableProduct>>(
    () => new Set(getStoredExportColumns() ?? allKeys),
  );

  const toggle = (key: keyof ExportableProduct) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    const columns = EXPORT_COLUMNS.map((c) => c.key).filter((key) =>
      selected.has(key),
    );
    setStoredExportColumns(columns);
    onConfirm(columns);
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Choose columns to export"
      footer={
        <div className="flex justify-end gap-2 p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selected.size === 0}>
            Export
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {EXPORT_COLUMNS.map((column) => (
          <div key={column.key} className="flex items-center gap-2">
            <Checkbox
              id={`export-col-${column.key}`}
              checked={selected.has(column.key)}
              onCheckedChange={() => toggle(column.key)}
            />
            <Label htmlFor={`export-col-${column.key}`}>{column.label}</Label>
          </div>
        ))}
      </div>
    </ResponsiveModal>
  );
}
