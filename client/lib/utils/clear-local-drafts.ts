import { clearPOSCartStorage } from "@/lib/hooks/use-pos-cart";
import { clearAuditSessionOps } from "@/lib/hooks/cloud-audit-pending-ops";
import {
  clearAllStockAuditDrafts,
  flushStockAuditDraftSaves,
} from "@/lib/hooks/use-stock-audit-draft";
import { clearAllStockAdjustmentDrafts } from "@/lib/hooks/use-stock-adjustment-draft";

// Every device-local, in-progress draft staged against the store/account being left behind.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-clear-local-drafts-ts-L5
export function clearLocalDrafts(opts?: {
  preserveStoreAudit?: boolean;
  preserveStoreAdjustment?: boolean;
}): void {
  clearPOSCartStorage();
  if (opts?.preserveStoreAudit) {
    void flushStockAuditDraftSaves();
  } else {
    clearAllStockAuditDrafts();
    clearAuditSessionOps();
  }
  if (!opts?.preserveStoreAdjustment) {
    clearAllStockAdjustmentDrafts();
  }
}
