import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FilterPill } from "@/components/ui/filter-pill";
import type { AuditItem } from "./stock-audits";
import { formatCurrency } from "@/lib/utils";

const ALL_CATEGORIES = "__all__";
const GRID_COLS =
  "grid-cols-[220px_100px_100px_90px_100px_110px_100px_110px_120px_110px]";

function formatDiffCurrency(amount: number) {
  return amount > 0 ? `+${formatCurrency(amount)}` : formatCurrency(amount);
}

function diffClassName(amount: number) {
  if (amount === 0) return "text-muted-foreground";
  return amount > 0 ? "text-emerald-600" : "text-destructive";
}

interface AuditLedgerStepProps {
  items: AuditItem[];
  totalItems: number;
  isLoading: boolean;
  isSyncing: boolean;
  onUpdateItem: (id: string, patch: Partial<AuditItem>) => void;
  categories: { id: string; label: string; count: number }[];
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  search: string;
  setSearch: (val: string) => void;
}

/** Dense, single-screen count flow — every item is visible and editable at
 * once (qty, cost price, selling price), matching the QuickBooks POS /
 * Moniebook physical-inventory style Cynthia asked for. The category picker
 * is just a lens on this one continuous session, not a scope gate — every
 * item is pre-filled and counted from the moment the screen opens, so
 * switching categories mid-count never loses anything already entered.
 * Div-based, ARIA roles standing in for real <table> semantics — see
 * stock-batch/supplier-table.tsx. */
