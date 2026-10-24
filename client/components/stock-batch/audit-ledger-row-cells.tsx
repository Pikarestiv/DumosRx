import { Checkbox } from "@/components/ui/checkbox";
import { ProductName } from "@/components/ui/product-name";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { formatCurrency } from "@/lib/utils";
import { formatDateSafe } from "@/lib/utils/date-utils";
import type { AuditItem } from "./stock-audits";
import { isAuditItemCounted } from "./audit-derivations";
import { diffClassName, formatDiffCurrency } from "./audit-ledger-format";

interface AuditLedgerRowCellsProps {
  item: AuditItem;
  canEditProductCost: boolean;
  canEditProductPrice: boolean;
  onUpdateItem: (id: string, patch: Partial<AuditItem>) => void;
  onCountRow: (id: string, countedQty?: number) => void;
  onClearCount: (id: string) => void;
}

export function AuditLedgerRowCells({
  item,
  canEditProductCost,
  canEditProductPrice,
  onUpdateItem,
  onCountRow,
  onClearCount,
}: AuditLedgerRowCellsProps) {
  const isCounted = isAuditItemCounted(item);
  const countedQty = item.countedQty ?? item.systemQty;
  const diffQty = countedQty - item.systemQty;
  // Valued at the system price, not the counted one.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-ledger-step-tsx-diff-value
  const diffCost = item.costPrice !== undefined ? diffQty * item.costPrice : 0;
  const diffSelling =
    item.sellingPrice !== undefined ? diffQty * item.sellingPrice : 0;
  const costChanged =
    item.countedCostPrice !== undefined &&
    item.countedCostPrice !== item.costPrice;
  const sellingChanged =
    item.countedSellingPrice !== undefined &&
    item.countedSellingPrice !== item.sellingPrice;

  return (
    <>
      <div role="cell" className="px-3 py-2 sticky left-0 z-10 bg-card">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={isCounted}
            // Ticking means "counted, and it matched".
            onCheckedChange={(checked) =>
              checked === true
                ? onCountRow(item.id)
                : (onClearCount(item.id),
                  onUpdateItem(item.id, {
                    countedQty: undefined,
                    counted: false,
                  }))
            }
            aria-label={`Mark ${item.name} as counted`}
          />
          <div className="min-w-0">
            <ProductName
              name={item.name}
              tooltipSuffix={item.sku}
              className="font-semibold text-foreground"
            />
            <div className="text-[11px] text-muted-foreground/70 truncate">
              {item.sku}
            </div>
          </div>
        </div>
      </div>
      <div
        role="cell"
        className="px-2 py-1.5 text-right flex items-center justify-end"
      >
        <EditableNumberCell
          value={item.countedQty}
          placeholder={String(item.systemQty)}
          onCommit={(val) => onCountRow(item.id, val)}
          onClear={() => {
            onClearCount(item.id);
            onUpdateItem(item.id, {
              countedQty: undefined,
              counted: false,
            });
          }}
          parse={(raw) => parseInt(raw, 10)}
          hasError={isCounted && diffQty !== 0}
          widthClassName="w-20"
          ariaLabel={`Counted quantity for ${item.name}`}
        />
      </div>
      <div
        role="cell"
        className="px-3 py-2 text-right text-foreground font-medium flex items-center justify-end"
      >
        {item.systemQty}
      </div>
      <div
        role="cell"
        className={`px-3 py-2 text-right font-semibold flex items-center justify-end ${diffClassName(diffQty, item.countedQty !== undefined)}`}
      >
        {item.countedQty === undefined
          ? "—"
          : diffQty > 0
            ? `+${diffQty}`
            : diffQty}
      </div>
      <div
        role="cell"
        className="px-3 py-2 text-right text-foreground font-medium flex items-center justify-end"
      >
        {item.costPrice !== undefined ? formatCurrency(item.costPrice) : "-"}
      </div>
      <div role="cell" className="px-2 py-1.5 text-right flex items-center">
        {canEditProductCost ? (
          <EditableNumberCell
            value={item.countedCostPrice ?? item.costPrice ?? 0}
            onCommit={(val) => onUpdateItem(item.id, { countedCostPrice: val })}
            parse={parseFloat}
            step="10"
            hasError={costChanged}
            widthClassName="w-24"
          />
        ) : (
          <span className="w-24 text-right text-foreground font-medium">
            {formatCurrency(item.countedCostPrice ?? item.costPrice ?? 0)}
          </span>
        )}
      </div>
      <div
        role="cell"
        className={`px-3 py-2 text-right font-semibold flex items-center justify-end ${diffClassName(diffCost, item.costPrice !== undefined)}`}
      >
        {item.costPrice !== undefined ? formatDiffCurrency(diffCost) : "-"}
      </div>
      <div
        role="cell"
        className="px-3 py-2 text-right text-foreground font-medium flex items-center justify-end"
      >
        {item.sellingPrice !== undefined
          ? formatCurrency(item.sellingPrice)
          : "-"}
      </div>
      <div role="cell" className="px-2 py-1.5 text-right flex items-center">
        {canEditProductPrice ? (
          <EditableNumberCell
            value={item.countedSellingPrice ?? item.sellingPrice ?? 0}
            onCommit={(val) =>
              onUpdateItem(item.id, { countedSellingPrice: val })
            }
            parse={parseFloat}
            step="10"
            hasError={sellingChanged}
            widthClassName="w-24"
          />
        ) : (
          <span className="w-24 text-right text-foreground font-medium">
            {formatCurrency(item.countedSellingPrice ?? item.sellingPrice ?? 0)}
          </span>
        )}
      </div>
      <div
        role="cell"
        className={`px-3 py-2 text-right font-semibold flex items-center justify-end ${diffClassName(diffSelling, item.sellingPrice !== undefined)}`}
      >
        {item.sellingPrice !== undefined
          ? formatDiffCurrency(diffSelling)
          : "-"}
      </div>
      <div
        role="cell"
        className="px-3 py-2 text-right text-[11.5px] text-foreground font-medium flex items-center justify-end"
      >
        {item.lastAuditedAt
          ? formatDateSafe(item.lastAuditedAt, "dd/MM/yyyy HH:mm", "Unknown")
          : "Never"}
      </div>
    </>
  );
}
