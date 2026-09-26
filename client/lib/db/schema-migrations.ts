/**
 * Schema Migration Machinery
 *
 * Extracted from lib/db/core.ts: the dual-backend adapter shim and the
 * idempotent, run-on-every-launch schema/data migration steps that
 * initDatabase() applies to an existing local database.
 */

/* eslint-disable max-lines */
import type { Database } from "sql.js";
// Cyclic by necessity (core.ts imports runSchemaMigrations from here), but
// safe: this is only ever read inside a migration step at call time, long
// after both modules have finished evaluating.
import { getActiveStoreId } from "./core";

// Tables that just gained a `store_id` column (see SYNC_COLUMN_MIGRATIONS
// below) and need every pre-existing local row backfilled to the device's one
// pre-migration store: today's local DB is single-store-per-device by
// construction, so there's exactly one store to backfill to.
export const STORE_SCOPED_TABLES = [
  "products",
  "stock_batches",
  "categories",
  "customers",
  "suppliers",
  "sales",
  "sale_items",
  "sale_item_batches",
  "prescriptions",
  "prescription_items",
  "expenses",
  "returns",
  "return_items",
  "purchase_orders",
  "purchase_order_items",
  "stock_audits",
  "held_transactions",
  "loyalty_transactions",
  "customer_payments",
  "stock_movements",
  "requested_products",
  "supplier_payments",
  "audit_logs",
  "loyalty_tiers",
  "loyalty_redemption_options",
];

