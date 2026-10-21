// Schema Migration Machinery Extracted from lib/db/core.ts:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-schema-migrations-ts-L1

/* eslint-disable max-lines */
import type { Database } from "sql.js";
// Cyclic by necessity (core.ts imports runSchemaMigrations from here), but safe:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L6
import { getActiveStoreId } from "./core";
import { STORAGE_KEYS } from "@/lib/storage-keys";

// Tables that just gained a `store_id` column (see SYNC_COLUMN_MIGRATIONS below) and need every pre-existing local row backfilled to the devic…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L12
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
  "permission_groups",
];

// Thin adapter over the two incompatible database handles so the migration steps below (identical logic on both platforms, just different exec…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L45
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

// Runs one statement, silently ignoring failure (e.g.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L87
async function tryRun(adapter: DbAdapter, sql: string): Promise<void> {
  try {
    await adapter.run(sql);
  } catch (_e) {
    // Expected on a re-run once the migration has already applied.
  }
}

// renameLegacyTablesAndColumns (medicines/vendors/store_profile/stock_batch renames, owner->store_owner, shipped 2026-06-27/06-28) and dropLeg…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L98

// Declarative table -> columns-to-ensure-exist list, consumed by runSyncColumnMigrations() below.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L113
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
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L209
      "is_reseller_sale INTEGER DEFAULT 0",
      "reseller_commission_percentage REAL DEFAULT 0",
      "reseller_commission_amount REAL DEFAULT 0",
      "reseller_markup_amount REAL DEFAULT 0",
      "reseller_commission_redeemed INTEGER DEFAULT 0",
      "reseller_commission_redeemed_amount REAL DEFAULT 0",
      "reseller_commission_claim_type TEXT",
      "reseller_commission_redeemed_at TEXT",
      "reseller_commission_redeemed_by TEXT",
      // Distinguishes a real reseller/agent sale (commission owed, subject to the redeem/store-claim decision above) from a store staff member simpl…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L222
      "markup_type TEXT DEFAULT 'reseller'",
      "reseller_commission_owed_back REAL",
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
      "list_price REAL",
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
      "auto_lock_duration INTEGER DEFAULT 5",
      "permission_group_id TEXT",
    ],
  },
  {
    table: "permission_groups",
    columns: [
      "store_id TEXT",
      "name TEXT",
      "based_on_role TEXT",
      "is_default INTEGER DEFAULT 0",
      "permissions TEXT DEFAULT '[]'",
      "created_at TEXT",
      "updated_at TEXT",
      "_version INTEGER DEFAULT 1",
      "_synced INTEGER DEFAULT 0",
      "_synced_at TEXT",
      "_deleted INTEGER DEFAULT 0",
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
      // Ties every audit_logs row written inside one multi-step operation (e.g.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L329
      "correlation_id TEXT",
      // Coalesces a repeated dedupable action (see audit-actions.ts's DEDUPABLE_AUDIT_ACTIONS) into one row instead of a fresh row per occurrence -…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L335
      "occurrence_count INTEGER DEFAULT 1",
      "last_occurred_at TEXT",
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
      // Immediate-purchase per-line-item overrides (selling price, cost override, lot/expiry) - previously only ever consumed transiently at receivi…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L391
      "selling_price REAL",
      "cost_price_override REAL",
      "lot_number TEXT",
      "expiry_date TEXT",
      // Cumulative quantity actually received against this line, in the same unit as bulk_quantity.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L399
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
      "is_reseller_sale INTEGER DEFAULT 0",
      "markup_type TEXT",
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
      // DEFAULT 1 (ON) so existing Pro/Enterprise stores already using the loyalty program see zero behavior change - only a store that explicitly f…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L499
      "loyalty_program_enabled INTEGER DEFAULT 1",
      // The rate calculateEarnedPoints() multiplies a sale's total by - 0.01 preserves the previously-hardcoded 1-point-per-100-currency rate for ev…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L503
      "loyalty_points_per_currency REAL DEFAULT 0.01",
      // DEFAULT 1 (ON): product/category names are always stored lowercase now, so without this every store would see an abrupt all-lowercase catalo…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L507
      "uppercase_display_enabled INTEGER DEFAULT 1",
      // For the Tax Invoice receipt print variant's header (see ReceiptView) - a store's formal tax/VAT registration ID, distinct from pcn_license/r…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L512
      "tax_number TEXT",
      // Store-wide % of a reseller sale's markup remitted back to the
      // reseller. See use-pos-payment.ts / use-redeem-reseller-commission-mutation.ts.
      "reseller_commission_percentage REAL DEFAULT 0",
      // One-time gate for ensureLoyaltyDefaultsSeeded() (loyalty.ts) - set the first time default tiers/redemption options are ever seeded for this…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L519
      "loyalty_defaults_seeded_at TEXT",
      // Same one-time-seed-gate pattern as loyalty_defaults_seeded_at above,
      // for ensurePermissionGroupsSeeded() (permission-groups.ts).
      "permission_groups_seeded_at TEXT",
      // Which revision of DEFAULT_GROUP_PERMISSIONS this store's default groups have been brought up to.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L529
      "permission_catalog_version INTEGER",
      // Whether the receipt header shows the store logo above the store name (default, matches every existing store's current receipt) or beside it.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L534
      "receipt_logo_position TEXT DEFAULT 'above'",
      // On by default, so an existing store's receipt is unchanged by the
      // upgrade. See ReceiptView / receipt-customization-card.tsx.
      "show_barcode_on_receipt INTEGER DEFAULT 1",
      // Server-managed bookkeeping for the storefront rebuild pipeline - mirrored here only so pull sync's dynamic column list doesn't fail with "no…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L541
      "store_slug_changed_at TEXT",
      "storefront_dirty_at TEXT",
      // Off by default: a cashier-initiated transfer request still moves stock immediately (just flagged needs_review - see stock-transfers.ts), so…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L546
      "staff_can_request_transfers INTEGER DEFAULT 0",
      // Off by default: gates the POS cart's entire "Reseller sale" row (both the reseller-commission and store-markup sub-types) behind an explicit…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L551
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
      // Coalesces a repeating crash report into one row instead of a fresh
      // row per occurrence - see error-logger.ts's captureError().
      "fingerprint TEXT",
      "occurrence_count INTEGER DEFAULT 1",
      "last_occurred_at TEXT",
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
      // Set to "needs_review" on a cross-store transfer's two rows (transfer_out/transfer_in) when the initiating user isn't admin-tier - a cashier-…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L589
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
  {
    table: "_sync_state",
    columns: ["server_cursor TEXT", "rewind_count INTEGER DEFAULT 0", "rewound_from TEXT"],
  },
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

// Backfills store_id on pre-existing rows of newly store-scoped tables to the device's one pre-migration store.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L637
async function backfillStoreIdOnLegacyRows(adapter: DbAdapter): Promise<void> {
  try {
    const rows = await adapter.all("SELECT COUNT(*) AS count FROM stores");
    if (Number(rows?.[0]?.count ?? 0) !== 1) return;

    for (const table of STORE_SCOPED_TABLES) {
      await tryRun(
        adapter,
        `UPDATE ${table} SET store_id = (SELECT id FROM stores) WHERE store_id IS NULL`,
      );
    }
  } catch (e) {
    console.error("Failed to backfill store_id on legacy rows", e);
  }
}

// `_sync_state` was keyed by `table_name` alone, so one watermark served every store a device held — and nothing reset it on a store switch.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-schema-migrations-L662
async function scopeSyncStateToStore(adapter: DbAdapter): Promise<void> {
  try {
    const columns = await adapter.all("PRAGMA table_info(_sync_state)");
    if (columns.some((column) => String(column.name) === "store_id")) return;

    const stores = await adapter.all("SELECT id FROM stores");
    const hasSoleStore = stores.length === 1;

    // Every partial state must be retryable from the still-intact old table:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L667
    await adapter.run("DROP TABLE IF EXISTS _sync_state_scoped");

    await adapter.run(`
      CREATE TABLE IF NOT EXISTS _sync_state_scoped (
        store_id TEXT NOT NULL DEFAULT '',
        table_name TEXT NOT NULL,
        last_synced_at TEXT,
        server_cursor TEXT,
        rewind_count INTEGER NOT NULL DEFAULT 0,
        rewound_from TEXT,
        PRIMARY KEY (store_id, table_name)
      )
    `);
    // A subquery rather than an interpolated id, matching
    // backfillStoreIdOnLegacyRows: the branch is already decided above.
    await adapter.run(`
      INSERT INTO _sync_state_scoped (store_id, table_name, last_synced_at, server_cursor, rewind_count, rewound_from)
      SELECT ${hasSoleStore ? "(SELECT id FROM stores)" : "''"}, table_name, last_synced_at, server_cursor, rewind_count, rewound_from FROM _sync_state
    `);
    await adapter.run("DROP TABLE _sync_state");
    await adapter.run("ALTER TABLE _sync_state_scoped RENAME TO _sync_state");
  } catch (e) {
    console.error("Failed to scope _sync_state to its store", e);
  }
}

// show_contact_on_receipt (a combined phone+address toggle) was split into show_phone_on_receipt/show_address_on_receipt.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L697
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

// products.name/categories.name are now written lowercase (see withNormalizedName in base-helpers.ts) so the UI can render them uppercase via…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L715
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

// deleteCategory only ever soft-deletes the categories row; it never touches products.category_id pointing at it, and (until the sync push fix…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L735
async function zeroNullStockBatchCostPrices(adapter: DbAdapter): Promise<void> {
  await tryRun(
    adapter,
    "UPDATE stock_batches SET cost_price = 0 WHERE cost_price IS NULL",
  );
}

async function clearOrphanedProductCategoryIds(adapter: DbAdapter): Promise<void> {
  // Matches getCategoryList()'s own visibility rule (store_id = mine, or NULL for pre-multi-tenancy rows) — a category_id pointing at a row that…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L757
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

// rebuildUsersTableForStoreScopedUsername (the users table rebuild that scoped username uniqueness to store_id, shipped 2026-08-01 — the same…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L778

// Relaxes purchase_orders.supplier_id to nullable, so an Immediate Purchase can be recorded without a real vendor (self/walk-in purchase) the…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L784
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

// One-off data clear for legacy transactions (retaining products, batches, users, and settings), gated on a localStorage flag so it only ever…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L833
async function clearLegacyTransactionsOnce(
  adapter: DbAdapter,
  onCleared?: () => Promise<void>,
): Promise<void> {
  try {
    const hasClearedLegacy = typeof window !== "undefined" && window.localStorage
      ? window.localStorage.getItem(STORAGE_KEYS.clearedLegacyV2)
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
        window.localStorage.setItem(STORAGE_KEYS.clearedLegacyV2, "true");
      }
      if (onCleared) await onCleared();
    }
  } catch (e) {
    console.error("Failed to clear legacy transactions", e);
  }
}

// Every index the local read paths depend on (see docs/LOCAL_DB_INDEXES.md for which query each one serves).
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L873
const READ_PATH_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_stock_batches_product_id ON stock_batches(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id)`,
  `CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON returns(sale_id)`,
  `CREATE INDEX IF NOT EXISTS idx_return_items_product_id ON return_items(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_store_id_created_at ON sales(store_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id ON stock_movements(reference_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_stock_batch_id ON stock_movements(stock_batch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_movements_store_id_created_at ON stock_movements(store_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_store_id_created_at ON audit_logs(store_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`,
  `CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)`,
  `CREATE INDEX IF NOT EXISTS idx_products_store_id_barcode ON products(store_id, barcode)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_table_name_record_id ON _sync_queue(table_name, record_id)`,
];

// How far `sales` may outgrow the row count the last ANALYZE recorded before the stats are rebuilt.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L910
const ANALYZE_STALENESS_FACTOR = 4;
const ANALYZE_STALENESS_FLOOR = 1000;

// The indexes alone are not enough, and shipping them without this step is worse than shipping nothing:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L917
async function ensureReadPathIndexes(
  adapter: DbAdapter,
  persist?: () => Promise<void>,
): Promise<void> {
  for (const statement of READ_PATH_INDEXES) {
    await tryRun(adapter, statement);
  }

  if (!(await areTableStatsStale(adapter))) return;

  await tryRun(adapter, `ANALYZE`);
  if (persist) await persist();
}

async function areTableStatsStale(adapter: DbAdapter): Promise<boolean> {
  try {
    const present = await adapter.all(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_stat1'`,
    );
    if (present.length === 0) return true;

    const recordedRows = await adapter.all(
      `SELECT stat FROM sqlite_stat1 WHERE tbl = 'sales' LIMIT 1`,
    );
    const recorded = Number(String(recordedRows[0]?.stat ?? "").split(" ")[0]);
    if (!Number.isFinite(recorded)) return true;

    const actualRows = await adapter.all(`SELECT COUNT(*) AS c FROM sales`);
    const actual = Number(actualRows[0]?.c ?? 0);
    return actual > recorded * ANALYZE_STALENESS_FACTOR + ANALYZE_STALENESS_FLOOR;
  } catch (_e) {
    return true;
  }
}

// The full, ordered migration sequence initDatabase() applies to an existing local database, identical on both backends.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-schema-migrations-ts-L964
export async function runSchemaMigrations(
  adapter: DbAdapter,
  persist?: () => Promise<void>,
): Promise<void> {
  await runSyncColumnMigrations(adapter, SYNC_COLUMN_MIGRATIONS);
  await backfillStoreIdOnLegacyRows(adapter);
  await backfillReceiptContactVisibility(adapter);
  await lowercaseExistingProductAndCategoryNames(adapter);
  await clearOrphanedProductCategoryIds(adapter);
  await zeroNullStockBatchCostPrices(adapter);
  await relaxPurchaseOrdersSupplierIdNullable(adapter);
  await scopeSyncStateToStore(adapter);
  await clearLegacyTransactionsOnce(adapter, persist);
  await ensureReadPathIndexes(adapter, persist);
}
