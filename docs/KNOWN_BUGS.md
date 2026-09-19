# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet, tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings. Fixed entries are removed outright rather than marked — this file is a to-do list, not a changelog (git history is the changelog).

## Open items

### Public storefront endpoint leaks full product records (id, cost_price, store_id) unauthenticated

- **Where:** `laravel-server/app/Http/Controllers/Api/Public/StorefrontController.php`
  returns full `Product` models (unguarded, unhidden) on unauthenticated
  routes, and `/storefront-slugs` enumerates every storefront.
- **Effect:** anyone can harvest a competitor's real product UUIDs,
  `cost_price`, and `store_id` with no authentication at all. This used to
  chain into a much worse bug — `SyncController::push()`'s UPDATE/DELETE
  handling applied changes against any record id with no ownership check —
  but that half is now fixed: `push()` verifies a resolved `store_id`
  against the caller's own stores before applying UPDATE/DELETE (falling
  back to `user_id` ownership, then failing open, only for legacy rows that
  predate the store_id backfill migration and have no owner signal at all —
  see `authorizeChangeTarget()`/`resolveChangeStoreId()`), and rejects an
  INSERT payload that names a `store_id` outside the caller's own stores.
  Regression coverage: `tests/Feature/SyncPushOwnershipTest.php`. The
  storefront leak itself is still open — it's an information-disclosure
  gap (competitor intel, no longer a mutation vector) rather than the
  data-corruption vulnerability it used to enable.
- **Fix scope (not implemented):** decide whether the public storefront
  response needs to omit `id`/`cost_price`/`store_id`, or whether it's
  acceptable as-is now that it can no longer be leveraged into a write.

### Stock-batch deltas applied outside per-change sync savepoints

