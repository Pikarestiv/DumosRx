import { query, getActiveStoreId } from "./core";
import { softDelete } from "./base-helpers";
import { getStoredUser } from "@/lib/storage-keys";

export const EMPTY_DRAFT_GRACE_MS = 10 * 60 * 1000;

export async function isEmptyDraft(orderId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT po.id FROM purchase_orders po
     WHERE po.id = ? AND po.status = 'pending' AND po._deleted = 0
       AND COALESCE(TRIM(po.notes), '') = '' AND COALESCE(po.amount_paid, 0) = 0
       AND NOT EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi.po_id = po.id AND poi._deleted = 0)`,
    [orderId],
  );
  return rows.length > 0;
}

export async function removeEmptyDraftsOf(userId: string | null | undefined = getStoredUser()?.id, now = new Date()): Promise<number> {
  if (!userId) return 0;
  const storeId = getActiveStoreId();
  const cutoff = new Date(now.getTime() - EMPTY_DRAFT_GRACE_MS).toISOString();
  const drafts = await query<{ id: string }>(
    `SELECT po.id FROM purchase_orders po
     WHERE po.status = 'pending' AND po._deleted = 0 AND po.ordered_by = ?
       AND COALESCE(TRIM(po.notes), '') = '' AND COALESCE(po.amount_paid, 0) = 0
       AND COALESCE(po.updated_at, po.created_at) < ?
       AND NOT EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi.po_id = po.id AND poi._deleted = 0)${storeId ? " AND po.store_id = ?" : ""}`,
    storeId ? [userId, cutoff, storeId] : [userId, cutoff],
  );
  for (const draft of drafts) await softDelete("purchase_orders", draft.id);
  return drafts.length;
}
