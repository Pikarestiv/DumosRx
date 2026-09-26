# AGENTS.md: DumosRx Laravel Server

This file exists so any AI (or human) picking up this repo cold can get
oriented quickly. Keep it updated when architecture, conventions, or the
current focus of work change — see `client/AGENTS.md` and `web/AGENTS.md`
for the sibling packages' versions of this same file and the same
maintenance expectation. A stale doc here is worse than no doc: fix it in
the same change that makes it wrong, don't defer it. The standing rule for
that — including moving a fixed finding from `docs/KNOWN_BUGS.md` into
`docs/FIXED_BUGS.md` in the same change — lives in `.agents/AGENTS.md` §2.

## What this is

Laravel 11 (PHP ^8.2) API backing two separate frontends: **`client/`** (the
offline-first Tauri/Next.js POS app, synced via a bidirectional delta sync
engine) and **`web/`** (marketing site, store-owner dashboard stubs, and the
platform admin panel). Auth is Sanctum personal access tokens throughout —
no session-based web auth for the API itself.

Repo relationship: this is one of three sibling packages. `client/`'s
`scripts/verify-schema-sync.ts` diffs its local SQLite schema against this
repo's MySQL schema and expects `../laravel-server` to be checked out as a
sibling directory — don't rename or relocate this repo relative to `client/`
without updating that.

## Architecture

- **Controllers vs. Services:** Controllers (`app/Http/Controllers/Api/`)
  are routing/HTTP only; business logic belongs in `app/Services/`
  (`SubscriptionService`, `AdminAlertService`, `Payment/`, `Web/`). Don't
  let a controller grow business logic just because it's convenient —
  that's the one architectural rule `tests/Feature/ArchitectureTest.php`
  exists to keep honest (currently only asserts core tables exist; the
  Controller/Service separation itself is enforced by review, not a test).
- **Controller namespaces** roughly mirror caller: `Api/App/*` (client/,
  the POS sync+business endpoints), `Api/Web/*` (web/'s dashboard-adjacent
  endpoints), `Api/Admin/*` (platform admin panel), `Api/Public/*`
  (unauthenticated storefront).
- **Multi-tenancy — read this before adding any tenant-scoped endpoint:**
  tenant-owned data (products, categories, suppliers, customers, stock,
  sales, ...) is always stored under the **store owner's** `user_id`, never
  a staff member's own id. A staff user has `store_id` set; resolving which
  tenant they belong to means looking up `Store::where('id',
  $user->store_id)->value('user_id')`, not using `$user->id` directly. Use
  the `App\Http\Controllers\Concerns\ScopesToTenant` trait
  (`tenantOwnerId($request)`) — don't hand-roll this lookup. Before this
  trait existed, `ProductController`/`CategoryController`/
  `SupplierController`/`CustomerController` had no tenant scoping at all
  (any authenticated user could see every store's data) or scoped by the
  wrong id for staff accounts; see `tests/Feature/TenantIsolationTest.php`
  for the regression coverage and exact failure shape.
  **Service classes are the trait's blind spot.** `ScopesToTenant` takes a
  `Request`, so classes under `app/Services/` can't use it and hand-roll the
  same lookup instead — `Web/DashboardService` and `Api/App/SaleController`
  both repeat it across several methods, which is exactly how one copy drifts.
  `DashboardService::resetData()` (the destructive `POST /dashboard/reset`)
  scoped every delete by `$user->id` directly until 2026-09-26: harmless for a
  `store_owner` (their own id *is* the tenant owner id) but a silent zero-row
  no-op returning `{"status":"success"}` for the real, assignable non-owner
  `admin` staff role the controller's gate also admits. It now goes through a
  private `tenantOwnerId($user)` mirroring the trait; regression coverage in
  `tests/Feature/DashboardResetScopingTest.php`. Note the other three methods
  in that file (`getSummary`/`getStats`/`getWidgetSnapshot`) still resolve by
  `$user->id` — read-only and lower-stakes, so deliberately not changed in
  that pass, but they are the same latent shape. `TenantScopingArchitectureTest`
  only scans controllers, so nothing catches this class of drift in a service
  mechanically: extract the resolution into one shared helper rather than
  adding a fourth inline copy.
- **Roles & permissions (`User::hasRole()`/`hasPermission()`, `app/Models/User.php`):**
  `hasRole($role)` checks three things, any of which can match: the flat
  `role` string column, the `userRole` relation's `slug` (a `Role` model,
  separate from the `role` column), and a special-case alias where
  `role === 'store_owner'` also satisfies `hasRole('admin')`. `super_admin`
  bypasses `CheckPermission` and `CheckSubscription` middleware entirely.
  `hasPermission($slug)` checks two independent sources: the user's own
  direct `permissions()` (belongsToMany `Permission`), then falls back to
  permissions granted through `userRole`. Checked via the `permission:<name>`
  middleware alias (`CheckPermission.php`) for finer-grained gates
  (`create_accounts`, `grant_trials`, etc. for `platform_admin`/`agent`).
  Account-level gating (`is_active`, subscription status) is separate:
  `account_status` (`CheckAccountStatus`) and `subscription:<feature>`
  (`CheckSubscription`) middleware.
