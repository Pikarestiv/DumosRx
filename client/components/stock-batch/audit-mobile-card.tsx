import { Checkbox } from "@/components/ui/checkbox";
import { ProductName } from "@/components/ui/product-name";
import { EditableNumberCell } from "@/components/ui/editable-number-cell";
import { formatCurrency } from "@/lib/utils";
import { formatDateSafe } from "@/lib/utils/date-utils";
import type { AuditItem } from "./stock-audits";
import { isAuditItemCounted } from "./audit-derivations";
import { diffClassName, formatDiffCurrency } from "./audit-ledger-format";

interface AuditMobileCardProps {
  item: AuditItem;
  canEditProductCost: boolean;
  canEditProductPrice: boolean;
  canViewCost: boolean;
  isReadOnly: boolean;
  onUpdateItem: (id: string, patch: Partial<AuditItem>) => void;
  onCountRow: (id: string, countedQty?: number) => void;
  onClearCount: (id: string) => void;
}

export function AuditMobileCard({
  item,
  canEditProductCost,
  canEditProductPrice,
  canViewCost,
  isReadOnly,
  onUpdateItem,
  onCountRow,
  onClearCount,
}: AuditMobileCardProps) {
  const isCounted = isAuditItemCounted(item);
  const countedQty = item.countedQty ?? item.systemQty;
  const diffQty = countedQty - item.systemQty;
  const diffCost = item.costPrice !== undefined ? diffQty * item.costPrice : 0;
  const diffSelling =
    item.sellingPrice !== undefined ? diffQty * item.sellingPrice : 0;
  const costChanged =
    item.countedCostPrice !== undefined &&
    item.countedCostPrice !== item.costPrice;
  const sellingChanged =
    item.countedSellingPrice !== undefined &&
    item.countedSellingPrice !== item.sellingPrice;

  const cardHighlight = !isCounted
    ? "border-border"
    : diffQty === 0
      ? "border-emerald-500/40 bg-emerald-500/[0.03]"
      : "border-destructive/40 bg-destructive/[0.03]";

  return (
    <div className={`rounded-2xl border bg-card p-3.5 space-y-3 ${cardHighlight}`}>
      <div className="flex items-start gap-2.5">
        <div className="pt-0.5">
          <Checkbox
            checked={isCounted}
            disabled={isReadOnly || item.isDeleted}
            onCheckedChange={(checked) =>
              !(isReadOnly || item.isDeleted) &&
              (checked === true
                ? onCountRow(item.id)
                : (onClearCount(item.id),
                  onUpdateItem(item.id, {
                    countedQty: undefined,
                    counted: false,
                  })))
            }
            aria-label={`Mark ${item.name} as counted`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <ProductName
              name={item.name}
              tooltipSuffix={item.sku}
              className="font-semibold text-[14px] leading-snug text-foreground break-words"
            />
            {item.isDeleted && (
              <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-destructive/10 text-destructive">
                Deleted
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground/80 mt-0.5 break-words">
            {item.sku ? `${item.sku} · ` : ""}
            Last counted{" "}
            {item.lastAuditedAt
              ? formatDateSafe(item.lastAuditedAt, "dd/MM/yyyy HH:mm", "Unknown")
              : "Never"}
          </div>
        </div>
        <span
          className={`shrink-0 text-[12px] font-bold px-2 py-0.5 rounded-md bg-muted/60 ${diffClassName(diffQty, item.countedQty !== undefined)}`}
        >
          {item.countedQty === undefined
            ? "Pending"
            : diffQty > 0
              ? `+${diffQty}`
              : diffQty === 0
                ? "Match"
                : diffQty}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-2.5 items-center">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            System Qty
          </div>
          <div className="text-[16px] font-bold text-foreground mt-0.5">
            {item.systemQty}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Counted Qty
          </div>
          {isReadOnly || item.isDeleted ? (
            <div className="text-[15px] font-semibold text-muted-foreground">
              {item.countedQty !== undefined ? item.countedQty : "—"}
            </div>
          ) : (
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
              widthClassName="w-full"
              ariaLabel={`Counted quantity for ${item.name}`}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 border-t border-border/60 text-xs">
        {canViewCost && (
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Cost Price
            </div>
            <div className="mt-1">
              {canEditProductCost && !isReadOnly && !item.isDeleted ? (
                <EditableNumberCell
                  value={item.countedCostPrice ?? item.costPrice ?? 0}
                  onCommit={(val) =>
                    onUpdateItem(item.id, { countedCostPrice: val })
                  }
                  parse={parseFloat}
                  step="10"
                  hasError={costChanged}
                  widthClassName="w-full"
                />
              ) : (
                <span className="font-medium text-foreground">
                  {item.costPrice !== undefined
                    ? formatCurrency(item.countedCostPrice ?? item.costPrice)
                    : "-"}
                </span>
              )}
            </div>
            {item.costPrice !== undefined && diffQty !== 0 && (
              <div className={`text-[11px] font-semibold mt-0.5 ${diffClassName(diffCost, true)}`}>
                Diff: {formatDiffCurrency(diffCost)}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
            Selling Price
          </div>
          <div className="mt-1">
            {canEditProductPrice && !isReadOnly && !item.isDeleted ? (
              <EditableNumberCell
                value={item.countedSellingPrice ?? item.sellingPrice ?? 0}
                onCommit={(val) =>
                  onUpdateItem(item.id, { countedSellingPrice: val })
                }
                parse={parseFloat}
                step="10"
                hasError={sellingChanged}
                widthClassName="w-full"
              />
            ) : (
              <span className="font-medium text-foreground">
                {item.sellingPrice !== undefined
                  ? formatCurrency(
                      item.countedSellingPrice ?? item.sellingPrice,
                    )
                  : "-"}
              </span>
            )}
          </div>
          {item.sellingPrice !== undefined && diffQty !== 0 && (
            <div className={`text-[11px] font-semibold mt-0.5 ${diffClassName(diffSelling, true)}`}>
              Diff: {formatDiffCurrency(diffSelling)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
