import { formatCurrency } from "@/lib/utils";

export const AUDIT_LEDGER_GRID_COLS =
  "grid-cols-[minmax(220px,1fr)_100px_100px_90px_100px_110px_100px_110px_120px_110px_140px]";

export function formatDiffCurrency(amount: number) {
  return amount > 0 ? `+${formatCurrency(amount)}` : formatCurrency(amount);
}

export function diffClassName(amount: number, hasValue = true) {
  if (!hasValue) return "text-muted-foreground";
  if (amount === 0) return "text-foreground";
  return amount > 0 ? "text-emerald-600" : "text-destructive";
}

export function diffBgClassName(amount: number) {
  if (amount === 0) return "";
  return amount > 0 ? "bg-emerald-600/10" : "bg-destructive/10";
}