- **Plans/tiers:** `config/plans.php` defines tier limits (`stores`,
  `staff`, `inventories`) and feature flags per tier (`starter`, `pro`,
  ...); `-1` means unlimited. `SubscriptionService` enforces these
  (`enforceStaffLimits`, `getSubscriptionOwner`).

## Admin auth architecture (redesigned 2026-08-26)

`web/`'s platform admin panel keeps its access token in JS memory only
(never `localStorage`) and uses a separate, `refresh`-ability-scoped
Sanctum token — held **only** in an `HttpOnly`, `SameSite=Strict`
`drx_admin_session` cookie — to silently re-establish a session after a
page reload, via `POST /admin/session/refresh`
(`AuthController::refreshAdminSession()`, registered outside the
`auth:sanctum` group in `routes/api.php` since it has no bearer token to
check). This only applies when `login()`'s `device_name === 'web'`.

**Do not resurrect the old `AuthenticateFromCookie` middleware pattern.**
It used to be globally prepended to the `api` middleware group
(`bootstrap/app.php`) and silently promoted *any* ambient
`drx_admin_session` cookie into an `Authorization: Bearer` header for every
API route — combined with the cookie's old `SameSite=None`, that was a real
CSRF-shaped hole (a cross-origin page could trigger authenticated admin
requests with no token exfiltration needed). It's been deleted. If a future
feature seems to need "read auth off a cookie for a general route," that's
a sign to reach for a dedicated endpoint like `refreshAdminSession()`
instead — validate the cookie's token ability explicitly, don't promote it
into a blanket bearer credential.

`client/`'s desktop app uses a **completely separate**, unrelated,
bearer-token-based `/refresh` (`AuthController::refresh()`, unchanged,
still behind `auth:sanctum`) — don't conflate the two flows or assume a
change to one affects the other. Full detail (including the
impersonation/handoff subsystem, which is separate again) is in
`web/AGENTS.md`.

## Sync engine (server side)

