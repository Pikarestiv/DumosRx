import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for the query-key scoping fix in lib/query-keys.ts's
 * `resource()`. Every key is suffixed with the active store id and current
 * user id (lib/db/core.ts) precisely so a switch of store/user can never
 * resolve to a cache slot the previous store/user's queries already own.
 * This is the structural guarantee behind the "cross-account data spill"
 * fix: even a caller that forgets to clear the query cache on switch can't
 * leak, because the switch itself changes which key is read/written.
 */
describe("query key scoping (store + user)", () => {
  let core: typeof import("@/lib/db/core");
  let queryKeys: typeof import("@/lib/query-keys").queryKeys;

  beforeEach(async () => {
    vi.resetModules();
    core = await import("@/lib/db/core");
    queryKeys = (await import("@/lib/query-keys")).queryKeys;
    core.setActiveStoreId(null);
    core.setCurrentUser(null);
  });

  it("produces a different cache key for the same query when the active store changes", () => {
    core.setActiveStoreId("store-a");
    core.setCurrentUser({ id: "user-1", first_name: "A", last_name: "B", role: "store_owner" });
    const keyForStoreA = queryKeys.dashboard.overview().queryKey;

    core.setActiveStoreId("store-b");
    const keyForStoreB = queryKeys.dashboard.overview().queryKey;

    expect(keyForStoreA).not.toEqual(keyForStoreB);
  });

  it("produces a different cache key for the same query when the current user changes", () => {
    core.setActiveStoreId("store-a");
    core.setCurrentUser({ id: "user-1", first_name: "A", last_name: "B", role: "store_owner" });
    const keyForUser1 = queryKeys.products.all().queryKey;

    core.setCurrentUser({ id: "user-2", first_name: "C", last_name: "D", role: "sales_staff" });
    const keyForUser2 = queryKeys.products.all().queryKey;

    expect(keyForUser1).not.toEqual(keyForUser2);
  });

  it("simulates the race: a key captured before a switch can never collide with the post-switch key", () => {
    // A dashboard fetch is issued under store A / user 1. This is the key
    // React Query would use to cache whatever that in-flight request
    // eventually resolves with, even if it resolves after the switch below.
    core.setActiveStoreId("store-a");
    core.setCurrentUser({ id: "user-1", first_name: "A", last_name: "B", role: "store_owner" });
    const inFlightRequestKey = queryKeys.dashboard.overview().queryKey;

    // Account switch happens (store-context.tsx's switchStore / auth-
    // context.tsx's login) before that request resolves.
    core.setActiveStoreId("store-b");
    core.setCurrentUser({ id: "user-2", first_name: "C", last_name: "D", role: "store_owner" });

    // The new session's dashboard component now queries under this key.
    const newSessionReadKey = queryKeys.dashboard.overview().queryKey;

    // Even if the stale request's resolution were written to the cache
    // under `inFlightRequestKey`, the new session never reads that slot.
    expect(inFlightRequestKey).not.toEqual(newSessionReadKey);
  });

  it("returns a stable key for the same store/user (cache hits still work)", () => {
    core.setActiveStoreId("store-a");
    core.setCurrentUser({ id: "user-1", first_name: "A", last_name: "B", role: "store_owner" });
    const first = queryKeys.products.all().queryKey;
    const second = queryKeys.products.all().queryKey;

    expect(first).toEqual(second);
  });
});