// Thin adapter over the two incompatible database handles so the migration
// steps below (identical logic on both platforms, just different execute
// mechanics) can be written once instead of duplicated per-branch. `all()`
// always resolves to an array of plain row objects, matching what the Tauri
// SQL plugin already returns natively and what sql.js's columns/values pairs
// get normalized into.
export interface DbAdapter {
  run(sql: string): Promise<void>;
  all(sql: string): Promise<Record<string, unknown>[]>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeTauriAdapter(handle: any): DbAdapter {
  return {
    async run(sql) {
      await handle.execute(sql);
    },
    async all(sql) {
      return await handle.select(sql);
    },
  };
}

export function makeSqlJsAdapter(handle: Database): DbAdapter {
  return {
    run(sql) {
      handle.run(sql);
      return Promise.resolve();
    },
    all(sql) {
      const res = handle.exec(sql);
      if (!res || res.length === 0) return Promise.resolve([]);
      const { columns, values } = res[0];
      return Promise.resolve(
        values.map((row: unknown[]) =>
          Object.fromEntries(columns.map((c: string, i: number) => [c, row[i]])),
        ),
      );
    },
  };
}

// Runs one statement, silently ignoring failure (e.g. "column already
// exists" on a re-run) — the same tolerant, idempotent-by-retry pattern
// every migration step here has always used.
async function tryRun(adapter: DbAdapter, sql: string): Promise<void> {
  try {
    await adapter.run(sql);
  } catch (_e) {
    // Expected on a re-run once the migration has already applied.
  }
}

// renameLegacyTablesAndColumns (medicines/vendors/store_profile/stock_batch
// renames, owner->store_owner, shipped 2026-06-27/06-28) and
// dropLegacyVendorIdColumn (the purchase_orders.vendor_id NOT NULL drop,
// shipped 2026-08-04) were both removed once diagnoseLegacySchema(), run
// against the account that predates them (DumosRx Pharmacies,
// 2026-08-01), confirmed neither legacy table names nor a vendor_id column
// remained on that device.
//
// migrateStockQuantityToBatches (the flat products.stock_quantity ->
// stock_batches data migration, shipped 2026-06-28) was removed once every
// real device was confirmed to postdate it by 5+ weeks; stock_quantity
// isn't even in the current base schema anymore, so its guard condition
// (the column existing at all) could never be true on any account created
// after 2026-06-28.

// Declarative table -> columns-to-ensure-exist list, consumed by
// runSyncColumnMigrations() below. Hoisted out of initDatabase() itself
// since it's pure data with no dependency on either backend (Tauri/sql.js) -
// keeping it inline there just made the function look far larger/more
// complex than the actual branching logic it contains.
const SYNC_COLUMN_MIGRATIONS: { table: string; columns: string[] }[] = [
  {
    table: "products",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "is_active INTEGER DEFAULT 1",
      "store_id TEXT",
    ],
  },
  {
    table: "stock_batches",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "supplier_id TEXT",
      "manufacture_date TEXT",
      "batch_number TEXT",
      "quantity INTEGER DEFAULT 0",
      "cost_price REAL DEFAULT 0",
      "selling_price REAL DEFAULT 0",
      "expiry_date TEXT",
      "received_date TEXT",
      "notes TEXT",
      "store_id TEXT",
    ],
  },
  {
    table: "categories",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "is_active INTEGER DEFAULT 1",
      "parent_id TEXT",
      "store_id TEXT",
    ],
  },
  {
    table: "customers",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "store_id TEXT",
    ],
  },
  {
    table: "suppliers",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "contact_person TEXT",
      "email TEXT",
      "phone TEXT",
      "address TEXT",
      "tax_id TEXT",
      "payment_terms TEXT",
      "rating REAL DEFAULT 0",
      "is_active INTEGER DEFAULT 1",
      "deleted_at TEXT",
      "store_id TEXT",
    ],
  },
  {
    table: "sales",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "amount_paid REAL DEFAULT 0",
      "change_given REAL DEFAULT 0",
      "tax_percentage REAL DEFAULT 0",
      "discount_percentage REAL DEFAULT 0",
      "discount_amount REAL DEFAULT 0",
      "discount_type TEXT DEFAULT 'fixed'",
      "points_earned REAL DEFAULT 0",
      "points_redeemed REAL DEFAULT 0",
      "cashier_id TEXT",
      "payment_details TEXT",
      "prescription_id TEXT",
      "store_id TEXT",
      // Reseller-commission fields (see ResellerCommissionPanel / use-pos-payment.ts):
      // every checkout writes all three below (0-valued when the reseller
      // toggle is off), plus the redeemed/redeemed-at/redeemed-by trio set
      // once ResellerCommissionPanel marks a sale's commission paid out.
      "is_reseller_sale INTEGER DEFAULT 0",
      "reseller_commission_percentage REAL DEFAULT 0",
      "reseller_commission_amount REAL DEFAULT 0",
      "reseller_markup_amount REAL DEFAULT 0",
      "reseller_commission_redeemed INTEGER DEFAULT 0",
      "reseller_commission_redeemed_amount REAL DEFAULT 0",
      "reseller_commission_claim_type TEXT",
      "reseller_commission_redeemed_at TEXT",
      "reseller_commission_redeemed_by TEXT",
      // Distinguishes a real reseller/agent sale (commission owed, subject
      // to the redeem/store-claim decision above) from a store staff
      // member simply pricing above normal for their own reasons (markup
      // goes straight to the store, pre-settled - see use-pos-payment.ts).
      // DEFAULT 'reseller' so every existing is_reseller_sale row keeps its
      // current pending-redemption behavior unchanged.
      "markup_type TEXT DEFAULT 'reseller'",
    ],
  },
  {
    table: "sale_items",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "store_id TEXT",
    ],
  },
  {
    table: "sale_item_batches",
    columns: ["store_id TEXT"],
  },
  {
    table: "prescriptions",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "user_id TEXT",
      "dispensed_at TEXT",
      "store_id TEXT",
    ],
  },
  {
    table: "prescription_items",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "refills_authorized INTEGER DEFAULT 0",
      "refills_used INTEGER DEFAULT 0",
      "refill_interval_days INTEGER DEFAULT 30",
      "next_refill_date TEXT",
      "product_name TEXT DEFAULT ''",
      "strength TEXT",
      "dosage TEXT",
      "quantity INTEGER DEFAULT 0",
      "instructions TEXT",
      "cost REAL DEFAULT 0",
      "unit_cost REAL DEFAULT 0",
      "store_id TEXT",
    ],
  },
  {
    table: "expenses",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "user_id TEXT",
      "store_id TEXT",
      "covers_months INTEGER",
      "notes TEXT",
    ],
  },
  {
    table: "users",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "store_id TEXT",
      "first_name TEXT",
      "last_name TEXT",
    ],
  },
  {
    table: "audit_logs",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "store_id TEXT",
      // Ties every audit_logs row written inside one multi-step operation
      // (e.g. all ~10-15 rows a single sale writes across sales,
      // sale_items, stock_batches, stock_movements, customers,
      // loyalty_transactions) together, so the Activity Log can collapse
      // them into one entry instead of showing each as a separate action.
      "correlation_id TEXT",
    ],
  },
  {
    table: "loyalty_tiers",
    columns: ["store_id TEXT"],
  },
  {
    table: "loyalty_redemption_options",
    columns: ["store_id TEXT", "discount_value REAL DEFAULT 0"],
  },
  {
    table: "returns",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "store_id TEXT",
    ],
  },
  {
    table: "return_items",
    columns: ["store_id TEXT"],
  },
  {
    table: "purchase_orders",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "ordered_by TEXT",
      "order_date TEXT",
      "order_number TEXT",
      "supplier_id TEXT",
      "payment_status TEXT DEFAULT 'unpaid'",
      "amount_paid REAL DEFAULT 0",
      "due_date TEXT",
      "store_id TEXT",
      "type TEXT DEFAULT 'standard'",
    ],
  },
  {
    table: "purchase_order_items",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "store_id TEXT",
      // Immediate-purchase per-line-item overrides (selling price, cost
      // override, lot/expiry) - previously only ever consumed transiently
      // at receiving time and never persisted, so saving an in-progress
      // Immediate Purchase as a draft silently discarded them.
      "selling_price REAL",
      "cost_price_override REAL",
      "lot_number TEXT",
      "expiry_date TEXT",
      // Cumulative quantity actually received against this line, in the same
      // unit as bulk_quantity. Receiving used to be all-or-nothing: any
      // submitted quantity flipped the whole PO to "received", permanently
      // forfeiting the undelivered balance.
      "quantity_received INTEGER DEFAULT 0",
    ],
  },
  {
    table: "suppliers",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "contact_person TEXT",
      "email TEXT",
      "phone TEXT",
      "address TEXT",
      "payment_terms TEXT",
      "is_active INTEGER DEFAULT 1",
    ],
  },
  {
    table: "stock_audits",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "expected_cost_price REAL",
      "actual_cost_price REAL",
      "cost_price_difference REAL",
      "expected_selling_price REAL",
      "actual_selling_price REAL",
      "selling_price_difference REAL",
      "store_id TEXT",
    ],
  },
  {
    table: "held_transactions",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "store_id TEXT",
      "discount REAL DEFAULT 0",
      "discount_type TEXT",
    ],
  },
  {
    table: "loyalty_transactions",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "store_id TEXT",
    ],
  },
  {
    table: "customer_payments",
    columns: ["store_id TEXT"],
  },
  {
    table: "stores",
    columns: [
      "location TEXT",
      "created_at TEXT",
      "pcn_license TEXT",
      "receipt_header TEXT",
      "receipt_footer TEXT",
      "receipt_tagline TEXT",
      "show_logo_on_receipt INTEGER DEFAULT 1",
      "show_contact_on_receipt INTEGER DEFAULT 1",
      "show_phone_on_receipt INTEGER DEFAULT 1",
      "show_address_on_receipt INTEGER DEFAULT 1",
      "hide_powered_by INTEGER DEFAULT 0",
      "low_stock_warning INTEGER DEFAULT 1",
      "expiry_warning INTEGER DEFAULT 1",
      "expiry_warning_days INTEGER DEFAULT 90",
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "auto_sync_enabled INTEGER DEFAULT 1",
      "auto_sync_interval INTEGER DEFAULT 30",
      "status TEXT DEFAULT 'Active'",
      "suspension_reason TEXT",
      "show_retail_suggestions INTEGER DEFAULT 0",
      "require_payment_account INTEGER DEFAULT 0",
      'enabled_payment_methods TEXT DEFAULT \'["cash","card","transfer","credit","mixed"]\'',
      "online_store_enabled INTEGER DEFAULT 0",
      "registration_number TEXT",
      "custom_units TEXT DEFAULT '[]'",
      "is_demo INTEGER DEFAULT 0",
      "require_sale_notes INTEGER DEFAULT 0",
      "display_stock_levels INTEGER DEFAULT 1",
      // DEFAULT 1 (ON) so existing Pro/Enterprise stores already using the
      // loyalty program see zero behavior change - only a store that
      // explicitly flips this off in Settings gets paused.
      "loyalty_program_enabled INTEGER DEFAULT 1",
      // The rate calculateEarnedPoints() multiplies a sale's total by - 0.01
      // preserves the previously-hardcoded 1-point-per-100-currency rate for
      // every existing store until they change it in Loyalty Settings.
      "loyalty_points_per_currency REAL DEFAULT 0.01",
      // DEFAULT 1 (ON): product/category names are always stored lowercase
      // now, so without this every store would see an abrupt all-lowercase
      // catalog the moment this shipped, instead of the uppercase-via-CSS
      // display they're used to.
      "uppercase_display_enabled INTEGER DEFAULT 1",
      // For the Tax Invoice receipt print variant's header (see ReceiptView) -
      // a store's formal tax/VAT registration ID, distinct from
      // pcn_license/registration_number.
      "tax_number TEXT",
      // Store-wide % of a reseller sale's markup remitted back to the
      // reseller. See use-pos-payment.ts / use-redeem-reseller-commission-mutation.ts.
      "reseller_commission_percentage REAL DEFAULT 0",
      // One-time gate for ensureLoyaltyDefaultsSeeded() (loyalty.ts) - set
      // the first time default tiers/redemption options are ever seeded for
      // this store, so a store that later deliberately deletes every tier
      // doesn't get them silently reseeded next time Loyalty Settings opens.
      // NULL on every existing row until this migration's store's first
      // post-upgrade seed decision.
      "loyalty_defaults_seeded_at TEXT",
      // Whether the receipt header shows the store logo above the store
      // name (default, matches every existing store's current receipt) or
      // beside it. See ReceiptView / receipt-customization-card.tsx.
      "receipt_logo_position TEXT DEFAULT 'above'",
      // Server-managed bookkeeping for the storefront rebuild pipeline -
      // mirrored here only so pull sync's dynamic column list doesn't fail
      // with "no such column"; nothing in this app writes to them.
      "store_slug_changed_at TEXT",
      "storefront_dirty_at TEXT",
      // Off by default: a cashier-initiated transfer request still moves
      // stock immediately (just flagged needs_review - see
      // stock-transfers.ts), so this stays opt-in rather than silently
      // granting every existing store's staff that ability on upgrade.
      "staff_can_request_transfers INTEGER DEFAULT 0",
      // Off by default: gates the POS cart's entire "Reseller sale" row
      // (both the reseller-commission and store-markup sub-types) behind
      // an explicit owner opt-in, on top of the existing plan-tier check -
      // see isMarkupSalesEnabled in use-feature-gate.ts.
      "markup_sales_enabled INTEGER DEFAULT 0",
      // Paystack subaccount integration columns (see Task 1 of the
      // 2026-09-26-storefront-paystack-subaccounts spec).
      "paystack_subaccount_code TEXT",
      "paystack_subaccount_country TEXT",
      "paystack_bank_code TEXT",
      "paystack_account_number_last4 TEXT",
      "paystack_fee_dirty_at TEXT",
    ],
  },
  {
    table: "feedback",
    columns: [
      "updated_at TEXT",
      "_version INTEGER DEFAULT 1",
      "_deleted INTEGER DEFAULT 0",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
    ],
  },
  {
    table: "stock_movements",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "stock_batch_id TEXT",
      "store_id TEXT",
      // Set to "needs_review" on a cross-store transfer's two rows
      // (transfer_out/transfer_in) when the initiating user isn't
      // admin-tier - a cashier-requested transfer still takes effect
      // immediately, just flagged for the owner to check afterward.
      "status TEXT",
    ],
  },
  { table: "payment_accounts", columns: ["user_id TEXT", "store_id TEXT"] },
  {
    table: "requested_products",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "quantity INTEGER DEFAULT 1",
      "notes TEXT",
      "store_id TEXT",
    ],
  },
  {
    table: "supplier_payments",
    columns: [
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
      "store_id TEXT",
    ],
  },
  { table: "_sync_queue", columns: ["next_retry_at TEXT"] },
];