export function AuditLedgerStep({
  items,
  totalItems,
  isLoading,
  isSyncing,
  onUpdateItem,
  categories,
  selectedCategory,
  setSelectedCategory,
  search,
  setSearch,
}: AuditLedgerStepProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 pb-4">
      <div className="text-[17px] font-semibold mb-1.5">Physical inventory</div>
      <div className="text-[13px] text-muted-foreground mb-4">
        Every field starts at the system&apos;s current value. Edit only
        what&apos;s actually different.{" "}
        {isSyncing
          ? "Syncing latest stock levels…"
          : `(${items.length} of ${totalItems} item${totalItems === 1 ? "" : "s"} shown)`}
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <FilterPill
          label="Category"
          value={selectedCategory}
          onValueChange={setSelectedCategory}
          allValue={ALL_CATEGORIES}
          options={[
            { value: ALL_CATEGORIES, label: "All Categories" },
            ...categories.map((c) => ({
              value: c.id,
              label: `${c.label} (${c.count})`,
            })),
          ]}
        />
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name or SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-[13px]"
          />
        </div>
      </div>

      {isLoading && (
        <div className="text-center p-8 text-muted-foreground">
          Loading items...
        </div>
      )}

      {!isLoading && (
        <div className="border border-border rounded-xl overflow-x-auto">
          <div
            role="table"
            aria-label="Physical inventory count"
            className="w-full text-[12.5px]"
          >
            <div role="rowgroup">
              <div
                role="row"
                className={`grid ${GRID_COLS} bg-muted/40 text-muted-foreground text-[11px] uppercase font-semibold`}
              >
                <div
                  role="columnheader"
                  className="text-left px-3 py-2 sticky left-0 z-10 bg-muted"
                >
                  Item
                </div>
                <div role="columnheader" className="text-right px-3 py-2">
                  Counted Qty
                </div>
                <div role="columnheader" className="text-right px-3 py-2">
                  System Qty
                </div>
                <div role="columnheader" className="text-right px-3 py-2">
                  Diff Qty
                </div>
                <div role="columnheader" className="text-right px-3 py-2">
                  Cost Price
                </div>
                <div role="columnheader" className="text-right px-3 py-2">
                  Counted Cost
                </div>
                <div role="columnheader" className="text-right px-3 py-2">
                  Diff Cost
                </div>
                <div role="columnheader" className="text-right px-3 py-2">
                  Selling Price
                </div>
                <div role="columnheader" className="text-right px-3 py-2">
                  Counted Selling
                </div>
                <div role="columnheader" className="text-right px-3 py-2">
                  Diff Selling
                </div>
              </div>
            </div>

            <div role="rowgroup" className="divide-y divide-border">
              {items.map((item) => {
                const countedQty = item.countedQty ?? item.systemQty;
                const diffQty = countedQty - item.systemQty;
                const diffCost =
                  item.costPrice !== undefined
                    ? (item.countedCostPrice ?? item.costPrice) - item.costPrice
                    : 0;
                const diffSelling =
                  item.sellingPrice !== undefined
                    ? (item.countedSellingPrice ?? item.sellingPrice) -
                      item.sellingPrice
                    : 0;
                const costChanged =
                  item.countedCostPrice !== undefined &&
                  item.countedCostPrice !== item.costPrice;
                const sellingChanged =
                  item.countedSellingPrice !== undefined &&
                  item.countedSellingPrice !== item.sellingPrice;

                return (
                  <div
                    key={item.id}
                    role="row"
                    className={`grid ${GRID_COLS} hover:bg-accent/10`}
                  >
                    <div
                      role="cell"
                      className="px-3 py-2 sticky left-0 z-10 bg-card"
                    >
                      <div className="font-semibold text-foreground truncate max-w-[220px]">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground/70">
                        {item.sku}
                      </div>
                    </div>
                    <div
                      role="cell"
                      className="px-2 py-1.5 text-right flex items-center justify-end"
                    >
                      <input
                        type="number"
                        min="0"
                        className={`w-20 text-right border rounded-md px-2 py-1 outline-none focus:border-primary bg-background ${
                          diffQty !== 0
                            ? "border-destructive text-destructive font-semibold"
                            : "border-border"
                        }`}
                        value={countedQty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          onUpdateItem(item.id, {
                            countedQty: isNaN(val) ? 0 : Math.max(0, val),
                          });
                        }}
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                    <div
                      role="cell"
                      className="px-3 py-2 text-right text-muted-foreground flex items-center justify-end"
                    >
                      {item.systemQty}
                    </div>
                    <div
                      role="cell"
                      className={`px-3 py-2 text-right font-semibold flex items-center justify-end ${diffClassName(diffQty)}`}
                    >
                      {diffQty > 0 ? `+${diffQty}` : diffQty}
                    </div>
                    <div
                      role="cell"
                      className="px-3 py-2 text-right text-muted-foreground flex items-center justify-end"
                    >
                      {item.costPrice !== undefined
                        ? formatCurrency(item.costPrice)
                        : "—"}
                    </div>
                    <div
                      role="cell"
                      className="px-2 py-1.5 text-right flex items-center"
                    >
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`w-24 text-right border rounded-md px-2 py-1 outline-none focus:border-primary bg-background ${
                          costChanged
                            ? "border-destructive text-destructive font-semibold"
                            : "border-border"
                        }`}
                        value={item.countedCostPrice ?? item.costPrice ?? 0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          onUpdateItem(item.id, {
                            countedCostPrice: isNaN(val) ? 0 : Math.max(0, val),
                          });
                        }}
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                    <div
                      role="cell"
                      className={`px-3 py-2 text-right font-semibold flex items-center justify-end ${diffClassName(diffCost)}`}
                    >
                      {item.costPrice !== undefined
                        ? formatDiffCurrency(diffCost)
                        : "—"}
                    </div>
                    <div
                      role="cell"
                      className="px-3 py-2 text-right text-muted-foreground flex items-center justify-end"
                    >
                      {item.sellingPrice !== undefined
                        ? formatCurrency(item.sellingPrice)
                        : "—"}
                    </div>
                    <div
                      role="cell"
                      className="px-2 py-1.5 text-right flex items-center"
                    >
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`w-24 text-right border rounded-md px-2 py-1 outline-none focus:border-primary bg-background ${
                          sellingChanged
                            ? "border-destructive text-destructive font-semibold"
                            : "border-border"
                        }`}
                        value={
                          item.countedSellingPrice ?? item.sellingPrice ?? 0
                        }
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          onUpdateItem(item.id, {
                            countedSellingPrice: isNaN(val)
                              ? 0
                              : Math.max(0, val),
                          });
                        }}
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                    <div
                      role="cell"
                      className={`px-3 py-2 text-right font-semibold flex items-center justify-end ${diffClassName(diffSelling)}`}
                    >
                      {item.sellingPrice !== undefined
                        ? formatDiffCurrency(diffSelling)
                        : "—"}
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && (
                <div role="row" className={`grid ${GRID_COLS}`}>
                  <div
                    role="cell"
                    className="col-span-10 px-3 py-8 text-center text-muted-foreground"
                  >
                    No items match.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
