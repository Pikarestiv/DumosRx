import { useEffect, useState } from "react";
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

function diffBgClassName(amount: number) {
  if (amount === 0) return "";
  return amount > 0 ? "bg-emerald-600/10" : "bg-destructive/10";
}

/** A number input that tracks its own text while typing instead of mirroring
 * the committed number on every keystroke. Without this, clearing the field
 * to type a fresh value immediately re-renders as "0" (parsing "" forces a
 * 0 commit, which round-trips back into the controlled `value`), so you'd
 * have to type a digit first then delete the stray 0 rather than just
 * clearing and typing. Here, an empty/partial field is allowed to sit as-is
 * until a valid number is typed (which commits immediately) or the field is
 * blurred still empty (which reverts to the last committed value). */
function EditableNumberCell({
  value,
  onCommit,
  parse,
  min = 0,
  step,
  hasError,
  widthClassName = "w-20",
}: {
  value: number;
  onCommit: (val: number) => void;
  parse: (raw: string) => number;
  min?: number;
  step?: string;
  hasError?: boolean;
  widthClassName?: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <input
      type="number"
      min={min}
      step={step}
      className={`${widthClassName} text-right border rounded-md px-2 py-1 outline-none focus:border-primary bg-background ${
        hasError
          ? "border-destructive text-destructive font-semibold"
          : "border-border"
      }`}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === "" || raw === "-") return;
        const parsed = parse(raw);
        if (!isNaN(parsed)) onCommit(Math.max(min, parsed));
      }}
      onBlur={() => {
        if (text === "" || isNaN(parse(text))) setText(String(value));
      }}
      onFocus={(e) => e.target.select()}
    />
  );
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

/** Dense, single-screen count flow: every item is visible and editable at
 * once (qty, cost price, selling price), matching the QuickBooks POS /
 * Moniebook physical-inventory style Cynthia asked for. The category picker
 * is just a lens on this one continuous session, not a scope gate: every
 * item is pre-filled and counted from the moment the screen opens, so
 * switching categories mid-count never loses anything already entered.
 * Div-based, ARIA roles standing in for real <table> semantics; see
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
  // Totals reflect the rows currently shown (respects the category filter
  // and search), so switching categories gives a live subtotal for that
  // slice as well as the whole-audit total when nothing's filtered.
  const totals = items.reduce(
    (acc, item) => {
      const countedQty = item.countedQty ?? item.systemQty;
      const diffQty = countedQty - item.systemQty;
      acc.diffQty += diffQty;
      acc.diffCost += item.costPrice !== undefined ? diffQty * item.costPrice : 0;
      acc.diffSelling +=
        item.sellingPrice !== undefined ? diffQty * item.sellingPrice : 0;
      return acc;
    },
    { diffQty: 0, diffCost: 0, diffSelling: 0 },
  );

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
                // Valued at the system price, not the counted one: this is
                // the financial exposure of the quantity variance itself
                // (shrinkage cost / lost revenue), not a price-correction
                // diff. Counted Cost/Counted Selling still track price
                // corrections independently via costChanged/sellingChanged
                // below.
                const diffCost =
                  item.costPrice !== undefined ? diffQty * item.costPrice : 0;
                const diffSelling =
                  item.sellingPrice !== undefined
                    ? diffQty * item.sellingPrice
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
                      <EditableNumberCell
                        value={countedQty}
                        onCommit={(val) =>
                          onUpdateItem(item.id, { countedQty: val })
                        }
                        parse={(raw) => parseInt(raw, 10)}
                        hasError={diffQty !== 0}
                        widthClassName="w-20"
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
                        : "-"}
                    </div>
                    <div
                      role="cell"
                      className="px-2 py-1.5 text-right flex items-center"
                    >
                      <EditableNumberCell
                        value={item.countedCostPrice ?? item.costPrice ?? 0}
                        onCommit={(val) =>
                          onUpdateItem(item.id, { countedCostPrice: val })
                        }
                        parse={parseFloat}
                        step="0.01"
                        hasError={costChanged}
                        widthClassName="w-24"
                      />
                    </div>
                    <div
                      role="cell"
                      className={`px-3 py-2 text-right font-semibold flex items-center justify-end ${diffClassName(diffCost)}`}
                    >
                      {item.costPrice !== undefined
                        ? formatDiffCurrency(diffCost)
                        : "-"}
                    </div>
                    <div
                      role="cell"
                      className="px-3 py-2 text-right text-muted-foreground flex items-center justify-end"
                    >
                      {item.sellingPrice !== undefined
                        ? formatCurrency(item.sellingPrice)
                        : "-"}
                    </div>
                    <div
                      role="cell"
                      className="px-2 py-1.5 text-right flex items-center"
                    >
                      <EditableNumberCell
                        value={item.countedSellingPrice ?? item.sellingPrice ?? 0}
                        onCommit={(val) =>
                          onUpdateItem(item.id, { countedSellingPrice: val })
                        }
                        parse={parseFloat}
                        step="0.01"
                        hasError={sellingChanged}
                        widthClassName="w-24"
                      />
                    </div>
                    <div
                      role="cell"
                      className={`px-3 py-2 text-right font-semibold flex items-center justify-end ${diffClassName(diffSelling)}`}
                    >
                      {item.sellingPrice !== undefined
                        ? formatDiffCurrency(diffSelling)
                        : "-"}
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

            {items.length > 0 && (
              <div role="rowgroup">
                <div
                  role="row"
                  className={`grid ${GRID_COLS} border-t-2 border-border font-semibold`}
                >
                  <div
                    role="cell"
                    className="px-3 py-2 sticky left-0 z-10 bg-muted text-muted-foreground text-[11px] uppercase"
                  >
                    Totals{selectedCategory !== ALL_CATEGORIES ? " (filtered)" : ""}
                  </div>
                  <div role="cell" className="px-3 py-2" />
                  <div role="cell" className="px-3 py-2" />
                  <div
                    role="cell"
                    className={`px-3 py-2 text-right flex items-center justify-end ${diffClassName(totals.diffQty)} ${diffBgClassName(totals.diffQty)}`}
                  >
                    {totals.diffQty > 0 ? `+${totals.diffQty}` : totals.diffQty}
                  </div>
                  <div role="cell" className="px-3 py-2" />
                  <div role="cell" className="px-3 py-2" />
                  <div
                    role="cell"
                    className={`px-3 py-2 text-right flex items-center justify-end ${diffClassName(totals.diffCost)} ${diffBgClassName(totals.diffCost)}`}
                  >
                    {formatDiffCurrency(totals.diffCost)}
                  </div>
                  <div role="cell" className="px-3 py-2" />
                  <div role="cell" className="px-3 py-2" />
                  <div
                    role="cell"
                    className={`px-3 py-2 text-right flex items-center justify-end ${diffClassName(totals.diffSelling)} ${diffBgClassName(totals.diffSelling)}`}
                  >
                    {formatDiffCurrency(totals.diffSelling)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
