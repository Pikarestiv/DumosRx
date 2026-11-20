import { toast } from "sonner";
import type { SyncChange } from "@/lib/types/sync";
import { execute } from "../core";
import { ordersWithRejectedEdits, preserveRejectedOrderEdits, type RecoveredCopy } from "../procurement-recovered-copy";
import type { PushResponse } from "./types";

export async function recoverRejectedOrderEdits(
  failed: NonNullable<PushResponse["failed"]>,
  changes: SyncChange[],
): Promise<RecoveredCopy[]> {
  const orderIds = await ordersWithRejectedEdits(failed, changes).catch(() => []);
  if (orderIds.length === 0) return [];
  await execute("SAVEPOINT recover_order_edits");
  try {
    const copies = await preserveRejectedOrderEdits(orderIds);
    await execute("RELEASE recover_order_edits");
    return copies;
  } catch (err) {
    console.error("[Sync] Could not keep a rejected purchase-order edit as a recovered copy", err);
    await execute("ROLLBACK TO recover_order_edits");
    await execute("RELEASE recover_order_edits");
    return [];
  }
}

export function announceRecoveredCopies(copies: RecoveredCopy[]): void {
  for (const copy of copies) {
    toast.warning(`Another till changed ${copy.sourceLabel} first. Your version was kept as a new draft, "Recovered copy of ${copy.sourceLabel}".`, {
      duration: 15000,
    });
  }
}
