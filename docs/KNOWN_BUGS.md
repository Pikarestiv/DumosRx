# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet, tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings.

## Open items

### Sync engine can wedge permanently on `Statement closed` after heavy back-to-back local write activity (reproduced, recovered by reload)

- **Where:** `client/lib/db/sync-engine/index.ts` (`sync()`, error logged at
  line ~143) surfaces a sql.js/`better-sqlite3`-style `Statement closed`
  error; the underlying statement lifecycle is in
  `client/lib/db/core.ts`'s `query()`, which does `db.prepare(sql)` →
  `stmt.bind()` → a `while (stmt.step())` loop that **yields to the event
  loop via `setTimeout(resolve, 0)` every 200 rows when not inside a
  `transaction()`** (explicit, deliberate, and commented — added so a large
  read doesn't block painting). The same comment block acknowledges "sql.js
  has one shared connection, no per-caller isolation."
- **Reproduced:** after two back-to-back bulk operations on a ~1900-row
  catalog (a full CSV import, then a corrective re-import with the
  "update stock for existing products" audit path, run in quick
  succession — see the sibling product-import bug entries above, all found
  in the same session), the sync engine started throwing `Sync failed:
  "Statement closed"` on every subsequent attempt and the "N Changes
  Unsynced" counter stopped decreasing entirely (stuck, not just slow) —
  visible both in a console error surfaced through Next.js's dev error
  overlay and in `[CRASH LOGGER] Capturing error: Statement closed` from
  `error-logger.ts`.
- **Hypothesis (strong, not confirmed with instrumentation):** a `query()`
  call outside a transaction yields mid-`stmt.step()` loop; if another
  concurrent operation runs during that yield window and touches the same
  shared sql.js connection, the original `stmt` handle is invalidated. The
  next `stmt.step()` after resuming then throws `Statement closed`, and
  because this specific failure isn't handled as retryable, the sync loop
  appears to give up rather than recover on its own. **Ruled out:**
  `sync()` itself already guards against re-entrancy correctly (a
  module-level `isSyncInProgress` flag, set/reset in a `try`/`finally`, so
  a second overlapping `sync()` call returns an early "Sync already in
  progress" instead of racing) — confirmed by reading `index.ts` directly,
  so this is NOT two overlapping `sync()` calls. A concrete, real trigger
  for *a* `sync()` call worth noting: `components/auth/license-guard.tsx`'s
  `performCheck()` effect calls `sync(true)` any time
  `storeProfile?.status`/`suspension_reason`/`subscription_tier` changes —
  and a sync's own pull can update those same fields on `stores`, so a
  sync completing can re-trigger another `performCheck` → `sync(true)`
  shortly after. That path is still safely serialized by the
  `isSyncInProgress` guard, so it's not the double-entry itself, but it is
  a plausible source of the *frequent* sync calls whose write-side
  activity (`pushChanges`/`pullChanges`, presumably running inside
  `transaction()`) could still overlap with some *other*, unguarded
  non-transactional `query()` call elsewhere in the app (e.g. an ordinary
  page's data fetch) landing in that yield window. The precise other
  caller wasn't identified — would need instrumentation (logging every
  `query()` call's SQL + a monotonic counter, or breaking on
  `Statement closed` in devtools) to catch the actual second party
  mid-collision rather than inferring it after the fact.
- **Recovery:** a full page reload (not just SPA navigation — confirmed a
  same-tab `navigate` to the same URL was NOT sufficient on its own the
  first time; a subsequent one did clear it) reliably un-wedged it —
  temporarily: the unsynced count resumed counting down for roughly a
  minute each time before hitting `Statement closed` again and re-wedging,
  requiring another reload. This points at in-memory state (a stale
  statement/closure) recreated fresh each reload, not corrupted persisted
  data: the IndexedDB-backed local DB blob was intact and growing correctly
  throughout, and each reload's fresh module state recovered forward
  progress without any data fix-up — it just doesn't survive the same
  triggering condition recurring under a still-large backlog.
- **Effect:** a user who does several large operations in quick succession
  (a big import, a stock recount, etc.) can end up with sync silently and
  permanently stuck — the "N Changes Unsynced" action-center item never
  clears, other devices/the server never see the latest local changes,
  and there's no in-app indication that a reload (rather than "just wait")
  is what's needed to recover.
- **Fix scope (not implemented):** needs actual concurrency control, not
  just a bigger try/catch — e.g. a mutex/lock so only one `sync()` (or one
  `transaction()`/non-transactional `query()`) can hold the sql.js
  connection at a time, and/or catching `Statement closed` specifically to
  retry the operation once against a freshly-`prepare()`d statement instead
  of surfacing it as a terminal failure. Would need deliberate concurrent
  load (two overlapping large operations, reproduced on purpose rather than
  incidentally) to verify a fix actually closes the window instead of just
  narrowing it.

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

### Client "Someone else" / new-account login navigation shows a stale authenticated screen instead of the sign-in form (reproduced)

- **Where:** the PIN lock screen's "Back" → "Welcome Back" profile picker →
  "Someone else" tile, which client-side-navigates to `/login?mode=new`
  (client app, not the superadmin panel — a different codepath from the
  `store-context.tsx` issue above, but the same *symptom class*: a route
  change that doesn't actually swap the rendered screen).
- **Reproduced:** while locked as "Pika" (Store Owner) on
  `/settings/security`, clicking Back → "Someone else" changed the URL bar
  to `/login?mode=new` but kept rendering the authenticated Security
  Settings page underneath — not the "Sign In" username/PIN form. A full
  page reload (`navigate` to the same URL) then rendered the correct Sign
  In form immediately, confirming the route/data are correct and this is a
  client-side transition bug, not a routing or auth bug.
- **Effect:** a cashier/staff member trying to sign in on a device already
  unlocked as another user sees the previous user's settings page instead
  of a login form after tapping "Someone else" — has to manually reload to
  proceed. Once reloaded, the rest of the flow (username/PIN entry,
  `Authorize Entry`, landing on the correct role-scoped dashboard) worked
  correctly in this test.
- **Fix scope (not implemented):** identify what differs between this
  client-side navigation and a full reload for this route — likely the
  same family of issue as the store-switch entry above (a query/router
  state invalidation that doesn't force a remount of the page tree for an
  auth-state transition). Investigate whether the lock-screen's navigation
  call needs a hard `window.location` navigation (like other auth
  transitions in this app appear to use) instead of the router's
  client-side push for this specific transition.

### Superadmin "My Referrals": saving your own unchanged referral code always fails as "already taken"

- **Where:** `web/app/admin/referrals/page.tsx`'s `handleSave` calls
  `checkReferralCode(trimmed)` with no second argument.
  `checkReferralCode(code, userId?)`'s backend endpoint explicitly supports
  passing the current user's id to exclude their own existing code from the
  collision check (per the endpoint's own doc comment: "exclude this user's
  own current code... i.e. re-saving your own code as-is"), but the frontend
  call site never passes it.
- **Effect:** any save that doesn't change the code (or changes only
  casing/whitespace, which normalizes back to the same value) collides with
  the user's own row and is rejected as taken. The only way to successfully
  use this feature at all is to change to a code that's never been used by
  this account before.
- **Fix scope (not implemented):** pass the current user's id through, e.g.
  `checkReferralCode(trimmed, user?.id)` in `handleSave`.

### Superadmin Settings → Integrations: "Disable Widget" always 422s — a Smartsupp key can be set but never cleared through the UI

- **Where:** `SystemConfigController::update()` validates `'value' =>
  'required'`. Laravel's `required` rule fails on an empty string. The
  Integrations tab's `handleClear` sends `value: ""` to unset the key —
  the only one of the 5 mutable Platform Settings tabs whose "clear"
  affordance tries to save an empty string (the others clear via a boolean
  `false` or an empty array, both of which pass `required` fine).
- **Effect:** once a Smartsupp key is ever set through this UI, there is no
  working path back to "Disabled" through the app — manually clearing the
  input and re-saving hits the identical 422.
- **Fix scope (not implemented):** relax the backend validation for this key
  (e.g. `'value' => 'present'`), or have the frontend send an explicit
  sentinel the backend treats as "clear this key" instead of an empty string
  through the generic "set a value" contract.

### Superadmin Settings → Billing & Plans: the tier limits/features UI schema doesn't match what's actually stored — risk of data pollution on save

- **Where:** `plan-tier-card.tsx` (and the `TierLimits`/`TierFeatures` types
  in `lib/types/admin.ts`) hardcode a `sync_interval` limit field and an
  18-item feature-toggle list, but the real stored `subscription_plans`
  config has no `sync_interval` key at all (the real third limit field is
  `inventories`), and its real `features` object uses keys
  (`basic_inventory`, `mobile_access`, `theme_customizer`, `store_url`) that
  don't appear anywhere in the UI's toggle list — while several toggles the
  UI *does* show (`mobile_app`, `ecommerce`, `smart_pos`, `broadcast_create`,
  `custom_branding`, `barcode_generation`, `loyalty_program`) don't exist in
  the real config and aren't read by any backend gating code.
- **Effect if ever saved:** every tier's blank "Sync Interval" input would
  write a garbage `sync_interval: NaN` into the real stored config
  (permanently polluting the schema), and the real, currently-enforced
  `theme_customizer` gate (plus the other 3 real feature flags) would remain
  completely unmanageable through this UI even after a save, since no
  control for them exists.
- **Status:** found by inspection only — the Save button was deliberately
  never clicked once this was noticed. Fix scope (not implemented):
  reconcile `TierLimits`/`TierFeatures` and `plan-tier-card.tsx`'s hardcoded
  field/toggle lists against `laravel-server/config/plans.php` and
  `SystemConfigSeeder.php` (both confirmed to use the real field names),
  treating one schema as canonical.

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

### Superadmin Handoff/callback: a successful login can still render a false "Missing handoff code" error (dev-only, React Strict Mode)

- **Where:** `client/app/auth/callback/page.tsx` (and structurally identical
  code in `web/app/admin/handoff/page.tsx`) strips `code`/`return_code` from
  the URL via `window.history.replaceState()` before the async token
  exchange, then runs the exchange in a mount-once (`[]`-dependency) effect.
  Under React Strict Mode's dev-only double-invoke of effects, a second run
  of the same effect can read the already-stripped URL and render "Missing
  handoff code" over top of a login that already succeeded in the
  background.
- **Effect:** confusing dev-environment noise (a real user/admin sees a
  scary "your link expired" screen despite being correctly logged in
  underneath it) — not a security issue, and Strict Mode's double-invoke is
  disabled in production builds, so this shouldn't reach real end users.
- **Status:** not fixed — reproduced on the forward leg
  (`auth/callback`); the return leg (`admin/handoff`) is structurally
  identical but wasn't independently reproduced (its own live test failed on
  an unrelated 60s code-TTL expiry first).

### Product Catalog page briefly (and genuinely) shows "No products found" after a large sync (reproduced)

- **Where:** `client/components/products/product-database.tsx`'s
  `getProductsWithDetails()` query (rendered through
  `catalog-list.tsx`/`catalog-list-states.tsx`, which already has a
  dedicated loading skeleton specifically to avoid flashing the "empty
  catalog" state during a normal load — see that file's own comment).
- **Reproduced:** immediately after importing ~1900 products (see the
  sibling entries above about that import's own bugs) and while the
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
- **Superadmin Communications → User Feedback has no pagination UI**
  despite a real, correctly-paginated backend (`Feedback::paginate(50)`).
  With ~2,900 real pending tickets on the production-mirrored dev backend,
  only the newest 50 are ever reachable through this page.
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
