"use client";

import { useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getExportColumns } from "@/lib/utils/product-import-export";
import type { ExportableProduct } from "@/lib/db/queries/product-export";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { useHasPermission } from "@/lib/hooks/use-permissions";

const STORAGE_KEY = STORAGE_KEYS.exportColumns;

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
  const canViewCost = useHasPermission("view_cost_fields");
  const availableColumns = getExportColumns(canViewCost);
  const availableKeys = availableColumns.map((c) => c.key);

  const [selected, setSelected] = useState<Set<keyof ExportableProduct>>(() => {
    const stored = getStoredExportColumns();
    if (!stored) return new Set(availableKeys);
    return new Set(stored.filter((k) => availableKeys.includes(k)));
  });

  const toggle = (key: keyof ExportableProduct) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    const columns = availableColumns
      .map((c) => c.key)
      .filter((key) => selected.has(key));
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
        {availableColumns.map((column) => (
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