`app/Http/Controllers/Api/App/SyncController.php` (~1000 lines — the
delta push/pull endpoint `client/`'s sync engine talks to) and
`app/Services/Web/SyncPayloadMapper.php`. See `tests/Feature/SyncEndpointTest.php`
for the expected push/pull contract. Any new syncable table/column needs a
migration here **and** the corresponding update on the `client/` side
(`client/lib/db/schema.ts` + sync engine coverage) — see `.agents/AGENTS.md`
§4 and `client/AGENTS.md` for the client-side half of this.

- **Table-name mismatches:** the client's sync table name doesn't always
  match the real MySQL table — check `getModelForTable()` in
  `SyncController.php` first. E.g. client `audit_logs` → server model
  `ActivityLog` → real table `activity_logs`. Add any new column to
  `activity_logs`, not a nonexistent `audit_logs` table.
- **`tests/Feature/SyncSchemaParityTest.php`** parses `client/lib/db/schema.ts`'s
  raw `CREATE TABLE` SQL via regex to assert every column the server's
  `getModelForTable()` claims to sync actually exists server-side. It does
  **not** strip SQL comments — a `--` comment line inside a `CREATE TABLE
  (...)` block in `schema.ts` gets parsed as a bogus column and fails this
  test. Don't add inline `--` comments inside `schema.ts`'s CREATE TABLE
  bodies; put explanatory comments in `schema-migrations.ts`'s ALTER-TABLE
  array instead (real JS, `//` comments are fine there).
- **A synced column added only on one side is a live production incident,
  not just a lint failure — and this has now recurred three separate
  times in the same week (2026-09-23):** `activity_logs.correlation_id`,
  `stock_movements.movement_type`'s incomplete `ENUM`, and (same day,
  later batch) `sales.markup_type` +
  `stores.staff_can_request_transfers`/`markup_sales_enabled` all shipped
  client-side and got caught — the first two live in production sync
  errors, the third by a `/code-review high` pass before it ever shipped.
  **Treat "does this new synced column have a matching Laravel migration
  in the same change?" as a mandatory checklist item for any PR that
  touches `client/lib/db/schema.ts`, not something to catch on review.**
  A device that writes to a client-only column fails every subsequent
  sync push for that row with `Unknown column` (stays queued locally,
  retrying forever, never reaching the server). Always add BOTH the
  client schema/migration AND a matching Laravel migration in the same
  change; the most recent example migrations to copy the idempotent
  `Schema::hasColumn(...)` guard pattern from are
  `2026_09_23_000006_add_markup_type_to_sales.php` and
  `2026_09_23_000007_add_staff_transfer_and_markup_toggles_to_stores.php`
  (or search `database/migrations/` for "Server-side counterpart to the
  client's" more generally).
  **Note on `$fillable`:** `SyncController::push()` writes every incoming
  row via `$model->forceFill($payload)`, which bypasses `$fillable`
  entirely — so a missing `$fillable` entry is *not* what breaks sync (a
  missing DB column is). Add the `$fillable`/`$casts` entry anyway,
  immediately, in the same change: other mass-assignment paths in this
  codebase (e.g. web-dashboard controllers using `fill()`/`create()`) do
  respect it, and a column that's `forceFill`-writable but not
  `$fillable` is a silent trap for the next person who writes a normal
  Eloquent update against the same model.
- **Server-authoritative columns need an explicit push-side strip, not just
  a `$fillable` exclusion** (same reason as the `forceFill` note above).
  `normalizePushPayload()` holds the per-table strip lists:
  `USER_SYNC_FORBIDDEN_FIELDS`/`sanitizeUserSyncPayload()` for `users`,
  `STORE_SYNC_FORBIDDEN_FIELDS` for `stores` (every `paystack_*` column —
  settlement destination and the fee-dirty flag), and `stock_batches.quantity`
  inline in `push()`. `authorizeChangeTarget()` admits **any** caller whose
  allowed stores include the row — staff, not just the owner — so a money-
  routing column riding the generic push is a settlement-redirect hole, not a
  theoretical one. Anything only a dedicated endpoint or a console command may
  set belongs in one of those lists in the same change that adds it.
  Coverage: `tests/Feature/SyncStoresPaystackFieldGuardTest.php`.
- **A MySQL `ENUM` column for a client-controlled string field is a
  recurring footgun, not a one-off bug:** `stock_movements.movement_type`
  was created as an `ENUM` back in 2024 that never actually matched every
  value the client sends (`transfer_out`/`transfer_in` were never in the
  list) — every stock transfer silently failed to sync from day one until
  caught and fixed 2026-09-23 (converted to `VARCHAR`). If a client column
  is free-form (no fixed, server-enforced set of values), don't constrain
  it with a server-side `ENUM` — the two lists *will* drift.

## Known gotcha: MySQL timezone vs. Laravel's UTC clock

See `.agents/AGENTS.md` §6 for the full writeup (Namecheap shared hosting's
MySQL runs `time_zone = SYSTEM`, ~4h behind UTC; raw `NOW()`/
`CURRENT_TIMESTAMP()` in SQL silently breaks the sync engine's
`updated_at`-based pull filter). Short version: never use MySQL's own
`NOW()` in raw SQL against this database — let Eloquent set timestamps.

## Model boot() hooks for cross-cutting, debounced side effects

`app/Models/Store.php`'s `boot()` (added 2026-09-23) is the pattern to
follow for "something must happen whenever a column changes, regardless of
which endpoint/sync path changed it": a `static::saving()` closure can
silently revert just one dirty attribute back to its original value
(without failing the whole save — other legitimately-changed fields in the
same request/sync push still persist) to enforce a business rule like a
cooldown; a `static::saved()` closure can stamp a "dirty" bookkeeping flag
via a **raw `DB::table(...)->update(...)`, not another `$model->save()`**
(a second `save()` would re-fire these same boot events). A scheduled
command (`App\Console\Commands\RebuildStorefrontIfDirty`, `routes/console.php`)
then debounces the actual expensive side effect (a GitHub Actions
`repository_dispatch` triggering a full site rebuild) by batching however
many rows went dirty since its last run into one action, instead of firing
per-change. `store_slug_changed_at`/`storefront_dirty_at` are deliberately
**not** in `$fillable` — they're server-only bookkeeping columns, set only
by these hooks, never accepted from a client sync payload (client mirrors
them in its own schema only so pull sync's dynamic column list doesn't
break on an unknown column — see `client/AGENTS.md`).

**The pipeline as it stands after 2026-09-26's storefront remediation**
(`docs/STOREFRONT_REVIEW.md`, SF-P2-2/SF-P2-3 — read that file before
extending or relying on any of this):

- **What dirties a storefront.** `Store::boot()`'s `saved()` hook fires on
  `Store::STOREFRONT_PUBLISHED_FIELDS` (`online_store_enabled`, `store_slug`,
  `name`, `logo_url`, `phone`, `email`, `address`, `location` — i.e. exactly
  what the public page renders) and on a `status` → `suspended` transition.
  `Product::booted()` mirrors it for the other half of what a customer sees:
  `created` when `show_online`, `updated` on
  `name`/`selling_price`/`show_online`/`is_active`, and `deleted` when
  `show_online`. Keep those two field lists in step with
  `web/app/store/[store_slug]/page.tsx` and `StorefrontProductResource` — a
  column the page renders but neither list names is a silently-stale page.
  Both write via raw `DB::table()->update()`, never `->save()`, and
  `Product`'s is narrowed to stores with `online_store_enabled` so a bulk
  product sync writes nothing for the accounts that publish no storefront.
- **The stamp is always refreshed, not only set when null.** That is
  load-bearing, not sloppiness: the confirmation callback below clears flags
  stamped at or before the dispatch moment, so a change landing mid-build has
  to move the timestamp past that cutoff or it would be cleared without ever
  shipping.
- **Flags are cleared on deploy *success*, not on dispatch acceptance.**
  `repository_dispatch` returns 204 as soon as GitHub queues the event, so the
  old clear-on-204 lost the pending rebuild permanently whenever a build
  failed. `deploy-web.yml` now calls back
  `POST /internal/storefront/rebuild-complete`
  (`Api/Internal/StorefrontRebuildController`) after a successful FTP sync,
  authenticated by an `X-Storefront-Rebuild-Token` header matched with
  `hash_equals` against `config('dumos.storefront.rebuild_token')` — the
  inbound counterpart to `config/dumos.php`'s outbound GitHub token, and a
  dedicated endpoint with an explicit header check rather than anything
  ambient (see the admin-auth section above on why this app never promotes an
  ambient credential). The dispatch timestamp lives in `SystemConfig` under
  `storefront_rebuild_requested_at` specifically to avoid adding a synced
  column to a table `client/` mirrors.
- **`STOREFRONT_REBUILD_TOKEN` unset ⇒ the old clear-on-dispatch behaviour.**
  Deliberate, so the API `.env` and the GitHub Actions secret can be set in
  either order without a window where every scheduled run fires another full
  rebuild. **Both sides need setting for the confirmation loop to engage at
  all.** While a rebuild is outstanding and unconfirmed the command refuses to
  dispatch another until
  `dumos.storefront.rebuild_confirmation_timeout` (default 45 min) has passed.
- **Coverage:** `tests/Feature/StorefrontRebuildPipelineTest.php` (15 tests,
  `Http::fake()`) is the file to extend for anything in this area.

Note also that the storefront's online-payment flow (`initializeCheckout`/
`StorefrontPaymentIntent`) was wired up end-to-end 2026-09-26 (SF-P1-2) via
per-store Paystack subaccounts — see the dedicated section below for the
onboarding flow, fee semantics, propagation cadence, and the refund decision.
Full design: `docs/superpowers/specs/2026-09-26-storefront-paystack-subaccounts-design.md`.

