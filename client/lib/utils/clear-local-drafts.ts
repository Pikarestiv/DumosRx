import { clearPOSCartStorage } from "@/lib/hooks/use-pos-cart";
import { clearStockAuditDraft } from "@/lib/hooks/use-stock-audit-draft";
import { clearStockAdjustmentDraft } from "@/lib/hooks/use-stock-adjustment-draft";

/**
 * Every device-local, in-progress draft staged against the store/account
 * being left behind. Each lives under its own single global localStorage key
 * (no store or user in it), so all of them must be dropped together on a
 * store switch, a logout, a different user signing in, a new-store link and
 * a factory reset. Called as one function because the list kept growing and
 * two of the five transition paths had been left clearing only the cart -
 * see client/AGENTS.md.
 */
export function clearLocalDrafts(): void {
  clearPOSCartStorage();
  clearStockAuditDraft();
  clearStockAdjustmentDraft();
}
