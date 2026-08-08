import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import type { PurchaseOrderItem } from "@/lib/db/local-database";
import type { ReceivedItemPayload } from "./receive-po-modal";
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

/** Dense, single-screen alternative to the per-item receiving cards — every
 * line is visible and editable at once (qty, cost price, an optional new
 * selling price, batch #, expiry), matching the QuickBooks POS / Moniebook
 * receiving-ledger style Cynthia asked for. */
export function ReceiveLedgerTable({ items, receivedItems, onFieldChange }: ReceiveLedgerTableProps) {
  return (
    <div className="border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold">
            <th className="text-left px-3 py-2 sticky left-0 bg-muted/40">Item</th>
            <th className="text-right px-3 py-2">Ordered</th>
            <th className="text-right px-3 py-2">Received Qty</th>
            <th className="text-right px-3 py-2">Cost Price</th>
            <th className="text-right px-3 py-2">New Selling Price</th>
            <th className="text-left px-3 py-2">Batch #</th>
            <th className="text-left px-3 py-2">Expiry</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => {
            const state = receivedItems[item.id] || ({} as ReceivedItemPayload);
            return (
              <tr key={item.id} className="hover:bg-accent/30">
                <td className="px-3 py-2 sticky left-0 bg-card">
                  <div className="font-semibold text-foreground truncate max-w-[200px]">
                    {item.product_name}
                  </div>
                  <div className="text-[11px] text-muted-foreground/70">
                    {item.bulk_unit}(s)
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {item.bulk_quantity}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Input
                    type="number"
                    min="0"
                    className="w-20 text-right"
                    value={state.quantity ?? item.bulk_quantity}
                    onChange={(e) =>
                      onFieldChange(item.id, "quantity", parseInt(e.target.value) || 0)
                    }
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-24 text-right"
                    placeholder={formatCurrency(item.unit_cost)}
                    value={state.cost_price ?? ""}
                    onChange={(e) => onFieldChange(item.id, "cost_price", e.target.value)}
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-24 text-right"
                    placeholder="Unchanged"
                    value={state.selling_price ?? ""}
                    onChange={(e) => onFieldChange(item.id, "selling_price", e.target.value)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    className="w-28"
                    placeholder="e.g. BATCH-123"
                    value={state.lot_number || ""}
                    onChange={(e) => onFieldChange(item.id, "lot_number", e.target.value)}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <DatePickerInput
                    value={state.expiry_date}
                    onChange={(val) => onFieldChange(item.id, "expiry_date", val)}
                    placeholder="Select"
                    disablePast
                    fromYear={new Date().getFullYear()}
                    toYear={new Date().getFullYear() + 15}
                  />
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                No items on this order.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
