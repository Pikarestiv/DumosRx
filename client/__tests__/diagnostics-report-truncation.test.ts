import { describe, it, expect } from "vitest";
import {
  buildReport,
  MAX_REPORT_CHARS,
} from "@/components/settings/diagnostics/diagnostics-report";
import type { DeviceDiagnostics } from "@/lib/db/queries/diagnostics";

// `feedback.content` is a MySQL TEXT column (65,535 bytes) and `/support` caps `message` at MAX_REPORT_CHARS, so an over-l…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-diagnostics-report-truncation-test-ts-L8
const base: DeviceDiagnostics = {
  queue: [],
  queueTotal: 0,
  crashTelemetryQueued: 0,
  syncState: [],
  pendingDeltas: [],
  deltas: { total: 0, chronic: 0, productMissing: 0 },
  conflicts: 0,
  integrity: {
    checked: 0,
    diverged: 0,
    pending: 0,
    unreconstructable: 0,
    netUnitDelta: 0,
    divergedBatches: [],
  },
  resolution: { products: 0, unresolvableCategory: 0, productsWithoutBatches: 0 },
  stuckRows: [],
  conflictGroups: [],
  batchConflicts: [],
  batchCosts: [],
  lastSyncOutcome: null,
  orphans: [],
  crashes: [],
  clock: {
    watermarkAheadMs: null,
    status: null,
    suspensionReason: null,
    watermark: null,
  },
  missingTables: [],
} as unknown as DeviceDiagnostics;

const identity = { Device: "DRX-TILL-7", Store: "Agidi Branch" };

/** Each row is ~70 chars, so 3,000 of them comfortably overruns the cap. */
const bloated = (): DeviceDiagnostics => ({
  ...base,
  batchCosts: Array.from({ length: 3_000 }, (_, i) => ({
    id: `batch-${String(i).padStart(12, "0")}-aaaaaaaaaaaaaaaaaaaaaaaa`,
    cost_price: 1234.56,
    quantity: 42,
    _version: 9,
    updated_at: "2026-10-17T10:31:00Z",
    shielded: false,
  })) as DeviceDiagnostics["batchCosts"],
});

describe("buildReport truncation", () => {
  it("fits inside the support ticket", () => {
    const report = buildReport(bloated(), identity);

    expect(report.length).toBeLessThanOrEqual(MAX_REPORT_CHARS);
  });

  it("says how much it dropped, rather than ending mid-line", () => {
    const report = buildReport(bloated(), identity);

    const marker = report.match(/\[truncated: (\d+) characters omitted\]/);
    expect(marker).not.toBeNull();
    expect(Number(marker![1])).toBeGreaterThan(0);
  });

  /** Identity and the queue summary are the high-value part; the tail of a
   * per-batch listing is the least useful thing in the file. */
  it("keeps the header, sacrificing the tail", () => {
    const report = buildReport(bloated(), identity);

    expect(report.startsWith("DumosRx device report")).toBe(true);
    expect(report).toContain("Device: DRX-TILL-7");
    expect(report).toContain("Sync queue: 0 item(s)");
  });

  it("leaves a report that already fits completely alone", () => {
    const report = buildReport(base, identity);

    expect(report).not.toContain("[truncated");
    expect(report).toContain("Products: 0");
  });
});
