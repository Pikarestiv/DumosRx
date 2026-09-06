# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet, tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings.

## Open items

### `SyncController::push()`'s `stale_timestamp` conflict-fallback branch is unreachable dead code

- **Where:** `laravel-server/app/Http/Controllers/Api/App/SyncController.php`, `push()`'s UPDATE handling — the `elseif (!$isCommutativeTable && $model->updated_at && isset($payload['updated_at']))` branch, reached only when `$modelVersion` (`$model->_version`) is `null`.
- **Why unreachable:** every `_version` column in the current schema is `integer default(1)` **NOT NULL** (every `create_*_table`/`align_schema_with_client_db` migration) — the DB itself rejects an explicit `null`, so `$modelVersion` can never actually be `null` for any real row.
- **Why not fixed:** low priority (dead code, not a live bug) and removing it isn't purely mechanical — would need confirming no legacy/pre-migration row anywhere in production still has a genuinely null version outside this schema's guarantee. Left in place with a comment; no test exists for it since the state it guards against can't be constructed. See the comment above `test_push_sync_generates_a_stable_device_id_when_store_insert_omits_one` in `tests/Feature/SyncEndpointTest.php`.

## Deferred work (not bugs — explicit scope decisions)

- **`SyncController::push()`/`pull()` were not structurally refactored.** Both are large (push() ~730 lines) and every special case is backed by a real, documented production incident (see the method's own doc comments and `git log -S` on individual fixes). Judged too risky to mechanically extract without first having comprehensive characterization tests — those tests were added instead (`SyncEndpointTest.php`, `SyncPullMappingTest.php`, `SyncValidationTest.php`), and the structural refactor itself was deferred.
- **`AuthController` (~895 lines) was not split by sub-domain**, unlike `AdminController`/`AdminService`. It's security-critical (login/session/token issuance); splitting risks subtly changing how middleware/guards apply per route for a pure-reorganization change with no functional upside. Left as a single file.
- **`client/lib/db/core.ts`'s `backfillStoreIdOnLegacyRows()` and `relaxPurchaseOrdersSupplierIdNullable()` are still active**, not yet retired the way older schema-repair migrations were (`renameLegacyTablesAndColumns`, `dropLegacyVendorIdColumn`, etc. — see the comments above `SYNC_COLUMN_MIGRATIONS` in `core.ts`). They *could* eventually follow the same removal pattern once every currently-active account is confirmed to have a local DB created after each migration's ship date (`backfillStoreIdOnLegacyRows`: 2026-08-14; `relaxPurchaseOrdersSupplierIdNullable`: 2026-08-29) — checked via `diagnoseLegacySchema()`-style inspection of each device's real local file, not via the admin dashboard (subscription-start dates shown there aren't a reliable proxy for local DB creation date). As of this check, several active accounts predate both ship dates, so neither is removable yet.
