import { isAuditLensActive, type AuditCountStatus } from "./audit-derivations";
import {
  AUDIT_LEDGER_GRID_COLS as GRID_COLS,
  AUDIT_LEDGER_GRID_COLS_NO_COST as GRID_COLS_NO_COST,
  diffBgClassName,
  diffClassName,
  formatDiffCurrency,
} from "./audit-ledger-format";

interface AuditLedgerTotalsRowProps {
  totals: { diffQty: number; diffCost: number; diffSelling: number };
  selectedCategory: string;
  countStatus: AuditCountStatus;
  search: string;
  canViewCost?: boolean;
}

export function AuditLedgerTotalsRow({
  totals,
  selectedCategory,
  countStatus,
  search,
  canViewCost = true,
}: AuditLedgerTotalsRowProps) {
  const gridCols = canViewCost ? GRID_COLS : GRID_COLS_NO_COST;
  return (
    <div
      role="row"
      className={`grid ${gridCols} border-t-2 border-border font-semibold`}
    >
      <div
        role="cell"
        className="px-3 py-2 sticky left-0 z-10 bg-muted text-muted-foreground text-[11px] uppercase"
      >
        Totals
        {isAuditLensActive({
          category: selectedCategory,
          status: countStatus,
          search,
        })
          ? " (filtered)"
          : ""}
      </div>
      <div role="cell" className="px-3 py-2" />
      <div role="cell" className="px-3 py-2" />
      <div
        role="cell"
        className={`px-3 py-2 text-right flex items-center justify-end ${diffClassName(totals.diffQty)} ${diffBgClassName(totals.diffQty)}`}
      >
        {totals.diffQty > 0 ? `+${totals.diffQty}` : totals.diffQty}
      </div>
      {canViewCost && (
        <>
          <div role="cell" className="px-3 py-2" />
          <div role="cell" className="px-3 py-2" />
          <div
            role="cell"
            className={`px-3 py-2 text-right flex items-center justify-end ${diffClassName(totals.diffCost)} ${diffBgClassName(totals.diffCost)}`}
          >
            {formatDiffCurrency(totals.diffCost)}
          </div>
        </>
      )}
      <div role="cell" className="px-3 py-2" />
      <div role="cell" className="px-3 py-2" />
      <div
        role="cell"
        className={`px-3 py-2 text-right flex items-center justify-end ${diffClassName(totals.diffSelling)} ${diffBgClassName(totals.diffSelling)}`}
      >
        {formatDiffCurrency(totals.diffSelling)}
      </div>
      <div role="cell" className="px-3 py-2" />
    </div>
  );
}
