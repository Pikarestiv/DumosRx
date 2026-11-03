import { query, execute, getDatabase } from "../core";
import type { AdjustmentDraftItem } from "@/components/stock-batch/adjustment-items-step";
import type { AdjustmentReasonValue } from "@/components/stock-batch/adjustment-derivations";

export interface StockAdjustmentDraftData {
  reason: AdjustmentReasonValue;
  note: string;
  items: AdjustmentDraftItem[];
}

export interface StockAdjustmentDraftRow {
  store_id: string;
  user_id: string | null;
  draft_json: string;
  updated_at: string | null;
}

export async function getLocalStockAdjustmentDraft(
  storeId: string,
): Promise<StockAdjustmentDraftData | null> {
  if (!storeId || !getDatabase()) return null;
  try {
    const rows = await query<StockAdjustmentDraftRow>(
      "SELECT draft_json FROM stock_adjustment_drafts WHERE store_id = ?",
      [storeId],
    );
    if (rows.length === 0 || !rows[0].draft_json) return null;
    return JSON.parse(rows[0].draft_json) as StockAdjustmentDraftData;
  } catch (err) {
    console.error(`[DB] Failed to load stock adjustment draft for store ${storeId}:`, err);
    return null;
  }
}

export async function saveLocalStockAdjustmentDraft(
  storeId: string,
  draft: StockAdjustmentDraftData,
  userId?: string | null,
): Promise<void> {
  if (!storeId || !getDatabase()) return;
  try {
    const now = new Date().toISOString();
    const json = JSON.stringify(draft);
    await execute(
      `INSERT OR REPLACE INTO stock_adjustment_drafts (store_id, user_id, draft_json, updated_at)
       VALUES (?, ?, ?, ?)`,
      [storeId, userId ?? null, json, now],
    );
  } catch (err) {
    console.error(`[DB] Failed to save stock adjustment draft for store ${storeId}:`, err);
  }
}

export async function deleteLocalStockAdjustmentDraft(storeId: string): Promise<void> {
  if (!storeId || !getDatabase()) return;
  try {
    await execute("DELETE FROM stock_adjustment_drafts WHERE store_id = ?", [storeId]);
  } catch (err) {
    console.error(`[DB] Failed to delete stock adjustment draft for store ${storeId}:`, err);
  }
}

export async function clearAllLocalStockAdjustmentDrafts(): Promise<void> {
  if (!getDatabase()) return;
  try {
    await execute("DELETE FROM stock_adjustment_drafts");
  } catch (err) {
    console.error("[DB] Failed to clear all stock adjustment drafts:", err);
  }
}
