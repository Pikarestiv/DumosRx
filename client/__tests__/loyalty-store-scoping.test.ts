import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage: loyalty_tiers/loyalty_redemption_options had zero
 * store scoping on read (no store_id column existed at all, rows were only
 * ever keyed by user_id) — in a multi-store account, every store shared the
 * exact same tiers/rewards catalog, and ensureLoyaltyDefaultsSeeded()'s
 * "has this store already been seeded" check (tiers.length === 0) was
 * evaluated globally, so only the very first store ever created got
 * defaults; every other store saw store A's live config with no boundary.
 */
describe("loyalty tiers/redemption options store scoping", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getLoyaltyTiers: typeof import("@/lib/db/queries/loyalty").getLoyaltyTiers;
  let getLoyaltyRedemptionOptions: typeof import("@/lib/db/queries/loyalty").getLoyaltyRedemptionOptions;
  let ensureLoyaltyDefaultsSeeded: typeof import("@/lib/db/queries/loyalty").ensureLoyaltyDefaultsSeeded;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const loyalty = await import("@/lib/db/queries/loyalty");
    getLoyaltyTiers = loyalty.getLoyaltyTiers;
    getLoyaltyRedemptionOptions = loyalty.getLoyaltyRedemptionOptions;
    ensureLoyaltyDefaultsSeeded = loyalty.ensureLoyaltyDefaultsSeeded;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM loyalty_tiers; DELETE FROM loyalty_redemption_options; DELETE FROM stores;`);
    core.setActiveStoreId(null);
  });

  it("only returns the active store's loyalty tiers", async () => {
    db.run(`INSERT INTO loyalty_tiers (id, name, min_spend, store_id) VALUES
      ('t1', 'Bronze', 0, 'store-a'),
      ('t2', 'Gold', 300000, 'store-b')`);

    core.setActiveStoreId("store-a");
    const tiers = await getLoyaltyTiers();

    expect(tiers.map((t) => t.id)).toEqual(["t1"]);
  });

  it("only returns the active store's redemption options", async () => {
    db.run(`INSERT INTO loyalty_redemption_options (id, label, points_cost, store_id) VALUES
      ('o1', 'Free Delivery', 200, 'store-a'),
      ('o2', '₦500 Discount', 500, 'store-b')`);

    core.setActiveStoreId("store-a");
    const options = await getLoyaltyRedemptionOptions();

    expect(options.map((o) => o.id)).toEqual(["o1"]);
  });

  it("seeds defaults independently per store, instead of only the first store ever created", async () => {
    // Store A already has custom tiers -> should NOT be reseeded.
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'A'), ('store-b', 'B')`);
    db.run(`INSERT INTO loyalty_tiers (id, name, min_spend, store_id) VALUES ('t1', 'Custom Tier', 0, 'store-a')`);

    core.setActiveStoreId("store-b");
    await ensureLoyaltyDefaultsSeeded("user-1");

    core.setActiveStoreId("store-a");
    const storeATiers = await getLoyaltyTiers();
    core.setActiveStoreId("store-b");
    const storeBTiers = await getLoyaltyTiers();

    // Store A keeps its one custom tier, untouched by store B's seeding.
    expect(storeATiers).toHaveLength(1);
    expect(storeATiers[0].name).toBe("Custom Tier");
    // Store B gets its own full set of defaults.
    expect(storeBTiers.length).toBeGreaterThan(1);
  });

  it("seeds default redemption options with their monetary discount_value, where applicable", async () => {
    db.run(`INSERT INTO stores (id, name) VALUES ('store-a', 'A')`);
    core.setActiveStoreId("store-a");
    await ensureLoyaltyDefaultsSeeded("user-1");

    const options = await getLoyaltyRedemptionOptions();
    const naira500 = options.find((o) => o.label === "₦500 Discount");
    const naira1000 = options.find((o) => o.label === "₦1,000 Discount");
    const freeDelivery = options.find((o) => o.label === "Free Delivery");

    expect(naira500?.discount_value).toBe(500);
    expect(naira1000?.discount_value).toBe(1000);
    // Non-monetary perks seed with no discount value — not redeemable as a
    // POS checkout discount, only configurable/informational.
    expect(freeDelivery?.discount_value).toBe(0);
  });
});
