import { query, execute, getDatabase } from "../core";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

export interface StockAuditDraftRow {
  store_id: string;
  user_id: string | null;
  items_json: string;
  updated_at: string | null;
}

export async function getLocalStockAuditDraft(
  storeId: string,
): Promise<AuditItem[] | null> {
  if (!storeId || !getDatabase()) return null;
  try {
    const rows = await query<StockAuditDraftRow>(
      "SELECT items_json FROM stock_audit_drafts WHERE store_id = ?",
      [storeId],
    );
    if (rows.length === 0 || !rows[0].items_json) return null;
    return JSON.parse(rows[0].items_json) as AuditItem[];
  } catch (err) {
    console.error(`[DB] Failed to load stock audit draft for store ${storeId}:`, err);
    return null;
  }
}

export async function saveLocalStockAuditDraft(
  storeId: string,
  items: AuditItem[],
  userId?: string | null,
): Promise<void> {
  if (!storeId || !getDatabase()) return;
  try {
    const now = new Date().toISOString();
    const json = JSON.stringify(items);
    await execute(
      `INSERT OR REPLACE INTO stock_audit_drafts (store_id, user_id, items_json, updated_at)
       VALUES (?, ?, ?, ?)`,
      [storeId, userId ?? null, json, now],
    );
  } catch (err) {
    console.error(`[DB] Failed to save stock audit draft for store ${storeId}:`, err);
  }
}

export async function deleteLocalStockAuditDraft(storeId: string): Promise<void> {
  if (!storeId || !getDatabase()) return;
  try {
    await execute("DELETE FROM stock_audit_drafts WHERE store_id = ?", [storeId]);
  } catch (err) {
    console.error(`[DB] Failed to delete stock audit draft for store ${storeId}:`, err);
  }
}

export async function clearAllLocalStockAuditDrafts(): Promise<void> {
  if (!getDatabase()) return;
  try {
    await execute("DELETE FROM stock_audit_drafts");
  } catch (err) {
    console.error("[DB] Failed to clear all stock audit drafts:", err);
  }
}
