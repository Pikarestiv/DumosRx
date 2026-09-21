import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Regression test: toQueryRange() anchored a date-only picker value to
 * literal UTC midnight (`${date}T00:00:00.000Z`), but every store-local
 * timestamp it's compared against (sales.transaction_date,
 * returns.created_at, etc.) is a real UTC instant of a LOCAL calendar day -
 * the dashboard/daily-close bucket by local time via SQLite's 'localtime'
 * modifier. Anchoring to UTC midnight instead shifted every report's
 * day/month boundaries by the store's UTC offset relative to the
 * dashboard.
 *
 * Runs with TZ=Africa/Lagos (UTC+1) so local and UTC genuinely differ,
 * proving the fix rather than coincidentally passing in a UTC test env.
 */
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
    // 2026-09-20T23:30:00.000Z is local 2026-09-21T00:30 (Lagos) - genuinely
    // "on" 2026-09-21 locally. The old UTC-midnight bound
    // (2026-09-21T00:00:00.000Z) would have excluded it.
    const saleInstant = "2026-09-20T23:30:00.000Z";
    expect(saleInstant >= from!).toBe(true);
  });

  it("returns undefined bounds when no date is given", () => {
    expect(toQueryRange({})).toEqual({ from: undefined, to: undefined });
  });
});
