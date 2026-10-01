import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";
import type { ToolContext } from "./types";

export function formatMoney(amount: number, ctx: ToolContext): string {
  return formatCurrency(amount, ctx.currencyCode ?? "NGN");
}

export function formatDateLabel(iso: string): string {
  return formatDateToDDMMYYYY(iso);
}
