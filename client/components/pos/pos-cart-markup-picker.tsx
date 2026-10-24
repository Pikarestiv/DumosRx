"use client";

import type { RefObject } from "react";
import { Switch } from "@/components/ui/switch";
import type { MarkupType } from "@/lib/hooks/use-pos-cart";

interface POSCartMarkupPickerProps {
  pickerRef: RefObject<HTMLDivElement | null>;
  alert: boolean;
  isResellerSale: boolean;
  onResellerSaleChange: (value: boolean) => void;
  markupType: MarkupType | null;
  setMarkupType?: (value: MarkupType | null) => void;
}

const markupOptionClass = (selected: boolean) =>
  `flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
    selected
      ? "bg-primary text-primary-foreground"
      : "bg-background border border-border text-muted-foreground hover:text-foreground"
  }`;

export function POSCartMarkupPicker({
  pickerRef,
  alert,
  isResellerSale,
  onResellerSaleChange,
  markupType,
  setMarkupType,
}: POSCartMarkupPickerProps) {
  return (
    <div
      ref={pickerRef}
      className={`mx-5 mt-3 flex flex-col gap-2 px-3 py-2 rounded-lg border bg-muted/20 shrink-0 ${
        alert ? "animate-attention-shake border-destructive ring-2 ring-destructive/30" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold text-foreground">
          Reseller sale
        </span>
        <Switch checked={isResellerSale} onCheckedChange={onResellerSaleChange} />
      </div>
      {isResellerSale && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMarkupType?.("reseller")}
            className={markupOptionClass(markupType === "reseller")}
          >
            For a Reseller Agent
          </button>
          <button
            type="button"
            onClick={() => setMarkupType?.("store")}
            className={markupOptionClass(markupType === "store")}
          >
            Store Markup
          </button>
        </div>
      )}
    </div>
  );
}
