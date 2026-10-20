import { clearPOSCartStorage } from "@/lib/hooks/use-pos-cart";
import { clearStockAuditDraft } from "@/lib/hooks/use-stock-audit-draft";
import { clearStockAdjustmentDraft } from "@/lib/hooks/use-stock-adjustment-draft";

// Every device-local, in-progress draft staged against the store/account being left behind.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-clear-local-drafts-ts-L5
export function clearLocalDrafts(): void {
  clearPOSCartStorage();
  clearStockAuditDraft();
  clearStockAdjustmentDraft();
}