## Storefront online payment: Paystack subaccounts

Each store that wants to take real money on its storefront gets its own
Paystack **subaccount**, created programmatically from the owner's own bank
details — the owner never sees Paystack directly, and DumosRx never holds
customer money in its own account (the alternative, platform-collects-then-
payouts, was rejected: it needs a ledger, KYC and payout reconciliation, a
much bigger project). A storefront checkout charge is split automatically at
the point of payment by Paystack itself, so the store's share settles
straight to their own bank account.

- **Onboarding flow** (`PaystackSubaccountService`, store-owner endpoints on
  `Api/Web/StorePaymentAccountController`): `GET /store/payment-banks?country=` wraps Paystack's
  bank-list endpoint — **note this isn't universally available across
  Paystack's six supported countries**; it's documented for Nigeria, Ghana,
  Kenya and South Africa, not confirmed for Rwanda or Côte d'Ivoire, and
  returns `[]` rather than throwing when Paystack has nothing, which the
  client is expected to render as a plain bank-name text field rather than a
  dropdown. `POST /store/payment-account/resolve` wraps Paystack's
  resolve-account endpoint, which is Nigeria/Ghana-only (`RESOLVE_COUNTRIES`);
  it returns `null` (not a fabricated guess) everywhere else, and that's a
  normal outcome, not an error — never logged as a failure. It also reports
  `verifiable`, and that distinction is load-bearing: **`confirmed_unverifiable`
  is accepted only for a country outside `RESOLVE_COUNTRIES`.** Inside it, a
  null resolution means the account details are wrong, so the override is
  refused with a 422 rather than letting a typo'd Nigerian account through the
  escape hatch built for Rwanda/Côte d'Ivoire/Kenya/South Africa.
  `POST /store/payment-account` calls
  `createSubaccount()` and persists only the subaccount code, country, bank
  code, and the **masked last 4 digits** of the account number — the full
  number is never stored beyond what the create call needs in flight. This
  endpoint is idempotent (409 once a store already has a subaccount, no
  Paystack call made) and re-resolves the account server-side even though
  the client already called `/resolve` — never trust a client-sent
  confirmation of someone else's bank details alone.
