import { query, getActiveStoreId } from "../core";
import { getUnresolvedConflicts, type RecordedConflict } from "../sync-engine/conflict-log";

export interface OrderLockState {
  editing_device_id: string | null;
  editing_device_label: string | null;
  editing_at: string | null;
}

export interface OrderSyncState {
  pendingWrites: number;
  conflicts: RecordedConflict[];
  lock: OrderLockState | null;
}

async function lineIds(poId: string): Promise<string[]> {
  const rows = await query<{ id: string }>("SELECT id FROM purchase_order_items WHERE po_id = ?", [poId]);
  return rows.map((row) => row.id);
}

export async function getOrderSyncState(poId: string): Promise<OrderSyncState> {
  const items = await lineIds(poId);
  const [queued] = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM _sync_queue
     WHERE (table_name = 'purchase_orders' AND record_id = ?)
        OR (table_name = 'purchase_order_items' AND record_id IN (SELECT id FROM purchase_order_items WHERE po_id = ?))`,
    [poId, poId],
  );
  const conflicts = [
    ...(await getUnresolvedConflicts("purchase_orders", [poId])),
    ...(await getUnresolvedConflicts("purchase_order_items", items)),
  ];
  const [lock] = await query<OrderLockState>(
    "SELECT editing_device_id, editing_device_label, editing_at FROM purchase_orders WHERE id = ?",
    [poId],
  );
  return { pendingWrites: Number(queued?.count) || 0, conflicts, lock: lock ?? null };
}

export interface RecentDraft {
  id: string;
  vendor_name: string;
  item_count: number;
  updated_at: string;
}

export async function getRecentDraftForUser(userId: string, sinceIso: string): Promise<RecentDraft | null> {
  const storeId = getActiveStoreId();
  const rows = await query<RecentDraft>(
    `SELECT po.id, COALESCE(v.name, 'Self / Walk-in Purchase') as vendor_name, po.updated_at,
       (SELECT COUNT(*) FROM purchase_order_items poi WHERE poi.po_id = po.id AND poi._deleted = 0) as item_count
     FROM purchase_orders po
     LEFT JOIN suppliers v ON v.id = po.supplier_id
     WHERE po.status = 'pending' AND po._deleted = 0 AND po.ordered_by = ?
       AND COALESCE(po.updated_at, po.created_at) >= ?${storeId ? " AND po.store_id = ?" : ""}
     ORDER BY COALESCE(po.updated_at, po.created_at) DESC`,
    storeId ? [userId, sinceIso, storeId] : [userId, sinceIso],
  );
  return rows.find((row) => Number(row.item_count) > 0) ?? null;
}
