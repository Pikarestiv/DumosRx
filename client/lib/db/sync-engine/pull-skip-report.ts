import type { CrashContext } from "@/lib/utils/error-logger";

export interface SkippedRecord {
  table: string;
  recordId: string;
  reason: string;
}

export const MAX_REPORTED_SKIPS = 20;

/**
 * One report per pull run instead of one per skipped row. The record ids stay
 * out of the message so a recurring skip keeps a single crash fingerprint and
 * a single Sentry issue; the sample in the context is what identifies them.
 * See client/AGENTS.md, "What reaches Sentry".
 */
export function summarizeSkippedRecords(
  skipped: SkippedRecord[],
): { message: string; context: CrashContext } | null {
  if (skipped.length === 0) return null;

  const tables = [...new Set(skipped.map((s) => s.table))].sort();

  return {
    message: `Pull skipped ${skipped.length} record(s) across ${tables.length} table(s): ${tables.join(", ")}`,
    context: {
      area: "sync-pull",
      skippedCount: skipped.length,
      skipped: JSON.stringify(skipped.slice(0, MAX_REPORTED_SKIPS)),
    },
  };
}
