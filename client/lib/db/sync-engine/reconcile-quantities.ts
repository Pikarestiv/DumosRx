import { apiClient } from "@/lib/api/client";
import { query, execute, getActiveStoreId } from "../core";
import { movementLogIsComplete } from "./stock-auto-heal";
import type { SyncResult } from "./types";

interface ReconciliationMovement {
  id: string;
  stock_batch_id: string;
  product_id: string;
  store_id: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  performed_by: string | null;
  movement_date: string;
  created_at: string;
  updated_at: string;
}

// Inserts a server-created reconciliation movement as already-synced, so this device's next pull finds the row already present (the UPDATE bra…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-reconcile-quantities-ts-L20
async function storeReconciliationMovementLocally(
  movement: ReconciliationMovement,
): Promise<void> {
  try {
    await execute(
      `INSERT INTO stock_movements
         (id, stock_batch_id, product_id, store_id, movement_type, quantity,
          reason, performed_by, movement_date, created_at, updated_at,
          _version, _synced, _synced_at, _deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 0)`,
      [
        movement.id,
        movement.stock_batch_id,
        movement.product_id,
        movement.store_id,
        movement.movement_type,
        movement.quantity,
        movement.reason,
        movement.performed_by,
        movement.movement_date,
        movement.created_at,
        movement.updated_at,
        new Date().toISOString(),
      ],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("UNIQUE constraint failed")) {
      throw err;
    }
  }
}

// Hands the server this device's own stock_batches quantities so it can adopt any it never derived from a movement delta.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-reconcile-quantities-L62
export async function reconcileStockQuantities(
  syncFn: (isManual?: boolean) => Promise<SyncResult>,
): Promise<{
  reconciled: number;
  checked: number;
}> {
  const syncResult = await syncFn(true);
  if (!syncResult.success) {
    const message =
      typeof syncResult.error === "string"
        ? syncResult.error
        : "Could not sync with the cloud before reconciling.";
    throw new Error(message);
  }

  if (!(await movementLogIsComplete())) {
    throw new Error(
      "This device is still rebuilding its stock history. Wait for the sync to finish, then try again.",
    );
  }

  const storeId = getActiveStoreId();
  const rows = await query<{ id: string; quantity: number | null }>(
    `SELECT id, quantity FROM stock_batches
     WHERE (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );

  const batches = rows.map((row) => ({
    id: row.id,
    quantity: Math.max(0, Math.round(row.quantity ?? 0)),
  }));

  if (batches.length === 0) {
    return { reconciled: 0, checked: 0 };
  }

  const response = await apiClient.reconcileStockQuantities({ batches });

  for (const movement of response.movements ?? []) {
    await storeReconciliationMovementLocally(movement);
  }

  return {
    reconciled: response.reconciled ?? 0,
    checked: response.checked ?? 0,
  };
}
