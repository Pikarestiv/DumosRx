export const BATCH_COST_REASONS = [
  { value: "typo_at_receiving", label: "Typo at receiving" },
  { value: "supplier_invoice_corrected", label: "Supplier invoice corrected" },
  { value: "other", label: "Other" },
] as const;

export type BatchCostReason = (typeof BATCH_COST_REASONS)[number]["value"];

export function batchCostReasonLabel(value: unknown): string | null {
  return BATCH_COST_REASONS.find((r) => r.value === value)?.label ?? null;
}
