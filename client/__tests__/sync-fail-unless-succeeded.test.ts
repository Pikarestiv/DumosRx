import { describe, it, expect } from "vitest";
import { failUnlessSucceeded } from "@/lib/db/sync-engine/sync-outcome";

describe("failUnlessSucceeded (A-323)", () => {
  it("passes a successful result through", async () => {
    const result = { success: true, pushed: 1, pulled: 2 };
    await expect(failUnlessSucceeded(Promise.resolve(result))).resolves.toBe(result);
  });

  it("rejects a failed result with its message, so toast.promise shows the failure instead of 'Sync complete'", async () => {
    await expect(
      failUnlessSucceeded(Promise.resolve({ success: false, pushed: 0, pulled: 1, error: "Sync is paused." })),
    ).rejects.toThrow("Sync is paused.");
  });
});