async function runSyncColumnMigrations(
  adapter: DbAdapter,
  syncColumns: { table: string; columns: string[] }[],
): Promise<void> {
  for (const { table, columns } of syncColumns) {
    for (const colDef of columns) {
      await tryRun(adapter, `ALTER TABLE ${table} ADD COLUMN ${colDef}`);
    }
  }
}

// Backfills store_id on every pre-existing row of newly store-scoped tables
// to this device's one pre-migration store. WHERE store_id IS NULL makes
// this naturally idempotent on subsequent launches.
async function backfillStoreIdOnLegacyRows(adapter: DbAdapter): Promise<void> {
  try {
    for (const table of STORE_SCOPED_TABLES) {
      await tryRun(
        adapter,
        `UPDATE ${table} SET store_id = (SELECT id FROM stores LIMIT 1) WHERE store_id IS NULL`,
      );
    }
  } catch (e) {
    console.error("Failed to backfill store_id on legacy rows", e);
  }
}

// show_contact_on_receipt (a combined phone+address toggle) was split into
// show_phone_on_receipt/show_address_on_receipt. Both new columns default to
// 1 on ALTER TABLE, so a store that had turned contact info off would
// otherwise find both back on after this migration - this carries that
// store's existing off-state onto both new columns once. WHERE
// show_contact_on_receipt = 0 makes it naturally idempotent (nothing left to
// backfill once the new columns already reflect it).
async function backfillReceiptContactVisibility(adapter: DbAdapter): Promise<void> {
  try {
    await tryRun(
      adapter,
      `UPDATE stores SET show_phone_on_receipt = 0, show_address_on_receipt = 0 WHERE show_contact_on_receipt = 0 AND show_phone_on_receipt = 1 AND show_address_on_receipt = 1`,
    );
  } catch (e) {
    console.error("Failed to backfill receipt contact visibility", e);
  }
}