- **`percentage_charge` is the platform's cut, not the store's** — a real,
  easy-to-get-backwards fact worth stating plainly. `createSubaccount()`
  passes the current `storefront_platform_fee_percentage` (a `SystemConfig`
  float, one global rate for every store) as `percentage_charge`; Paystack
  takes that percentage for DumosRx and settles the rest to the store.
- **Fee-rate propagation.** A superadmin edits the rate via
  `SystemConfigController`; that same request stamps `paystack_fee_dirty_at`
  on every store with a connected subaccount. `App\Console\Commands\
  SyncSubaccountFeeRates`, registered in `routes/console.php` at the same
  cadence as `RebuildStorefrontIfDirty`, calls `updateSubaccountFee()` for
  each dirty store, clears the flag on success, and leaves it dirty (retried
  next run) on failure — escalating to `AdminAlertService::send()` after
  repeated consecutive failures for the same store, the same escalation path
  the sync engine already uses, not a second alerting mechanism.
- **Currency is per-store, never the global `payment.currency`.** A
  storefront charge is minted, stamped on the `StorefrontPaymentIntent`, and
  verified against **`stores.currency`** (`StorefrontController::
  storeCurrency()`, the single source for all three). `config('payment.
  currency')` is only a fallback for a store row with no currency at all —
  using it as the expected value at verify time (as the first cut did) makes
  every non-NGN store charge successfully and then fail verification, taking
  the customer's money with no order to refund against. Same per-record shape
  as `PaymentController::processSuccessfulPayment()`'s subscription webhook,
  which compares against `payment_transactions.currency`. Covered by
  `test_a_non_ngn_store_completes_the_initialize_to_verify_round_trip` and
  `StorefrontPaystackLifecycleTest` (a KES store, end to end).
