"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED = [".csv", ".xls", ".xlsx"];

interface Props {
  onFile: (file: File) => void;
  onReject: (message: string) => void;
}

/** Extension check on the drop path, which — unlike the picker — the
 * `accept` attribute does not police. */
function isSpreadsheet(name: string): boolean {
  return ACCEPTED.some((extension) => name.toLowerCase().endsWith(extension));
}

export function ImportDropZone({ onFile, onReject }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);

    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;

    if (files.length > 1) {
      onReject("Drop one file at a time.");
      return;
    }

    const file = files[0];
    if (!isSpreadsheet(file.name)) {
      onReject(`${file.name} isn't a spreadsheet. Drop a CSV or XLSX file.`);
      return;
    }

    onFile(file);
  };

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor="product-import-file"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          // Moving onto a child fires dragleave on the parent; ignore it.
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-white hover:border-primary/50 hover:bg-primary/5 dark:bg-slate-900",
        )}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FileSpreadsheet className="h-7 w-7" />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-base font-semibold">Drop your spreadsheet here</span>
          <span className="text-sm text-muted-foreground">
            or choose a file from this device
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          CSV or XLSX. Save older .xls files as .xlsx first.
        </span>
        <input
          type="file"
          id="product-import-file"
          // sr-only rather than hidden: a hidden input is not focusable, so
          // there was no keyboard route to the file picker at all.
          className="sr-only"
          accept={ACCEPTED.join(",")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      </label>
    </div>
  );
}
