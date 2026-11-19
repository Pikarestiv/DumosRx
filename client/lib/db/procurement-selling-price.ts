// Blank/undefined means "not overridden", not zero; also accepts null from a DB reload.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-procurement-ts-L11
export function coerceOptionalNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
