import { query, execute, STORE_SCOPED_TABLES } from "../core";
import { deviceHoldsSeveralStores } from "../device-stores";
import { remapForeignKey, DUPLICATE_NAME_TABLES, columnExists } from "../reconcile-identity";

export async function pruneStoresMissingFromSnapshot(
  records: Record<string, unknown>[],
): Promise<void> {
  const serverStoreIds = records.map((r) => r.id as string);
  const placeholders = serverStoreIds.map(() => "?").join(", ");
  // A store with an unpushed local edit is never a prune
  // candidate — that prune could never be undone.
  const pruneCandidates = await query<{ id: string }>(
    `SELECT id FROM stores WHERE _deleted = 0 AND id NOT IN (${placeholders})
       AND id NOT IN (SELECT record_id FROM _sync_queue WHERE table_name = 'stores')`,
    serverStoreIds,
  );

  if (pruneCandidates.length > 0) {
    // Only genuinely empty stores are pruned, and only tables that
    // actually have store_id yet are checked (runtime migration).
    const scopedTablesWithStoreId: string[] = [];
    for (const t of STORE_SCOPED_TABLES) {
      if (await columnExists(t, "store_id")) {
        scopedTablesWithStoreId.push(t);
      }
    }
    const noDataClauses = scopedTablesWithStoreId.map(
      (t) => `AND id NOT IN (SELECT DISTINCT store_id FROM ${t} WHERE store_id IS NOT NULL)`,
    ).join("\n                ");
    const candidatePlaceholders = pruneCandidates.map(() => "?").join(", ");
    const pruneSql = `
      UPDATE stores SET _deleted = 1
      WHERE id IN (${candidatePlaceholders})
        ${noDataClauses}
    `;

    await execute(pruneSql, pruneCandidates.map((r) => r.id));
  }
}

export async function reconcileDuplicateNames(
  table: string,
  records: Record<string, unknown>[],
): Promise<void> {
  const serverIds = new Set(records.map((r) => r.id as string));
  // Keyed by store AND name: a header-less pull returns every store
  // the owner has, where a bare name matches the wrong one (A-301).
  const serverIdByName = new Map<string, string>();
  for (const r of records) {
    const name = String(r.name ?? "").trim().toLowerCase();
    if (name) serverIdByName.set(`${r.store_id ?? ""}|${name}`, r.id as string);
  }

  // Paired by the PAGE's store, not the active one: see A-301 in
  // docs/FIXED_BUGS.md for what an ambient scope did here.
  const hasStoreId = await columnExists(table, "store_id");
  const pageStoreIds = new Set(
    records
      .map((r) => (r.store_id == null ? null : String(r.store_id)))
      .filter((id): id is string => id !== null),
  );
  const localRows = await query<{ id: string; name: string; store_id: string | null }>(
    `SELECT id, name${hasStoreId ? ", store_id" : ", NULL as store_id"} FROM ${table}
      WHERE (_deleted = 0 OR _deleted IS NULL)`,
  );

  const legacyRowsAreUnattributable = await deviceHoldsSeveralStores();

  for (const row of localRows) {
    if (serverIds.has(row.id)) continue;
    if (hasStoreId && row.store_id !== null && !pageStoreIds.has(row.store_id)) {
      continue;
    }
    if (row.store_id === null && legacyRowsAreUnattributable) continue;
    const matchedServerId = serverIdByName.get(
      `${row.store_id ?? ""}|${String(row.name ?? "").trim().toLowerCase()}`,
    );
    if (!matchedServerId || matchedServerId === row.id) continue;

    await remapForeignKey(
      row.id,
      matchedServerId,
      DUPLICATE_NAME_TABLES[table],
      row.store_id,
    );

    await execute(`UPDATE ${table} SET _deleted = 1 WHERE id = ?`, [row.id]);
  }
}
