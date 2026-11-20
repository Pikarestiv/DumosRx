import { query, update } from "@/lib/db/local-database";
import { AUDIT_ACTIONS } from "@/lib/db/audit-actions";
import type { StockBatch } from "@/lib/types/stock-batch";

export const MAX_BATCH_NUMBER_LENGTH = 50;

export interface BatchDetailsInput {
  batch_number?: string | null;
  expiry_date?: string | null;
  manufacture_date?: string | null;
}

type BatchDetailField = keyof BatchDetailsInput;

const FIELDS: BatchDetailField[] = ["batch_number", "expiry_date", "manufacture_date"];

export interface BatchDetailsForm {
  batch_number: string;
  expiry_date: string;
  manufacture_date: string;
}

export const detailsFormOf = (batch: Pick<StockBatch, "batch_number" | "expiry_date" | "manufacture_date">): BatchDetailsForm => ({
  batch_number: batch.batch_number ?? "",
  expiry_date: batch.expiry_date?.slice(0, 10) ?? "",
  manufacture_date: batch.manufacture_date?.slice(0, 10) ?? "",
});

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const blankToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export function validateBatchDetails(details: BatchDetailsInput, current: Required<BatchDetailsInput>): string | null {
  const next = { ...current, ...details };
  const lot = blankToNull(next.batch_number);
  if (lot && lot.length > MAX_BATCH_NUMBER_LENGTH) return `Keep the lot number to ${MAX_BATCH_NUMBER_LENGTH} characters or fewer.`;
  const expiry = blankToNull(next.expiry_date);
  const manufacture = blankToNull(next.manufacture_date);
  if (expiry && !isValidIsoDate(expiry)) return "Enter a valid expiry date.";
  if (manufacture && !isValidIsoDate(manufacture)) return "Enter a valid manufacture date.";
  if (expiry && manufacture && manufacture > expiry) return "The manufacture date must be before the expiry date.";
  return null;
}

export async function correctBatchDetails(batchId: string, details: BatchDetailsInput): Promise<void> {
  const [batch] = await query<{ product_id: string } & Record<BatchDetailField, string | null>>(
    "SELECT product_id, batch_number, expiry_date, manufacture_date FROM stock_batches WHERE id = ? AND _deleted = 0",
    [batchId],
  );
  if (!batch) throw new Error("This batch no longer exists.");

  const error = validateBatchDetails(details, {
    batch_number: batch.batch_number,
    expiry_date: batch.expiry_date,
    manufacture_date: batch.manufacture_date,
  });
  if (error) throw new Error(error);

  const changes: Partial<Record<BatchDetailField, { from: string | null; to: string | null }>> = {};
  for (const field of FIELDS) {
    if (!(field in details)) continue;
    const to = blankToNull(details[field]);
    const from = blankToNull(batch[field]);
    if (to !== from) changes[field] = { from, to };
  }
  const changed = Object.keys(changes) as BatchDetailField[];
  if (changed.length === 0) return;

  await update(
    "stock_batches",
    batchId,
    Object.fromEntries(changed.map((field) => [field, changes[field]?.to ?? null])),
    {
      action: AUDIT_ACTIONS.BATCH_DETAILS_CORRECTED,
      auditDetails: { product_id: batch.product_id, batch_number: batch.batch_number, changes },
    },
  );
}
