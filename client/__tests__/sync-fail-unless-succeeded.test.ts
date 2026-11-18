import { describe, it, expect } from "vitest";
import { failUnlessSucceeded } from "@/lib/db/sync-engine/sync-outcome";
import { STORE_REFUSED_MESSAGE, type StoreRefusal } from "@/lib/db/sync-engine/store-refusal";

describe("failUnlessSucceeded (A-323 & A-363)", () => {
  it("passes a successful result through", async () => {
    const result = { success: true, pushed: 1, pulled: 2 };
    await expect(failUnlessSucceeded(Promise.resolve(result))).resolves.toBe(result);
  });

  it("rejects a failed result with its message, so toast.promise shows the failure instead of 'Sync complete'", async () => {
    await expect(
      failUnlessSucceeded(Promise.resolve({ success: false, pushed: 0, pulled: 1, error: "Sync is paused." })),
    ).rejects.toThrow("Sync is paused.");
  });

  it("appends storeRefusalRemedy to the refusal message when hasFixedStore is false (A-363)", async () => {
    const refusal: StoreRefusal = {
      storeId: "store-b",
      accessibleStores: [{ id: "store-c", name: "Store C" }],
    };
    const promise = failUnlessSucceeded(
      Promise.resolve({ success: false, pushed: 0, pulled: 0, error: STORE_REFUSED_MESSAGE, refusal }),
      false,
    );

    await expect(promise).rejects.toThrow(
      `${STORE_REFUSED_MESSAGE} Switch to Store C to keep syncing.`,
    );
  });

  it("appends storeRefusalRemedy for fixed-store staff without reassignment (A-363)", async () => {
    const refusal: StoreRefusal = {
      storeId: "store-b",
      accessibleStores: [{ id: "store-c", name: "Store C" }],
    };
    const promise = failUnlessSucceeded(
      Promise.resolve({ success: false, pushed: 0, pulled: 0, error: STORE_REFUSED_MESSAGE, refusal }),
      true,
    );

    await expect(promise).rejects.toThrow(
      `${STORE_REFUSED_MESSAGE} Ask the store owner which store this till should use.`,
    );
  });

  it("attaches the refusal payload to the rejected error (A-363)", async () => {
    const refusal: StoreRefusal = {
      storeId: "store-b",
      accessibleStores: [],
    };
    let caught: unknown = null;
    try {
      await failUnlessSucceeded(
        Promise.resolve({ success: false, pushed: 0, pulled: 0, error: STORE_REFUSED_MESSAGE, refusal }),
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { refusal?: StoreRefusal }).refusal).toBe(refusal);
  });
});
