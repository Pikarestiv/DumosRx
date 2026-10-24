import { assert, describe, it, expect, beforeAll, afterAll } from "vitest";

// Regression test: toQueryRange() anchored a date-only picker value to literal UTC midnight (`${date}T00:00:00.000Z`), but…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-date-range-local-time-test-ts-L3
describe("toQueryRange (local-time day boundaries)", () => {
  let originalTZ: string | undefined;
  let toQueryRange: typeof import("@/lib/utils/date-range").toQueryRange;

  beforeAll(async () => {
    originalTZ = process.env.TZ;
    process.env.TZ = "Africa/Lagos";
    ({ toQueryRange } = await import("@/lib/utils/date-range"));
  });

  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it("anchors `from` to local midnight of the picked date, not UTC midnight", () => {
    const { from } = toQueryRange({ from: "2026-09-21" });
    // Local midnight in Lagos (UTC+1) is 2026-09-20T23:00:00.000Z, not
    // 2026-09-21T00:00:00.000Z.
    expect(from).toBe("2026-09-20T23:00:00.000Z");
  });

  it("anchors `to` to the end of the local day, not the end of the UTC day", () => {
    const { to } = toQueryRange({ to: "2026-09-21" });
    // Local 23:59:59.999 in Lagos (UTC+1) is 2026-09-21T22:59:59.999Z.
    expect(to).toBe("2026-09-21T22:59:59.999Z");
  });

  it("a sale just after local midnight now falls inside a `from` bound of that same local day", () => {
    const { from } = toQueryRange({ from: "2026-09-21" });
    // 2026-09-20T23:30:00.000Z is local 2026-09-21T00:30 (Lagos) - genuinely "on" 2026-09-21 locally.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-date-range-local-time-test-ts-L45
    const saleInstant = "2026-09-20T23:30:00.000Z";
    assert(from);
    expect(saleInstant >= from).toBe(true);
  });

  it("returns undefined bounds when no date is given", () => {
    expect(toQueryRange({})).toEqual({ from: undefined, to: undefined });
  });
});
