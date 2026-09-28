"use client";

import React from "react";
import { HelpCircle, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { formatCurrency } from "@/lib/utils";
import type { PurchaseOrderItem } from "@/lib/db/local-database";
import type { ReceivedItemPayload } from "./receive-po-panel";
import {
  clampMoneyInput,
  clampReceivedQuantity,
  outstandingBulkQuantity,
  resolveBaseUnitCost,
} from "./po-line-item-math";
import { ReceiveItemCategoryEditor } from "./receive-item-category-editor";

/** One-item-at-a-time cards, used on phones, where the ledger table's
 * columns would be too cramped to use even with horizontal scroll. */
export const ReceiveItemCard = React.memo(
  ({
    item,
    state,
    onFieldChange,
  }: {
    item: PurchaseOrderItem;
    state: ReceivedItemPayload;
    onFieldChange: (
      itemId: string,
      field: keyof ReceivedItemPayload,
      value: string | number,
    ) => void;
  }) => {
    const outstanding = outstandingBulkQuantity(item);
    const alreadyReceived = Number(item.quantity_received) || 0;
    const unitsPerBulk = item.product_units_per_bulk || item.units_per_bulk || 1;
    const orderedBaseUnitCost = resolveBaseUnitCost({
      unitCost: item.unit_cost,
      unitsPerBulk,
    });
    return (
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="font-semibold text-[15px]">{item.product_name}</h4>
              <ReceiveItemCategoryEditor
                productId={item.product_id}
                productName={item.product_name}
                categoryName={item.category_name}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Ordered: {item.bulk_quantity} {item.bulk_unit}(s) @{" "}
              {formatCurrency(item.unit_cost)}/{item.bulk_unit}
            </p>
            {alreadyReceived > 0 && (
              <p className="text-sm text-amber-600 font-medium">
                Already received: {alreadyReceived} · outstanding: {outstanding}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4 bg-muted/20 p-4 rounded-lg">
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1">
              Qty Received (in {item.bulk_unit}s)
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 opacity-50 cursor-pointer" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Enter the number of {item.bulk_unit}s received, not base
                      units. This is automatically converted to{" "}
                      {(item.product_units_per_bulk || item.units_per_bulk) *
                        (Number(state.quantity ?? outstanding) || 0)}{" "}
                      base units in stock, using the product&apos;s current
                      packaging setting.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Input
              type="number"
              min="0"
              max={outstanding}
              aria-label={`Quantity received for ${item.product_name}`}
              value={state.quantity ?? outstanding}
              onChange={(e) =>
                onFieldChange(
                  item.id,
                  "quantity",
                  // min/max are only HTML hints — a typed "-5"/"500" still
                  // reaches onChange, and an unclamped value would either
                  // corrupt on-hand stock or book more than was ordered.
                  clampReceivedQuantity(e.target.value, outstanding),
                )
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">
                Cost Price per {item.base_unit} (Optional)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                aria-label={`Cost Price per ${item.base_unit} for ${item.product_name}`}
                placeholder={formatCurrency(orderedBaseUnitCost)}
                value={state.cost_price ?? ""}
                onChange={(e) =>
                  onFieldChange(
                    item.id,
                    "cost_price",
                    clampMoneyInput(e.target.value),
                  )
                }
              />
              {!!item.last_bought_price && (
                <p className="text-[10.5px] text-muted-foreground">
                  Last bought at {formatCurrency(item.last_bought_price)} per{" "}
                  {item.base_unit}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">New Selling Price (Optional)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                aria-label={`New Selling Price for ${item.product_name}`}
                placeholder="Unchanged"
                value={state.selling_price ?? ""}
                onChange={(e) =>
                  onFieldChange(
                    item.id,
                    "selling_price",
                    clampMoneyInput(e.target.value),
                  )
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Lot / Batch No. (Optional)</Label>
            <Input
              aria-label={`Lot or batch number for ${item.product_name}`}
              placeholder="e.g. BATCH-123"
              value={state.lot_number || ""}
              onChange={(e) =>
                onFieldChange(item.id, "lot_number", e.target.value)
              }
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Expiry Date (Optional)</Label>
            <DatePickerInput
              value={state.expiry_date}
              onChange={(val) => onFieldChange(item.id, "expiry_date", val)}
              ariaLabel={`Expiry date for ${item.product_name}`}
              placeholder="Select expiry date"
              disablePast
              fromYear={new Date().getFullYear()}
              toYear={new Date().getFullYear() + 15}
            />
            <div className="text-[11px] text-muted-foreground bg-primary/5 border border-primary/20 rounded-[10px] px-3 py-2 flex gap-1.5 items-start">
              <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                If the package only shows a month and year, pick the 1st of
                that month.
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
ReceiveItemCard.displayName = "ReceiveItemCard";