// products.name/categories.name are now written lowercase (see
// withNormalizedName in base-helpers.ts) so the UI can render them uppercase
// via CSS regardless of how they were typed/imported. Rows written before
// that change (e.g. an ALL-CAPS QuickBooks import, or a manually-typed mixed
// case name) predate the rule, so this re-lowercases them on every init. It's
// idempotent (a no-op once already lowercase) like backfillStoreIdOnLegacyRows
// above, so it doesn't need a one-time-run flag.
async function lowercaseExistingProductAndCategoryNames(
  adapter: DbAdapter,
): Promise<void> {
  await tryRun(
    adapter,
    "UPDATE products SET name = LOWER(TRIM(name)) WHERE name != LOWER(TRIM(name))",
  );
  await tryRun(
    adapter,
    "UPDATE categories SET name = LOWER(TRIM(name)) WHERE name != LOWER(TRIM(name))",
  );
}

// deleteCategory only ever soft-deletes the categories row; it never touches
// products.category_id pointing at it, and (until the sync push fix landed
// server-side) a generic category name could also get silently merged into
// an unrelated store's row that later got renamed/deleted out from under
// this store. Either way, the product is left holding a category_id that no
// longer resolves to a name — this clears it so the catalog shows
// "Uncategorized" (and, crucially, the category can be re-picked from the
// dropdown again) instead of the dead id staying stuck forever. Idempotent:
// a product with a valid category_id is untouched.
async function clearOrphanedProductCategoryIds(adapter: DbAdapter): Promise<void> {
  // Matches getCategoryList()'s own visibility rule (store_id = mine, or
  // NULL for pre-multi-tenancy rows) — a category_id pointing at a row that
  // exists but belongs to a *different* store (the cross-store merge bug;
  // see 2026_09_12_000000_scope_category_uniqueness_to_store) is just as
  // dead to this store as one that was hard-deleted, since it'll never show
  // up in this store's dropdown either.
  // tryRun/adapter.run take a raw SQL string with no bind-param support, so
  // this inlines storeId directly — safe here since it's an internally
  // generated UUID (see getActiveStoreId), never raw user input.
  const storeId = getActiveStoreId();
  await tryRun(
    adapter,
    `UPDATE products SET category_id = NULL
     WHERE category_id IS NOT NULL
       AND category_id NOT IN (
         SELECT id FROM categories
         WHERE _deleted = 0${storeId ? ` AND (store_id = '${storeId}' OR store_id IS NULL)` : ""}
       )`,
  );
}

