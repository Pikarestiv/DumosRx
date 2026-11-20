const PO_STATUS_LABELS = new Map<string, string>([
  ["pending", "Draft"],
  ["draft", "Draft"],
  ["sent", "Ordered"],
  ["partially_received", "Partially received"],
  ["received", "Received"],
  ["closed", "Closed short"],
]);

export function poStatusLabel(status: string): string {
  return PO_STATUS_LABELS.get(status) ?? status;
}
