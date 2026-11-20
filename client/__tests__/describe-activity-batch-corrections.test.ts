import { describe, it, expect } from "vitest";
import { describeActivity } from "@/components/activity-log/describe-activity";

const row = (action: string, details: object | null) => ({
  action,
  table_name: "stock_batches",
  record_id: "b1",
  details: details ? JSON.stringify(details) : null,
});

describe("Activity Log wording for batch corrections", () => {
  it.each(["BATCH_COST_CORRECTED", "BATCH_DETAILS_CORRECTED"])("reads '%s' as 'Corrected batch #<lot>'", (action) => {
    expect(describeActivity(row(action, { batch_number: "340BE364" }))).toBe("Corrected batch #340BE364");
  });

  it("falls back to a plain sentence when the lot is unknown", () => {
    expect(describeActivity({ action: "BATCH_DETAILS_CORRECTED", table_name: null, details: null })).toBe("Corrected batch details");
  });
});