// rebuildUsersTableForStoreScopedUsername (the users table rebuild that
// scoped username uniqueness to store_id, shipped 2026-08-01 — the same day
// as the earliest real account) was removed once diagnoseLegacySchema(),
// run against that account, confirmed its users table already had
// UNIQUE(store_id, username).

// Relaxes purchase_orders.supplier_id to nullable, so an Immediate Purchase
// can be recorded without a real vendor (self/walk-in purchase) the same way
// sales.customer_id already supports a null "Walk-in Customer". SQLite can't
// ALTER a column's NOT NULL constraint, so recreate the table; must run
// after the syncColumns migration so the `type` column already exists to
// carry over.
async function relaxPurchaseOrdersSupplierIdNullable(adapter: DbAdapter): Promise<void> {
  try {
    const tableInfo = await adapter.all(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='purchase_orders'",
    );
    const poTableSql = String(tableInfo?.[0]?.sql || "");
    if (poTableSql && /supplier_id\s+TEXT\s+NOT\s+NULL/i.test(poTableSql)) {
      await adapter.run(`
        CREATE TABLE purchase_orders_nullable_supplier (
          id TEXT PRIMARY KEY,
          order_number TEXT,
          supplier_id TEXT,
          ordered_by TEXT,
          order_date TEXT,
          status TEXT DEFAULT 'pending',
          type TEXT DEFAULT 'standard',
          payment_status TEXT DEFAULT 'unpaid',
          amount_paid REAL DEFAULT 0,
          due_date TEXT,
          total_amount REAL DEFAULT 0,
          notes TEXT,
          created_at TEXT,
          received_at TEXT,
          updated_at TEXT,
          store_id TEXT,
          _version INTEGER DEFAULT 1,
          _synced INTEGER DEFAULT 0,
          _synced_at TEXT,
          _deleted INTEGER DEFAULT 0
        )
      `);
      await adapter.run(`
        INSERT INTO purchase_orders_nullable_supplier (id, order_number, supplier_id, ordered_by, order_date, status, type, payment_status, amount_paid, due_date, total_amount, notes, created_at, received_at, updated_at, store_id, _version, _synced, _synced_at, _deleted)
        SELECT id, order_number, supplier_id, ordered_by, order_date, status, type, payment_status, amount_paid, due_date, total_amount, notes, created_at, received_at, updated_at, store_id, _version, _synced, _synced_at, _deleted FROM purchase_orders
      `);
      await adapter.run("DROP TABLE purchase_orders");
      await adapter.run("ALTER TABLE purchase_orders_nullable_supplier RENAME TO purchase_orders");
    }
  } catch (e) {
    console.error("Failed to relax purchase_orders.supplier_id to nullable", e);
  }
}

