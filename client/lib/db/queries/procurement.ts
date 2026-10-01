import { query, update } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import {
  conflictTouchedField,
  getUnresolvedConflicts,
  resolveConflictsById,
} from "@/lib/db/sync-engine/conflict-log";

export interface POVendor {
  id: string;
  name: string;
}

export interface POProduct {
  id: string;
  name: string;
  bulk_unit: string;
  base_unit: string;
  units_per_bulk: number;
  cost_price: number;
  stock_quantity: number;
  selling_price: number | null;
  /** Catalog fields the PO item search needs. They are here so the builder
   * can hand this one list to its ProductCombobox instead of every combobox
   * querying the whole catalog again under its own key - without them, the
   * combobox would silently lose generic-name matching. */
  generic_name?: string | null;
  manufacturer?: string | null;
  strength?: string | null;
  dosage_form?: string | null;
}

export interface FullVendor {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  payment_terms: string;
}

export async function getActiveSuppliersForPO() {
  const storeId = getActiveStoreId();
  return query<POVendor>(
    `SELECT id, name FROM suppliers WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
}

export async function getAllVendors() {
  const storeId = getActiveStoreId();
  return query<FullVendor>(
    `SELECT * FROM suppliers WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""} ORDER BY name ASC`,
    storeId ? [storeId] : [],
  );
}

/** Promotes any leftover "draft" purchase orders to "pending" - a status
 * this app no longer creates, but old local rows (or rows from a device that
 * hasn't picked up this migration) can still carry it. Runs once at app
 * boot (see DatabaseProvider). Goes through update() (not a raw UPDATE) so
 * the change actually syncs to the cloud and isn't silently local-only. */
export async function promoteDraftPurchaseOrdersToPending() {
  const storeId = getActiveStoreId();
  const drafts = await query<{ id: string }>(
    `SELECT id FROM purchase_orders WHERE status = 'draft' AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
  for (const draft of drafts) {
    try {
      await update("purchase_orders", draft.id, { status: "pending" });
    } catch (err) {
      console.error(`[DB] Failed to promote draft PO ${draft.id} to pending`, err);
    }
  }
}

export async function getActiveProductsForPO() {
  const storeId = getActiveStoreId();
  return query<POProduct>(
    `SELECT p.id, p.name, p.bulk_unit, p.base_unit, p.units_per_bulk, p.selling_price,
       p.generic_name, p.manufacturer, p.strength, p.dosage_form,
       (SELECT SUM(cost_price * quantity) * 1.0 / NULLIF(SUM(quantity), 0) FROM stock_batches WHERE product_id = p.id AND _deleted = 0 AND is_active = 1 AND quantity > 0) as cost_price,
       COALESCE((SELECT SUM(quantity) FROM stock_batches WHERE product_id = p.id AND _deleted = 0 AND is_active = 1), 0) as stock_quantity
     FROM products p
     WHERE p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}
     ORDER BY p.name ASC`,
    storeId ? [storeId] : [],
  );
}

export interface DroppedReceiptSignal {
  conflictIds: number[];
  lineCount: number;
  detectedAt: string;
}

/**
 * A-26: a stale device's legitimate second partial receipt derives the same
 * deterministic ids as the first, so the server collapses its stock rows into
 * the first receipt's and drops its `quantity_received` UPDATE as a terminal
 * conflict. The stock is on the shelf and not in the system, and the PO just
 * reads as having an ordinary outstanding balance. This reports whether any
 * such drop is still outstanding against this order's lines so the receiving
 * screen can say so. See client/AGENTS.md, "The terminal-conflict ledger".
 */
export async function getDroppedReceiptSignal(
  purchaseOrderId: string,
): Promise<DroppedReceiptSignal | null> {
  const items = await query<{ id: string }>(
    "SELECT id FROM purchase_order_items WHERE po_id = ?",
    [purchaseOrderId],
  );
  const conflicts = await getUnresolvedConflicts(
    "purchase_order_items",
    items.map((item) => item.id),
  );
  const receiptConflicts = conflicts.filter((conflict) =>
    conflictTouchedField(conflict, "quantity_received"),
  );
  if (receiptConflicts.length === 0) return null;

  return {
    conflictIds: receiptConflicts.map((conflict) => conflict.id),
    lineCount: new Set(receiptConflicts.map((conflict) => conflict.record_id)).size,
    detectedAt: receiptConflicts[receiptConflicts.length - 1].detected_at,
  };
}

export async function dismissDroppedReceiptSignal(conflictIds: number[]): Promise<void> {
  await resolveConflictsById(conflictIds);
}