- **A paid-but-unfulfillable confirm refunds itself.** `checkout()` prices the
  cart and re-checks availability *after* the customer has already paid at
  Paystack (nothing is reserved at initialize time — availability is only
  netted against pending orders). If stock has gone or a product was
  deactivated during that detour, `refundUnfulfillableCheckout()` verifies the
  payment really succeeded, refunds it, marks the intent `refunded`, and
  returns a 422 carrying `refunded` so the storefront can say so — never a
  bare stock error on a charged customer. It returns null (caller falls
  through to its own error) when there is nothing paid to refund, so an
  unpaid/failed reference is never refunded and its intent stays `pending`
  for a retry.
- **Refunds are real, but not clawed back from the store.**
  `OnlineOrderController`'s cancel-a-paid-order path now calls
  `PaymentService::refundTransaction()` (which delegates to
  `PaystackSubaccountService::refundTransaction()`), falling back to the
  original log-and-notify-the-store behaviour only if that provider call
  itself fails. **Accepted, deliberate cost:** Paystack's own refund
  behaviour on a split transaction draws the refund from DumosRx's main
  balance once the subaccount side has settled (typically within a day or
  two), not automatically clawed back from the store. This was confirmed
  with the user as an accepted v1 cost of running the platform rather than
  something to build a Transfer/Transfer-Recipient claw-back for now —
  revisit only if refund volume ever makes automating it worth the extra
  integration surface. A **successful** refund also moves the order's own
  `payment_status` to `'refunded'` (added to the `online_orders` enum by
  `2026_09_26_000003`); a **failed** one deliberately leaves it `'paid'`,
  because the money is still owed and the flag-and-notify path is what makes
  that reconcilable. Anything summing paid online orders as revenue must
  therefore treat `'refunded'` as not-revenue rather than assuming three
  values.

**Carbon 3 gotcha:** `diffInMonths()` (and the other `diffIn*` methods)
return a **signed** value (`$other - $this`) in Carbon 3, unlike Carbon 2's
absolute-value default. `now()->diffInMonths($pastDate) < N` is always
true (permanently negative) — this exact bug shipped and was caught before
merge in the slug-cooldown check above. Prefer `now()->lt($date->addMonths(N))`
style comparisons over `diffIn*() < N` to sidestep the sign question
entirely.

## Public storefront endpoints

`Api/Public/StorefrontController` is the only unauthenticated tenant-data
surface in the app. Three things about it are easy to undo by accident:

- **Every route carries its own named limiter.** Laravel 11 dropped
  `throttle:api` from the default `api` group and `bootstrap/app.php`
  deliberately does not call `throttleApi()` (a platform-wide floor would
  change every other route as a side effect), so a new public storefront route
  with no `throttle:` group is completely unmetered. Current groups:
  `storefront-read` (120/min/IP, both GETs), `storefront-order` (5/min/IP,
  order placement), `storefront-checkout` (15/min/IP, the Paystack initialize
  step). `tests/Feature/StorefrontThrottleTest.php` asserts all four routes and
  deliberately does **not** disable `ThrottleRequests` — `StorefrontControllerTest`
  does, which is exactly why this gap was invisible for so long, so add
  limiter coverage there, not here.
- **`storefront-read` is generous on purpose.** The static-export build pulls
  the slug list plus every storefront from one GitHub runner IP in a single
  pass, about two requests per store. 120/min leaves headroom for roughly 50
  live storefronts; past that, raise it or give the build pipeline a token
  before deploys start 429ing.
- **Catalog and stock are scoped by `store_id`, not just the owner's
  `user_id`.** Multi-store is a supported, plan-gated state and one owner's two
  storefronts are separate shops. `storeProducts(Store)` is the single helper
  both `show()` and `priceCart()` use; it tolerates legacy `store_id IS NULL`
  rows from before the 2026-08-14 backfill. `availableQuantity()` scopes the
  `StockBatch` sum the same way **and** subtracts everything already committed
  to `pending` online orders — online orders don't deduct stock at placement
  (POS staff do, on fulfilment), so without that subtraction the last unit
  sells to everyone who asks. `checkout()` re-runs the check inside its
  transaction after a per-store `lockForUpdate()`, which is what makes it hold
  under REPEATABLE READ.