// One-off data clear for legacy transactions (retaining products, batches,
// users, and settings), gated on a localStorage flag so it only ever runs
// once per device. `onCleared` lets the web caller persist the change
// (Tauri writes land on disk directly, with no equivalent save step).
async function clearLegacyTransactionsOnce(
  adapter: DbAdapter,
  onCleared?: () => Promise<void>,
): Promise<void> {
  try {
    const hasClearedLegacy = typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem("dumosrx_cleared_legacy_v2")
      : "true";
    if (!hasClearedLegacy) {
      const tablesToClear = [
        "sales",
        "sale_items",
        "stock_movements",
        "returns",
        "return_items",
        "prescriptions",
        "prescription_items",
        "expenses",
        "purchase_orders",
        "purchase_order_items",
        "audit_logs",
        "_sync_queue",
      ];
      for (const table of tablesToClear) {
        await tryRun(adapter, `DELETE FROM ${table}`);
      }
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("dumosrx_cleared_legacy_v2", "true");
      }
      if (onCleared) await onCleared();
    }
  } catch (e) {
    console.error("Failed to clear legacy transactions", e);
  }
}

// stock_batches.product_id has no index, so every correlated subquery
// against it in getProductsWithDetails() (five of them, plus a sixth for
// last_bought_price) does a full table scan per product row - the query
// core.ts documents as the app's largest/slowest, already the one known to
// yield mid-iteration under concurrent sync writes. CREATE INDEX IF NOT
// EXISTS is naturally idempotent, so this doesn't strictly need tryRun's
// swallow-on-rerun behavior, but it's used for consistency with the rest of
// this file.
async function ensureStockBatchesProductIndex(adapter: DbAdapter): Promise<void> {
  await tryRun(
    adapter,
    `CREATE INDEX IF NOT EXISTS idx_stock_batches_product_id ON stock_batches(product_id)`,
  );
}

// The full, ordered migration sequence initDatabase() applies to an existing
// local database, identical on both backends. `onLegacyCleared` is only
// supplied on the web/sql.js path, where an in-memory delete still has to be
// persisted back to IndexedDB; Tauri's SQL plugin writes land on disk directly.
export async function runSchemaMigrations(
  adapter: DbAdapter,
  onLegacyCleared?: () => Promise<void>,
): Promise<void> {
  await runSyncColumnMigrations(adapter, SYNC_COLUMN_MIGRATIONS);
  await backfillStoreIdOnLegacyRows(adapter);
  await backfillReceiptContactVisibility(adapter);
  await lowercaseExistingProductAndCategoryNames(adapter);
  await clearOrphanedProductCategoryIds(adapter);
  await relaxPurchaseOrdersSupplierIdNullable(adapter);
  await clearLegacyTransactionsOnce(adapter, onLegacyCleared);
  await ensureStockBatchesProductIndex(adapter);
}
