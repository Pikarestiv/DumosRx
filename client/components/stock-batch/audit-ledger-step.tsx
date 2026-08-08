import type { AuditItem } from "./stock-audits";
import { formatCurrency } from "@/lib/utils";

interface AuditLedgerStepProps {
  items: AuditItem[];
  onUpdateItem: (id: string, patch: Partial<AuditItem>) => void;
}

/** Dense, single-screen alternative to the item-by-item count flow — every
 * in-scope row is visible and editable at once (qty, cost price, selling
 * price), matching the QuickBooks POS / Moniebook physical-inventory style
 * Cynthia asked for, instead of stepping through one item at a time. */
export function AuditLedgerStep({ items, onUpdateItem }: AuditLedgerStepProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="text-[17px] font-semibold mb-1.5">Ledger count</div>
      <div className="text-[13px] text-muted-foreground mb-4">
        Every field starts at the system's current value — edit only what's
        actually different. {items.length} item{items.length === 1 ? "" : "s"} in scope.
      </div>

      <div className="border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-[12.5px] border-collapse">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold">
              <th className="text-left px-3 py-2 sticky left-0 bg-muted/40">Item</th>
              <th className="text-right px-3 py-2">System Qty</th>
              <th className="text-right px-3 py-2">Counted Qty</th>
              <th className="text-right px-3 py-2">Cost Price</th>
              <th className="text-right px-3 py-2">Counted Cost</th>
              <th className="text-right px-3 py-2">Selling Price</th>
              <th className="text-right px-3 py-2">Counted Selling</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => {
              const qtyChanged = item.countedQty !== undefined && item.countedQty !== item.systemQty;
              const costChanged =
                item.countedCostPrice !== undefined && item.countedCostPrice !== item.costPrice;
              const sellingChanged =
                item.countedSellingPrice !== undefined &&
                item.countedSellingPrice !== item.sellingPrice;

              return (
                <tr key={item.id} className="hover:bg-accent/30">
                  <td className="px-3 py-2 sticky left-0 bg-card">
                    <div className="font-semibold text-foreground truncate max-w-[220px]">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70">{item.sku}</div>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {item.systemQty}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min="0"
                      className={`w-20 text-right border rounded-md px-2 py-1 outline-none focus:border-primary bg-background ${
                        qtyChanged ? "border-destructive text-destructive font-semibold" : "border-border"
                      }`}
                      value={item.countedQty ?? item.systemQty}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        onUpdateItem(item.id, { countedQty: isNaN(val) ? 0 : Math.max(0, val) });
                      }}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {item.costPrice !== undefined ? formatCurrency(item.costPrice) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`w-24 text-right border rounded-md px-2 py-1 outline-none focus:border-primary bg-background ${
                        costChanged ? "border-destructive text-destructive font-semibold" : "border-border"
                      }`}
                      value={item.countedCostPrice ?? item.costPrice ?? 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        onUpdateItem(item.id, { countedCostPrice: isNaN(val) ? 0 : Math.max(0, val) });
                      }}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {item.sellingPrice !== undefined ? formatCurrency(item.sellingPrice) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={`w-24 text-right border rounded-md px-2 py-1 outline-none focus:border-primary bg-background ${
                        sellingChanged ? "border-destructive text-destructive font-semibold" : "border-border"
                      }`}
                      value={item.countedSellingPrice ?? item.sellingPrice ?? 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        onUpdateItem(item.id, { countedSellingPrice: isNaN(val) ? 0 : Math.max(0, val) });
                      }}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No items in scope.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
