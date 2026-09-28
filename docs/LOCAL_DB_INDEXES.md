# Local SQLite indexes

Every index on the client's local database is declared in one place:
`READ_PATH_INDEXES` in `client/lib/db/schema-migrations.ts`, applied by
`ensureReadPathIndexes()` as the last step of `runSchemaMigrations()`.

This document records which query each index exists for, and the two
decisions that are easy to get wrong when adding another one.

## Why they are not in `SCHEMA_SQL`

`SCHEMA_SQL` would be the natural home, and `idx_stock_batches_product_id`
still lives there for historical reasons. It is not the home for the rest.

`core.ts` hands the whole of `SCHEMA_SQL` to sql.js as one `db.run()` call.
A `CREATE INDEX` that names a column an existing local table does not have
yet throws, and everything after it in the blob — including `CREATE TABLE`
statements — never runs. That is not hypothetical: `store_id` is a
migration-added column and is absent from most of `SCHEMA_SQL`'s own
`CREATE TABLE` bodies, and a database old enough to predate a column is
exactly the database that most needs the migration pass to succeed.

`runSchemaMigrations()` runs on fresh installs as well as upgrades, and runs
after the column migrations, so declaring indexes only there gives both
populations the same set with no ordering hazard. Each statement also goes
through `tryRun`, so one index that cannot be built on an unusual legacy
database does not take the other fifteen with it.

## The indexes and what they serve

| Index | Serves |
| --- | --- |
| `idx_stock_batches_product_id` | `getProductsWithDetails()`'s six correlated subqueries per product row |
| `idx_sale_items_sale_id` | `getRecentSales()` item count / item names; `getFastMovers()`'s sales→items join |
| `idx_returns_sale_id` | the net-of-refunds subquery in `getRecentSales()`, `getCustomers()`, `getCustomerTotalSpent()` |
| `idx_return_items_product_id` | `getFastMovers()`'s two correlated return subqueries |
| `idx_sales_customer_id` | `getCustomers()`'s per-customer sales join; `getCustomerTransactions()` |
| `idx_sales_created_at` | `getFastMovers()`'s two period windows, which filter `created_at` with no store predicate |
| `idx_sales_store_id_created_at` | `getRecentSales()` — store filter plus `ORDER BY created_at DESC` in one index |
| `idx_stock_movements_product_id` | `getProductHistory()` |
| `idx_stock_movements_reference_id` | movement lookups by the sale / PO / return that produced them |
| `idx_stock_movements_store_id_created_at` | the dashboard movements feed in `reports.ts` |
| `idx_audit_logs_record_id` | `getProductHistory()`'s audit half |
| `idx_audit_logs_store_id_created_at` | the activity log's paged `ORDER BY created_at` |
| `idx_products_barcode` | the product-import barcode lookup on a device with no active store |
| `idx_products_name` | name lookups and catalog ordering |
| `idx_products_store_id_barcode` | the product-import barcode lookup, per imported row, when a store is active |
| `idx_sync_queue_table_name_record_id` | `pull.ts`'s per-pulled-record queue probe; `reconcile-identity.ts`'s boot-time orphan scan |

## Decision: none of these are `UNIQUE`

`products.barcode` was the tempting one. It is not unique today, and making
it unique would be a new constraint applied retroactively to data that was
never validated against it:

- every lookup in the app is already written `... LIMIT 1`, so nothing
  depends on there being one match;
- import de-duplication is app-level (union-find in `product-import.ts`),
  deliberately, because two catalog rows can legitimately share a barcode;
- a device with multi-store access holds several stores' catalogs in one
  table, so the same barcode appears once per store by design.

A `CREATE UNIQUE INDEX` against a database that already violates it fails.
Because `ensureReadPathIndexes()` runs each statement through `tryRun`, that
failure would be swallowed and the index would silently never exist — on
precisely the mature databases this work exists to speed up.

## Decision: `store_id` is never indexed on its own

A single-store device has one `store_id` for every row in the table, so an
index on it alone is a full scan with an index's name on it — and the
planner will pick it. Measured: with a standalone `idx_products_store_id`,
the import's `WHERE barcode = ? AND store_id = ?` lookup planned as
`SEARCH products USING INDEX idx_products_store_id (store_id=?)` and still
visited the whole catalog. `store_id` therefore only ever appears as the
leading column of a composite whose second column is selective.

## Decision: the `ANALYZE` step is not optional

Indexes without statistics made one query **three times slower than having
no indexes at all**. With no `sqlite_stat1`, SQLite plans from built-in
row-count guesses, and on the synthetic one-year store it drove
`getCustomers()`'s 2,000-customer join off `idx_sales_store_id_created_at`
(which matches every sale on a single-store device) instead of
`idx_sales_customer_id`: 10.2 s unindexed became 30.5 s indexed. A full
`ANALYZE` makes the same query 55 ms.

Sampling it (`PRAGMA analysis_limit = 400`) costs 6.8 ms instead of 94 ms,
but the sampled stats leave the activity log's `COUNT(*)` preferring a
200,000-row index scan over the table scan that actually wins (100 ms vs
22 ms). So the stats are built in full, and instead rebuilt rarely:
`areTableStatsStale()` compares the row count `sqlite_stat1` recorded for
`sales` against the live count and re-runs `ANALYZE` when the table has
grown past `ANALYZE_STALENESS_FACTOR`× that. This also covers the fresh
install, which necessarily analyses an empty database and would otherwise
keep those stats for the life of the device.

## Benchmark

sql.js (the engine the web/PWA build runs on), desktop Node. Synthetic
one-year store: 5,000 products, 2,000 customers, 50,000 sales, ~100,000 sale
items, 50,000 stock movements, 3,000 returns, 200,000 audit rows, 15,000
queued sync rows. **An entry-level Android tablet running the same WASM
engine is typically 5–20× slower, and on the web build every one of these
blocks the main thread.**

| Query | Before | After |
| --- | --- | --- |
| `getRecentSales()` (100 rows, 3 correlated subqueries) | 772 ms | 0.7 ms |
| `getCustomers()` (2,000 customers, netted spend) | 10,194 ms | 55 ms |
| Activity log page (`ORDER BY created_at`, 50 rows) | 31 ms | 0.2 ms |
| Activity log `COUNT(*)` | 22 ms | 22 ms |
| `getProductHistory()` (one product) | 14 ms | 0.2 ms |
| Product-import barcode lookup ×200 rows | 5.8 ms | 3.6 ms |
| `pull.ts` `_sync_queue` probe ×500 records | 20 ms | 7.5 ms |
| Boot-time orphan scan (`products`) | 11 ms | 9.0 ms |
| Dashboard movements feed | 12 ms | 15 ms |
| One-off `ANALYZE` | — | 95 ms |

The dashboard movements feed is a wash: its `reference_type NOT IN (…)`
predicate is not indexable, so both plans scan, and the difference is noise.
The remaining full-table scans in that list are the ones A-8 covers
(the boot-time orphan scan, the per-pull `stores` prune), not this work.

Regression coverage lives in `client/__tests__/schema-indexes.test.ts`,
which asserts the index set after a fresh init and after migrating a
pre-index database, asserts `EXPLAIN QUERY PLAN` reaches each index rather
than scanning, and pins both decisions above.
