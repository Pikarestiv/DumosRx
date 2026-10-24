import { describe, it, expect } from "vitest";
import { toUtcInstant } from "@/lib/utils/date-utils";
import { mapMovement } from "@/components/stock-batch/stock-movement-mapping";
import type { StockMovementDbRow } from "@/lib/types/stock-movement";

describe("toUtcInstant", () => {
  it("reads a zone-less date-time as the UTC instant it was written as", () => {
    expect(toUtcInstant("2026-10-24 20:17:00")).toBe("2026-10-24T20:17:00Z");
    expect(new Date(toUtcInstant("2026-10-24 20:17:00")).toISOString()).toBe("2026-10-24T20:17:00.000Z");
    expect(toUtcInstant("2026-10-24 20:17:00.123")).toBe("2026-10-24T20:17:00.123Z");
  });

  it("leaves a real ISO instant, a date-only value and an empty value alone", () => {
    expect(toUtcInstant("2026-10-24T20:17:00.000Z")).toBe("2026-10-24T20:17:00.000Z");
    expect(toUtcInstant("2026-10-24T20:17:00+01:00")).toBe("2026-10-24T20:17:00+01:00");
    expect(toUtcInstant("2026-10-24")).toBe("2026-10-24");
    expect(toUtcInstant("")).toBe("");
  });
});

describe("mapMovement date", () => {
  const row = (overrides: Partial<StockMovementDbRow>) =>
    ({ id: "m1", quantity: 10, movement_type: "purchase", ...overrides }) as StockMovementDbRow;

  it("gives a legacy zone-less purchase receipt the same instant as its UTC wall clock", () => {
    const mapped = mapMovement(row({ created_at: "2026-10-24 20:17:00", movement_date: "2026-10-24 20:17:00" }));
    expect(new Date(mapped.date).toISOString()).toBe("2026-10-24T20:17:00.000Z");
  });

  it("keeps a real ISO created_at as it is", () => {
    const mapped = mapMovement(row({ created_at: "2026-10-24T20:17:00.000Z" }));
    expect(mapped.date).toBe("2026-10-24T20:17:00.000Z");
  });
});
