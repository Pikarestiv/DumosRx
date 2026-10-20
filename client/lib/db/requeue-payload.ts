// Shared payload builder for the two whole-row requeue paths (requeueOrphanedRows in reconcile-identity.ts and forceSyncAllData in local-datab…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-requeue-payload-L1
export function buildRequeuePayload(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null),
  );
}

export function serializeRequeuePayload(row: Record<string, unknown>): string {
  return JSON.stringify(buildRequeuePayload(row));
}
