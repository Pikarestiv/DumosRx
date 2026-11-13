import type { AuditItem } from "@/components/stock-batch/stock-audits";
import { hasCountedAuditRow } from "@/components/stock-batch/audit-derivations";
import { getDatabase, hasUnpersistedWrites, isTauri, saveDatabase } from "@/lib/db/core";
import {
  deleteLocalStockAuditDraft,
  getLocalStockAuditDraft,
  saveLocalStockAuditDraft,
} from "@/lib/db/queries/stock-audit-drafts";

export const LEGACY_STOCK_AUDIT_DRAFT_KEY = "stock-audit-draft";
export const UNSCOPED_DRAFT_KEY = "default";

export function migrateStockAuditDraft(
  persisted: unknown,
  version: number,
): { items: AuditItem[]; drafts?: Record<string, AuditItem[]> } {
  const state = (persisted ?? {}) as {
    items?: AuditItem[];
    drafts?: Record<string, AuditItem[]>;
  };
  const items = state.items ?? [];
  const cleanItems =
    version >= 1
      ? items
      : items.map((item) =>
          item.counted !== true && item.countedQty === item.systemQty
            ? { ...item, countedQty: undefined }
            : item,
        );
  if (state.drafts !== undefined) {
    return { items: cleanItems, drafts: state.drafts };
  }
  return { items: cleanItems };
}

function legacyDraftsByStore(raw: string, fallbackStoreId: string): Map<string, AuditItem[]> {
  const parsed = JSON.parse(raw) as {
    state?: { items?: AuditItem[]; drafts?: Record<string, AuditItem[]>; activeStoreId?: string | null };
    version?: number;
  };
  const version = parsed.version ?? 0;
  const { items, drafts } = migrateStockAuditDraft(parsed.state, version);
  const byStore = new Map<string, AuditItem[]>(Object.entries(drafts ?? {}));
  const orphan = byStore.get(UNSCOPED_DRAFT_KEY);
  byStore.delete(UNSCOPED_DRAFT_KEY);
  const itemsOwner = parsed.state?.activeStoreId || fallbackStoreId;
  if (items.length > 0 && !byStore.has(itemsOwner)) byStore.set(itemsOwner, items);
  if (orphan && orphan.length > 0 && !byStore.has(fallbackStoreId)) byStore.set(fallbackStoreId, orphan);
  return byStore;
}

async function sqliteDraftYieldsTo(storeId: string, legacyItems: AuditItem[]): Promise<boolean> {
  const existing = await getLocalStockAuditDraft(storeId);
  return !existing || (!hasCountedAuditRow(existing) && hasCountedAuditRow(legacyItems));
}

// Compat shim (AGENTS.md §11): moves a pre-2026-11 localStorage draft into SQLite once.
// Retire once no active device reports a build older than this change.
export async function importLegacyStockAuditDrafts(fallbackStoreId: string): Promise<void> {
  if (typeof window === "undefined" || !getDatabase()) return;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_STOCK_AUDIT_DRAFT_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let byStore: Map<string, AuditItem[]>;
  try {
    byStore = legacyDraftsByStore(raw, fallbackStoreId);
  } catch (err) {
    console.warn("[Drafts] Unreadable legacy cycle count draft, leaving it in place", err);
    return;
  }

  for (const [storeId, items] of byStore) {
    if (items.length === 0 || !(await sqliteDraftYieldsTo(storeId, items))) continue;
    if (!(await saveLocalStockAuditDraft(storeId, items))) return;
  }
  if (!isTauri()) {
    await saveDatabase();
    if (hasUnpersistedWrites()) return;
  }
  try {
    localStorage.removeItem(LEGACY_STOCK_AUDIT_DRAFT_KEY);
  } catch {
    return;
  }
}

// Pre-2026-11 builds filed counts made before a store resolved under "default"; retire with the shim above.
export async function adoptUnscopedStockAuditDraft(storeId: string): Promise<AuditItem[] | null> {
  const orphan = await getLocalStockAuditDraft(UNSCOPED_DRAFT_KEY);
  if (!orphan || orphan.length === 0) return null;
  if (!(await saveLocalStockAuditDraft(storeId, orphan))) return null;
  await deleteLocalStockAuditDraft(UNSCOPED_DRAFT_KEY);
  return orphan;
}