`OnlineOrderController::markFulfilled` is the other half of that lifecycle:
only a `pending` order can transition (409 otherwise, so the client's retry is
safe), and `payment_status` is only promoted to `paid` when the caller passes
`payment_confirmed: true`. The POS client writes its local sale and stock
deductions **inside one transaction, before** calling this endpoint — don't
re-invert that ordering; see `docs/FIXED_BUGS.md` (SF-P2-5) for what the old
order cost.

## Outbound third-party API calls

Convention: `Illuminate\Support\Facades\Http::withToken(...)`, never a raw
`curl`/`GuzzleHttp` client — see `AdminPlatformService::getRecentErrors()`
(Sentry) or `RebuildStorefrontIfDirty` (GitHub) for the pattern (short
`->timeout()`, try/catch, log-and-continue on failure rather than throwing).
Credentials go in `config/dumos.php` (a project-specific config file, this
app doesn't use `config/services.php`) reading from `.env` via `env()` —
never call `env()` directly outside a config file. There is **no confirmed
queue-worker process running in production** (no `queue:work` in any
schedule/cron, no Horizon, no supervisor config — `QUEUE_CONNECTION=database`
is set but nothing has been confirmed to drain the `jobs` table on the
shared host): don't dispatch a `ShouldQueue` job for something that must
actually run — do it synchronously (fast, timeout-guarded) or via
`routes/console.php`'s `Schedule::command(...)`, which the OS cron does
reliably run.

**Mail is always `Mail::to(...)->send(...)`, never `->queue(...)`** — a
direct consequence of the constraint above, stated as its own rule because a
`->queue()` call fails *silently*: nothing checks a return value, nothing
inspects the `jobs` table, and the caller still reports success. The last two
`->queue()` call sites were converted on 2026-09-26:
`AdminAlertService::send()` (the sync engine's own superadmin
failure-escalation path — the mechanism meant to surface *other* silent
failures) and `Api/Admin/MailController::send()` (the admin broadcast-email
feature, which additionally returned "Emails have been queued for sending"
unconditionally). The mailables still `implement ShouldQueue` — harmless, and
left in place for a future real worker — so that interface's presence is
**not** a signal that queueing is safe here. Copy the `->send()` pattern from
`RegistersAccounts`/`RecoversPasswords`/`SendEndOfDaySummaries` for any new
mail path.

## Testing

```
php artisan test                            # 447 tests as of 2026-09-26 (Paystack subaccount plan, incl. its final-review fixes) — treat any drop as a regression
php -l path/to/File.php                     # quick syntax check for a single file
```

`tests/Feature/` covers: tenant isolation (`TenantIsolationTest`), admin
account-security regressions (`AccountSecurityTest`), the handoff/
impersonation flow (`AuthHandoffTest`), sync push/pull (`SyncEndpointTest`),
storefront (`StorefrontControllerTest`, plus `StorefrontThrottleTest` and
`StorefrontRebuildPipelineTest`), backups (`BackupControllerTest`),
dashboard stats, and core-tables-exist smoke checks (`ArchitectureTest`).
There is no `tests/Unit` suite currently — everything meaningful here
touches the DB, so it's covered as a Feature test instead.

## Running things

```
php artisan serve       # local dev server
php artisan migrate     # apply migrations — LOCAL DEV DB ONLY, see below
php artisan tinker      # also used by client/'s test:schema script
```

**Production has no SSH/direct `artisan` access.** The shared host is
reached only through the app itself: migrations run via a protected route,
`GET https://<production-domain>/migrate-db?key=<MIGRATE_DB_KEY>`
(`routes/web.php`, guarded by `config('app.migrate_db_key')` /
`MIGRATE_DB_KEY` env — 403s without the correct key). This means **new
migrations do nothing on production until (a) this branch is deployed and
(b) someone hits that route** — always verify pending migrations first
with `php artisan migrate --pretend` against local, and flag to the user
that production still needs the deploy+route step; don't assume "I wrote
the migration" means "it's live."
