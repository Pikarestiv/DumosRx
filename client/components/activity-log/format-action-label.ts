// audit_logs.action is usually a raw DB op ("INSERT"/"UPDATE"/"DELETE") from the generic insert()/update()/softDelete() he…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-activity-log-format-action-label-ts-L1
export function formatActionLabel(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