- **Where:** `SyncController.php`'s `push()` accumulates `$stockBatchDeltas`
  during the per-change loop (each change wrapped in its own savepoint so
  one bad row doesn't block the rest of the backlog) but applies the
  deltas afterward, guarded only by the outer transaction `try`. A minor
  sibling: a delta can be accumulated before its originating change's
  savepoint actually commits.
- **Effect:** any exception during delta application (a constraint
  violation, a deadlock) rolls back the entire push transaction, so the
  whole batch — not just the offending row — gets re-queued and retried,
  hitting the same failure again.
- **Fix scope (not implemented):** apply each accumulated delta inside its
  own savepoint (or the originating change's savepoint) rather than after
  the main loop.

### Account/store switch may briefly show the previous store's stale dashboard data (unreproduced)

- **Where:** `client/lib/context/store-context.tsx`'s `switchStore()` calls
  `queryClient.cancelQueries()` then a broad, deliberately untargeted
  `queryClient.invalidateQueries()`. React Query's default behavior for
  `invalidateQueries()` is to mark queries stale and refetch in the
  background *without* clearing what's currently rendered — a component
  keeps showing its last-known (now-stale) data until the refetch resolves.
- **Reported:** a user-reported "a small lag when one switches account or
  something where for a second or so, after switching, the old account's
  dashboard is shown."
- **Investigated, not reproduced:** the store-switcher path was exercised 6
  times alternating between two real stores with meaningfully different
  data, using rapid back-to-back screenshots with no manual delay; a second,
  structurally different switching mechanism (multi-staff PIN "Switch
  Account," which goes through `login()`'s `queryClient.clear()` instead —
  clears outright rather than marking stale-but-displayable) was also
  exercised. Every trial's very first screenshot after the switch already
  showed the fully correct destination data; no stale frame was ever caught,
  and no console errors appeared.
- **Status:** the stale-render window is real by design in this app's
  local-first architecture (sql.js reads, no network round-trip), but
  apparently resolves fast enough on this test device/data volume to be
  imperceptible. Not fixed — nothing to fix without a reproduction. A slower
  device, a much larger local DB, or sync contention during the switch could
  plausibly still hit the window. If this is reported again, get a screen
  recording (screenshots polled between tool calls could miss a sub-second
  flash) and consider adding a dedicated loading/placeholder state to the
  store-switch transition itself.

### Superadmin Handoff: impersonation defaults to the real production domain, with no in-panel way to override it once logged in

- **Where:** `web/lib/constants.ts`'s `APP_URL` falls back to
  `https://app.dumosrx.com` whenever `NEXT_PUBLIC_APP_URL` is unset.
  `getAppURL()` checks a `localStorage` override first, but the only UI that
  can set it (`ServerSelector`) is mounted on the login page, not anywhere
  inside the admin panel once already authenticated.
- **Effect:** any dev/QA session that started already logged in (never went
  through the login form's Server Config dropdown) silently sends a real
  handoff code to production on the very first "Impersonate" click, for
  every session until someone thinks to log out and back in through the
  dropdown. No account compromise results (the code is short-lived,
  single-use, and scoped to whichever store was impersonated), but there's
  no on-panel warning this is about to happen.
- **Fix scope (not implemented):** surface the App URL override somewhere
  reachable from inside the logged-in panel, not just the pre-login form.

### Product Catalog page briefly (and genuinely) shows "No products found" after a large sync (reproduced)

- **Where:** `client/components/products/product-database.tsx`'s
  `getProductsWithDetails()` query (rendered through
  `catalog-list.tsx`/`catalog-list-states.tsx`, which already has a
  dedicated loading skeleton specifically to avoid flashing the "empty
  catalog" state during a normal load — see that file's own comment).
- **Reproduced:** immediately after importing ~1900 products and while the
  resulting sync backlog was still draining, navigating to
  `/inventory/catalog` rendered the skeleton, then settled on "No products
  found" — not a stale/loading flag misread, since `isLoading` was
  confirmed `false` and the query had genuinely completed with an empty
  result. In the same window, the Dashboard's and Inventory Overview's own
  "Total Products" counts (separate queries) stayed correct the entire
  time (1892→1895 as the test imports landed), and the persisted local
  DB's IndexedDB blob size was unchanged and consistent with a full
  dataset — ruling out real data loss. Navigating away (e.g. to
  `/dashboard`) and back to `/inventory/catalog` made the correct list
  reappear, with no user action beyond that.
- **Effect:** for up to roughly a minute or two after a large sync
  operation, a user opening the Catalog tab sees a false "catalog is
  empty, add your first product" screen instead of their real inventory —
  alarming, and easy to mistake for actual data loss (as happened during
  this investigation) even though the underlying data was never at risk.
- **Status:** not root-caused. Plausible cause given this codebase's other
  documented sync/query-invalidation issues (see the store-switch entry
  above): `getProductsWithDetails()`'s local SQL query executing against a
  transient intermediate state of a large pull/push apply (e.g. a
  delete-then-reinsert step, or a snapshot taken between two halves of a
  multi-statement sync transaction) rather than a react-query stale-cache
  problem, given `isLoading` genuinely reflected a completed empty fetch,
  not a stale flag. Needs a repro with a smaller, more controllable sync
  backlog and direct instrumentation of `getProductsWithDetails()`'s call
  sites relative to `queueTableInvalidation` firing during sync, to catch
  it mid-transition rather than after the fact.

### `SyncController::push()`'s `stale_timestamp` conflict-fallback branch — corrected: NOT dead code

- **Where:** `laravel-server/app/Http/Controllers/Api/App/SyncController.php`, `push()`'s UPDATE handling — the `elseif (!$isCommutativeTable && $model->updated_at && isset($payload['updated_at']))` branch, guarding the case where `$payloadVersion !== null && $modelVersion !== null` is false.
- **This entry previously claimed the branch was unreachable dead code**, reasoning that `$modelVersion` (`$model->_version`) can never be `null` since every `_version` column is `integer default(1)` NOT NULL. That half of the reasoning is correct — confirmed both from every migration and git history, and directly against the production DB (a full `SELECT ... WHERE _version IS NULL` sweep across all 31 tables with a `_version` column returned zero rows).
- **What the original analysis missed:** the guard is `$payloadVersion !== null && $modelVersion !== null` — it's false whenever *either* side is null, not just when `$modelVersion` is. `$payloadVersion` genuinely can be null: a payload can simply omit the `_version` key. `tests/Feature/SyncEndpointTest.php::test_push_sync_handles_soft_deletes` does exactly this (an `UPDATE` with `_deleted: 1` and no `_version` field) and relies on the timestamp-fallback branch to accept it. Removing the branch broke that test (and `test_push_sync_generates_a_stable_device_id_when_store_insert_omits_one`) immediately.
- **Status:** left in place, confirmed live. Do not remove without also confirming no real caller ever sends an `UPDATE` payload without `_version` — today's client (`base-helpers.ts`'s `update()`) always includes it, but this legacy fallback protects against payloads that don't (whether from an older client version, or a hand-built payload like the soft-delete test above).

### Detailed Sales Report PDF: Transaction # cell overflows into the next column

- **Where:** `client/components/reports/pdf/report-pdf-document.tsx`'s table
  cell rendering (react-pdf `<Text>` inside a flex `View`), fed by
  `client/lib/hooks/use-report-export.ts`'s `sales` report config.
- **Reported:** visually confirmed on a generated Sales Report PDF — the
  Transaction # column's value bleeds past its cell's right border into the
  Date column.
- **Attempted fix (unverified — reporter says it didn't resolve it):** added
  `overflow: "hidden"` to `styles.cell` and gave the sales report an explicit
  `columnFlex` (`[1.8, 1.3, 1.3, 1, 1, 0.8, 1, 1, 1, 1, 1]`) to widen the
  Transaction # column. react-pdf's `overflow` support and flex-basis
  interaction with long unbroken tokens (no spaces to wrap on, e.g. a
  `TXN...`/`RCT-...` id) may behave differently than standard CSS — needs
  visual re-verification against an actual rendered PDF (Chrome's built-in
  PDF viewer isn't screenshottable via this project's browser-automation
  tooling, which blocked confirming the fix in this pass).
- **Fix scope (not fully verified):** re-check rendered PDF output directly
  (e.g. via a local PDF renderer/CLI, not just the browser tab) after the
  above change; if still overflowing, consider shrinking `fontSize` for that
  column specifically, or truncating the id (e.g. last 8 chars only, matching
  what the receipt dialog already shows) rather than relying on wrap/hide.

## Known limitations (not bugs — real gaps, not wiring defects)

- **Superadmin Activity Log has no UI for 4 of the 7 filter params the
  backend already supports.** `store_id`, `user_id`, `date_from`, `date_to`
  are real, working query params (`AdminController::activityLogs`,
  `useAdminActivityLogs()`), but `app/admin/activity/page.tsx` only wires up
  `page`/`search`/`action`. A superadmin can't filter the platform-wide log
  to one store, one user, or a date range except via the free-text search
  box (which only matches description/action/user name-email columns).
- **Superadmin Stores: the same "Status" label means two different things
  depending which screen shows it.** The Store Fleet list / View Store
  Details dialog show the real `stores.status` account-state column
  (Active/Suspended). The Overview dashboard's "Recent Stores" widget
  computes its own "Status" from sync recency instead (last sync < 60min →
  Active, < 1440min → Away, else Inactive) — an unrelated signal rendered
  with an identical-looking badge. A store that's account-`Active` but has
  gone quiet on sync (or vice versa) reads as contradictory depending which
  screen you're looking at.

## Deferred work (not bugs — explicit scope decisions)

- **`SyncController::push()`/`pull()` were not structurally refactored.** Both are large (push() ~730 lines) and every special case is backed by a real, documented production incident (see the method's own doc comments and `git log -S` on individual fixes). Judged too risky to mechanically extract without first having comprehensive characterization tests — those tests were added instead (`SyncEndpointTest.php`, `SyncPullMappingTest.php`, `SyncValidationTest.php`), and the structural refactor itself was deferred.
- **`AuthController` (~895 lines) was not split by sub-domain**, unlike `AdminController`/`AdminService`. It's security-critical (login/session/token issuance); splitting risks subtly changing how middleware/guards apply per route for a pure-reorganization change with no functional upside. Left as a single file.
- **`client/lib/db/core.ts`'s `backfillStoreIdOnLegacyRows()` and `relaxPurchaseOrdersSupplierIdNullable()` are still active**, not yet retired the way older schema-repair migrations were (`renameLegacyTablesAndColumns`, `dropLegacyVendorIdColumn`, etc. — see the comments above `SYNC_COLUMN_MIGRATIONS` in `core.ts`). They *could* eventually follow the same removal pattern once every currently-active account is confirmed to have a local DB created after each migration's ship date (`backfillStoreIdOnLegacyRows`: 2026-08-14; `relaxPurchaseOrdersSupplierIdNullable`: 2026-08-29) — checked via `diagnoseLegacySchema()`-style inspection of each device's real local file, not via the admin dashboard (subscription-start dates shown there aren't a reliable proxy for local DB creation date). As of this check, several active accounts predate both ship dates, so neither is removable yet.
