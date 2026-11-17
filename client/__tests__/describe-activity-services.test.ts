import { describe, it, expect } from "vitest";
import { describeActivity } from "@/components/activity-log/describe-activity";

describe("Activity Log wording for service writes", () => {
  it.each([
    ["INSERT", "services", "Created a service"],
    ["UPDATE", "services", "Updated a service"],
    ["DELETE", "services", "Removed a service"],
    ["INSERT", "sale_services", "Created a sale service line"],
    ["INSERT", "return_services", "Created a return service line"],
  ])("reads %s on %s as '%s'", (action, table, sentence) => {
    expect(describeActivity({ action, table_name: table })).toBe(sentence);
  });
});
