"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  clampLabelQuantity,
  describeLabelPaper,
  LABEL_LAYOUTS,
  labelsPerPage,
  MAX_LABEL_QUANTITY,
  type LabelLayoutId,
} from "./barcode-label-sheet";

const QUANTITY_PRESETS = [1, 10, 24, 48];
const LAYOUT_IDS = Object.keys(LABEL_LAYOUTS) as LabelLayoutId[];
const SECTION_LABEL = "text-xs font-bold uppercase tracking-widest text-muted-foreground";

interface BarcodeLabelOptionsProps {
  quantityText: string;
  onQuantityTextChange: (value: string) => void;
  layout: LabelLayoutId;
  onLayoutChange: (layout: LabelLayoutId) => void;
  startText: string;
  onStartTextChange: (value: string) => void;
  startPosition: number;
  quantityLabel?: string;
  totalLabels?: number;
}

export function BarcodeLabelOptions({
  quantityText,
  onQuantityTextChange,
  layout,
  onLayoutChange,
  startText,
  onStartTextChange,
  startPosition,
  quantityLabel = "Number of labels",
  totalLabels,
}: BarcodeLabelOptionsProps) {
  const quantity = clampLabelQuantity(Number(quantityText));
  const setQuantity = (value: number) => onQuantityTextChange(String(clampLabelQuantity(value)));

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Label htmlFor="label-quantity" className={SECTION_LABEL}>
          {quantityLabel}
        </Label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            aria-label="One fewer label"
            onClick={() => setQuantity(quantity - 1)}
            disabled={quantity <= 1}
          >
            <Minus className="w-5 h-5" />
          </Button>
          <Input
            id="label-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_LABEL_QUANTITY}
            value={quantityText}
            onChange={(e) => onQuantityTextChange(e.target.value)}
            onBlur={() => setQuantity(Number(quantityText))}
            className="h-11 min-w-0 flex-1 text-center text-lg font-bold"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl"
            aria-label="One more label"
            onClick={() => setQuantity(quantity + 1)}
            disabled={quantity >= MAX_LABEL_QUANTITY}
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUANTITY_PRESETS.map((preset) => (
            <Button
              key={preset}
              variant={preset === quantity ? "secondary" : "outline"}
              size="sm"
              aria-label={`${preset} label${preset === 1 ? "" : "s"}`}
              className="rounded-lg"
              onClick={() => setQuantity(preset)}
            >
              {preset}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className={SECTION_LABEL}>Paper</p>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUT_IDS.map((id) => (
            <Button
              key={id}
              variant="outline"
              aria-pressed={layout === id}
              onClick={() => onLayoutChange(id)}
              className={cn(
                "h-auto min-w-0 flex-col items-start gap-0.5 whitespace-normal rounded-xl px-3 py-2 text-left",
                layout === id
                  ? "border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <span className="font-bold">{LABEL_LAYOUTS[id].title}</span>
              <span className="text-xs font-normal text-muted-foreground">{LABEL_LAYOUTS[id].detail}</span>
            </Button>
          ))}
        </div>
        {layout === "a4" && (
          <div className="space-y-2">
            <Label htmlFor="label-start">Start at position</Label>
            <Input
              id="label-start"
              type="number"
              inputMode="numeric"
              min={1}
              max={labelsPerPage(layout)}
              value={startText}
              onChange={(e) => onStartTextChange(e.target.value)}
              onBlur={() => onStartTextChange(String(startPosition))}
              className="h-10 w-24"
            />
            <p className="text-xs text-muted-foreground">
              Using a partly used sheet? Skip the labels already peeled off, counted across then down from the top left.
              Print at 100% scale with &quot;Fit to page&quot; off so labels line up.
            </p>
          </div>
        )}
        <p className="text-sm font-medium">{describeLabelPaper(layout, totalLabels ?? quantity, startPosition)}</p>
      </div>
    </div>
  );
}
