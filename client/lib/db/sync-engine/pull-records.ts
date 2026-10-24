import { DEVICE_LOCAL_PULL_COLUMNS, recordUniqueSkipAndCheckGiveUp } from "./pull-state";
import type { SkippedRecord } from "./pull-skip-report";

export interface PulledRow {
  data: Record<string, unknown>;
  columns: string[];
  values: unknown[];
}

export function toPulledRow(
  table: string,
  rawData: Record<string, unknown>,
  validColumns: Set<string>,
): PulledRow {
  const data: Record<string, unknown> = {};
  for (const key in rawData) {
    if (validColumns.has(key)) {
      data[key] = rawData[key];
    }
  }

  // Quantity is never trusted from a pulled snapshot; it is
  // derived from movement deltas (client/AGENTS.md, "Pull details").
  if (table === "stock_batches") {
    delete data.quantity;
  }

  for (const deviceLocalColumn of DEVICE_LOCAL_PULL_COLUMNS[table] ?? []) {
    delete data[deviceLocalColumn];
  }

  const columns = Object.keys(data);
  const values = columns.map((c) => {
    const val = data[c];
    if (typeof val === "boolean") {
      return val ? 1 : 0;
    }
    // A JSON-cast server attribute arrives as a real array/object;
    // binding it directly mis-serializes it under sql.js.
    if (val !== null && typeof val === "object") {
      return JSON.stringify(val);
    }
    return val;
  });

  return { data, columns, values };
}

const UNIQUE_SKIP_VERB = { update: "updating", insert: "inserting" } as const;

export function holdsCursorAfterUniqueSkip(
  err: unknown,
  operation: keyof typeof UNIQUE_SKIP_VERB,
  table: string,
  recordId: string,
  skippedRecords: SkippedRecord[],
): boolean {
  const errMsg =
    typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
  if (!errMsg.includes("UNIQUE constraint failed")) throw err;

  console.warn(
    `[Sync] Skipped ${UNIQUE_SKIP_VERB[operation]} record in ${table} due to unique constraint:`,
    recordId,
    errMsg,
  );
  skippedRecords.push({ table, recordId, reason: `${operation}: ${errMsg}` });
  // Not applied: hold the cursor back until the retry cap.
  return !recordUniqueSkipAndCheckGiveUp(table, recordId);
}
