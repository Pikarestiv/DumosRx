/**
 * Structural UUID check shared by every place that has to tell an id from a
 * free-text name. The version nibble accepts 1-8: Laravel's `HasUuids` emits
 * v7, so a `[1-5]` pattern rejects ids this app's own server generates.
 * See docs/KNOWN_BUGS.md A-192.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
