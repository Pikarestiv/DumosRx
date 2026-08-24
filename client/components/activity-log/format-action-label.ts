/** audit_logs.action is usually a raw DB op ("INSERT"/"UPDATE"/"DELETE") from
 * the generic insert()/update()/softDelete() helpers, not a friendly verb.
 * This just title-cases it either way. */
export function formatActionLabel(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
