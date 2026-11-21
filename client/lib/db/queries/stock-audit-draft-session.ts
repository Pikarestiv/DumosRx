import { query, getDatabase } from "../core";

export async function getLocalStockAuditDraftSessionId(
  storeId: string,
): Promise<string | null> {
  if (!storeId || !getDatabase()) return null;
  try {
    const rows = await query<{ cloud_session_id: string | null }>(
      "SELECT cloud_session_id FROM stock_audit_drafts WHERE store_id = ?",
      [storeId],
    );
    return rows[0]?.cloud_session_id ?? null;
  } catch {
    return null;
  }
}
