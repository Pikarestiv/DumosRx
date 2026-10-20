// Structural UUID check shared by every place that has to tell an id from a free-text name.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-uuid-ts-L1
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
