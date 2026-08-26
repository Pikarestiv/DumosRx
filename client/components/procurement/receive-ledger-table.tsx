import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ResponsiveTabLabel } from "@/components/ui/responsive-tab-label";
import type { PurchaseOrderItem } from "@/lib/db/local-database";
import type { ReceivedItemPayload } from "./receive-po-panel";
import { formatCurrency } from "@/lib/utils";

interface ReceiveLedgerTableProps {
  items: PurchaseOrderItem[];
  receivedItems: Record<string, ReceivedItemPayload>;
  onFieldChange: (
    itemId: string,
    field: keyof ReceivedItemPayload,
    value: string | number,
  ) => void;
}

const GRID_COLS = "grid-cols-[220px_90px_110px_120px_140px_150px_150px]";

/** Dense, single-screen alternative to the per-item receiving cards. Every
 * line is visible and editable at once (qty, cost price, an optional new
 * selling price, batch #, expiry), matching the QuickBooks POS / Moniebook
 * receiving-ledger style Cynthia asked for. Div-based, ARIA roles standing
 * in for real <table> semantics; see stock-batch/supplier-table.tsx. */
export function ReceiveLedgerTable({
  items,
  receivedItems,
  onFieldChange,
}: ReceiveLedgerTableProps) {
  return (
    <div className="border border-border rounded-xl overflow-x-auto">
      <div role="table" aria-label="Items to receive" className="w-full text-[12.5px]">
        <div role="rowgroup">
          <div role="row" className={`grid ${GRID_COLS} bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold`}>
            <div role="columnheader" className="text-left px-3 py-2 sticky left-0 bg-muted/40">
              Item
            </div>
            <div role="columnheader" className="text-right px-3 py-2">Ordered</div>
            <div role="columnheader" className="text-right px-3 py-2">
              <ResponsiveTabLabel short="Recv." long="Received Qty" />
            </div>
            <div role="columnheader" className="text-right px-3 py-2">
              <ResponsiveTabLabel short="Cost" long="Cost Price" />
            </div>
            <div role="columnheader" className="text-right px-3 py-2">
              <ResponsiveTabLabel short="Sell Price" long="New Selling Price" />
            </div>
            <div role="columnheader" className="text-left px-3 py-2">Batch #</div>
            <div role="columnheader" className="text-left px-3 py-2">Expiry</div>
          </div>
        </div>

        <div role="rowgroup" className="divide-y divide-border">
          {items.map((item) => {
            const state = receivedItems[item.id] || ({} as ReceivedItemPayload);
            return (
              <div key={item.id} role="row" className={`grid ${GRID_COLS}`}>
                <div role="cell" className="px-3 py-2 sticky left-0 bg-card">
                  <div className="font-semibold text-foreground truncate max-w-[200px]">
                    {item.product_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground/70">
                    {item.bulk_unit}(s)
                  </div>
                </div>
                <div role="cell" className="px-3 py-2 text-right text-muted-foreground flex items-center justify-end">
                  {item.bulk_quantity}
                </div>
                <div role="cell" className="px-3 py-2 text-right flex items-center">
                  <Input
                    type="number"
                    min="0"
                    className="w-full min-w-16 text-right"
                    value={state.quantity ?? item.bulk_quantity}
                    onChange={(e) =>
                      onFieldChange(
                        item.id,
                        "quantity",
                        parseInt(e.target.value) || 0,
                      )
                    }
                  />
                </div>
                <div role="cell" className="px-3 py-2 text-right flex items-center">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full min-w-20 text-right"
                    placeholder={formatCurrency(item.unit_cost)}
                    value={state.cost_price ?? ""}
                    onChange={(e) =>
                      onFieldChange(item.id, "cost_price", e.target.value)
                    }
                  />
                </div>
                <div role="cell" className="px-3 py-2 text-right flex items-center">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full min-w-20 text-right"
                    placeholder="Unchanged"
                    value={state.selling_price ?? ""}
                    onChange={(e) =>
                      onFieldChange(item.id, "selling_price", e.target.value)
                    }
                  />
                </div>
                <div role="cell" className="px-3 py-2 flex items-center">
                  <Input
                    className="w-full min-w-24"
                    placeholder="e.g. BATCH-123"
                    value={state.lot_number || ""}
                    onChange={(e) =>
                      onFieldChange(item.id, "lot_number", e.target.value)
                    }
                  />
                </div>
                <div role="cell" className="px-3 py-2 flex items-center">
                  <DatePickerInput
                    value={state.expiry_date}
                    onChange={(val) =>
                      onFieldChange(item.id, "expiry_date", val)
                    }
                    placeholder="Select"
                    disablePast
                    fromYear={new Date().getFullYear()}
                    toYear={new Date().getFullYear() + 15}
                  />
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div role="row" className={`grid ${GRID_COLS}`}>
              <div role="cell" className="col-span-7 px-3 py-8 text-center text-muted-foreground">
                No items on this order.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
