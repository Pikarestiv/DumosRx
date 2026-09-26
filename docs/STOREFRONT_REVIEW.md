# DumosRx Storefront — Audit & Feature Review

- **Date:** 2026-09-26
- **Reviewer scope:** the public, customer-facing storefront only — the surface the
  whole-monorepo audit in `docs/KNOWN_BUGS.md` explicitly excluded.
- **Verification run (audit pass):** `./vendor/bin/phpunit --testsuite=Feature --filter=Storefront`
  (29 tests / 102 assertions, all passing) and `npx tsc --noEmit` in `web/` (clean).
  No build artifacts left behind; `git status` in `web/` clean afterwards.
  The audit itself was documentation-only — no application code, config, migration or
  test was changed by it.

---

## Remediation status — 2026-09-26 (same day as the audit)

**All 16 of the bug findings are closed.** Each one's fix, what it deliberately
left out, and how it was verified is written up in `docs/FIXED_BUGS.md` under
"Storefront pass". The findings below are kept verbatim as the record of what was
wrong and why it mattered; each now carries a **Status** line.

| | Findings |
|---|---|
| **Fixed** | SF-P0-1, SF-P1-1, SF-P1-2, SF-P1-3, SF-P2-1, SF-P2-2, SF-P2-3, SF-P2-4, SF-P2-5, SF-P2-6, SF-P3-1, SF-P3-2, SF-P3-4, SF-P3-6 |
| **Fixed in part** | SF-P3-3 (the API-side cap; the base64 logo and product images still need a storage decision) |
| **Accepted, not fixed** | SF-P3-5 (a product call, as this review itself framed it) |

**SF-P1-2 was deferred at first, then fixed the same day — see
`docs/superpowers/specs/2026-09-26-storefront-paystack-subaccounts-design.md`.**
Wiring up the Paystack UI flow was held back for its own round because enabling
real online payment collection raised a real business question: whose money is
it, and how does DumosRx get paid? That design answers it (direct-to-store
Paystack subaccounts, DumosRx never holds customer money) and the resulting
13-commit implementation wires the flow up end-to-end — `checkout-form.tsx` now
offers a `paystack` radio, calls `/checkout/initialize`, and confirms the order
automatically on return from Paystack.

**Both things this review flagged as needing to land with it did:**

1. **A real provider refund call** (SF-P2-4's remaining half). `PaymentService`
   now has `refundTransaction()`; cancelling an already-paid order calls it and
   falls back to the old log-and-notify behaviour only if the provider call
   itself fails.
2. **A confirmation page with an order number** (feature #2) — **still not
   built.** The server returns the created order and the client still throws
   it away; this remains an open follow-up, not a blocker for SF-P1-2.

**One ops action is outstanding** from SF-P2-3's fix: the rebuild-confirmation loop
only engages once `STOREFRONT_REBUILD_TOKEN` is set *both* in the API's production
`.env` and as a `STOREFRONT_REBUILD_TOKEN` GitHub Actions secret. Until then the
command keeps its old clear-on-dispatch behaviour deliberately, so the two sides can
be configured in either order.

**Two feature items from the list below also shipped:** #12 (per-store
`generateMetadata` on both routes, plus a generated `sitemap.xml`/`robots.txt`) and
#7 (`show_online` in the CSV/XLSX importer and exporter, plus a bulk show/hide
action on the catalog toolbar).

---

## Scope & Architecture

### What was reviewed

| Layer | Files |
|---|---|
| Public pages | `web/app/store/[store_slug]/page.tsx`, `web/app/store/[store_slug]/checkout/page.tsx` |
| Storefront UI | `web/components/storefront/{product-card,storefront-cart,checkout-form}.tsx` |
| Cart state | `web/lib/store/use-cart-store.ts`, `web/lib/types/storefront.ts`, `web/lib/api/storefront-slugs.ts`, `web/lib/api/base-client.ts` |
| Public API | `laravel-server/app/Http/Controllers/Api/Public/StorefrontController.php`, `app/Http/Resources/StorefrontProductResource.php`, `routes/api.php:76-87`, `app/Providers/AppServiceProvider.php:57-64`, `bootstrap/app.php` |
| Order lifecycle | `app/Models/{OnlineOrder,OnlineOrderItem,StorefrontPaymentIntent}.php`, `app/Http/Controllers/Api/OnlineOrderController.php`, `client/lib/hooks/use-fulfill-online-order-mutation.ts`, `client/components/pos/online-orders-modal.tsx` |
| Rebuild pipeline | `app/Models/Store.php:90-151`, `app/Console/Commands/RebuildStorefrontIfDirty.php`, `routes/console.php:12`, `.github/workflows/deploy-web.yml`, `web/next.config.ts` |
| Owner-side config | `client/components/settings/store/store-profile-section.tsx`, `client/hooks/use-settings.ts:219-250`, `app/Http/Controllers/Api/Web/StoreController.php::checkSlug` |
| Tests | `laravel-server/tests/Feature/StorefrontControllerTest.php` (778 lines, 29 tests) |

### How the storefront actually works

1. **It is a static export, not a live page.** `web/next.config.ts` sets
   `output: "export"`. `generateStaticParams` calls `getStorefrontSlugs()` →
   `GET /storefront-slugs`, and each slug's page fetches `GET /storefront/<slug>`
   **at build time**. The resulting HTML (store name, logo, every product and its
   price) is baked into files FTP-synced to `dumosrx.com/store/<slug>/`. The
   `next: { revalidate: 60 }` option on that fetch is inert under `output: "export"`
   — nothing revalidates; the page is frozen until the next full site rebuild.
2. **Rebuilds are debounced, not reactive.** `Store::boot()`'s `saved()` hook stamps
   `storefront_dirty_at` **only** when `online_store_enabled` or `store_slug` changed
   (`app/Models/Store.php:144-150`). `RebuildStorefrontIfDirty` runs every 15 minutes
   (`routes/console.php:12`), and if any store is dirty fires one GitHub
   `repository_dispatch` (`storefront-changed`) that triggers `deploy-web.yml` → full
   `npm run build` → FTP sync of `web/out/`. Nothing else in the system ever marks the
   storefront dirty.
3. **Ordering is server-priced.** The browser posts only `{product_id, quantity}` +
   customer contact details to `POST /storefront/<slug>/checkout`. `priceCart()`
   re-derives every price from the catalog, re-applies `is_active`/`show_online`, and
   checks stock. For `payment_method: paystack` there is a two-step flow
   (`/checkout/initialize` mints a `StorefrontPaymentIntent` bound to store + cart
   fingerprint; `/checkout` requires that exact unconsumed reference). Orders are
   created `order_status: pending` — **stock is not deducted at order time**; it is
   deducted in the POS client when staff press "Fulfill & Deduct Stock".
4. **Entitlement is re-checked per request.** `storefrontEnabled()` verifies both the
   `online_store_enabled` flag and the owner's live `store_url` plan feature, so a
   downgraded account's API goes dark even though its flag stays `1`.

### Excluded

`node_modules/`, build output, the marketing site's own pages, the `web/` admin panel
and store-owner dashboard, and every area already covered by `docs/KNOWN_BUGS.md` /
`docs/FIXED_BUGS.md` / `docs/DATABASE_CONCURRENCY.md`. Subscription payment
webhooks were read only to the extent storefront orders share their pipeline (they
do share the *reference namespace* — see the cross-consumption guard at
`StorefrontController.php:409-412` — but not the webhook handler).

---

## Bug Findings

**Counts:** 1 P0, 3 P1, 6 P2, 6 P3.

### P0 — Critical

#### SF-P0-1. A transient `/storefront-slugs` failure during any `web/` deploy silently deletes every live storefront from production
- **Severity:** P0
- **Category:** Reliability / Availability — confirmed
- **Location:** `web/lib/api/storefront-slugs.ts:20-23`, `web/app/store/[store_slug]/page.tsx:36-38`, `.github/workflows/deploy-web.yml:57-72`
- **Problem:** `getStorefrontSlugs()` swallows every failure (non-200, non-JSON,
  network throw) and returns `[{ store_slug: "demo" }]`. `generateStaticParams`
  therefore emits exactly one page, `npm run build` **exits 0**, and
  `FTP-Deploy-Action` syncs `web/out/` over `/dumosrx.com/` — a sync, which removes
  server files no longer present locally. Every real `/store/<slug>/` directory is
  deleted from production. The next successful rebuild restores them, but nothing
  triggers one: `storefront_dirty_at` is only set by a store toggling its slug or its
  online flag, so a platform with no such change simply stays dark until someone
  pushes to `web/**` or runs `workflow_dispatch`.
- **Why it matters:** This is the storefront's total-loss failure mode, and it is
  reached by a 30-second API blip or a 500 during a completely unrelated `web/` deploy
  (a landing-page copy change). Every paying store's public URL 404s, indefinitely,
  with a green checkmark on the workflow run and no alert anywhere. The paid
  `store_url` feature is the thing being deleted.
- **Evidence:** the fallback is unconditional and documented as deliberate ("a valid
  dynamic route needs at least one entry"). `web/AGENTS.md:113-128` independently
  documents that this route family fails *silently with exit 0* — the `params`-as-Promise
  regression "still exited 0 and emitted `/store/demo/index.html` as a rendered 404
  page". Same shape, larger blast radius.
- **Reproduction:** stop the API (or point `NEXT_PUBLIC_API_URL` at a host returning
  500), run `npm run build` in `web/`, inspect `web/out/store/` — only `demo/` exists.
  A deploy of that output removes every other storefront directory from the server.
- **Recommended fix:** make the build **fail loudly** rather than degrade, when the
  slug list can't be fetched *and* the target is production: e.g. throw unless an
  explicit `STOREFRONT_ALLOW_EMPTY=1` escape hatch is set (kept for offline/sandbox
  work, which is the only legitimate consumer of the `demo` fallback today). A cheap
  additional belt: a workflow step asserting `web/out/store/` contains more than one
  directory before the FTP step runs. Same treatment for the single-store case
  (SF-P1-1).
- **Confidence:** High on the mechanism; High on the FTP delete-on-sync behaviour
  (that is what `state-name`-tracked sync means in `FTP-Deploy-Action` v4).
- **Status:** **Fixed 2026-09-26.** `getStorefrontSlugs()` now throws on a fetch/parse failure (escape hatch: `STOREFRONT_ALLOW_EMPTY=1`); a genuinely empty list still falls back to `demo`. `deploy-web.yml` also runs `npm run verify:storefront-output` before the FTP sync, which re-asks the API and asserts every live slug landed on disk.

---

### P1 — High

#### SF-P1-1. A single store's build-time fetch failure replaces its storefront with a 404 page, silently
- **Severity:** P1
- **Category:** Reliability — confirmed
- **Location:** `web/app/store/[store_slug]/page.tsx:19-46`
- **Problem:** `getStorefrontData()` returns `null` on any non-OK/non-JSON response and
  the page calls `notFound()`. Under `output: "export"` that emits a rendered 404 page
  at that store's path. The build still succeeds. One store 500ing (or being
  rate-limited, or timing out) at the moment of a rebuild silently takes that store
  offline until the next rebuild.
- **Why it matters:** Same failure class as SF-P0-1 scoped to one store, and far more
  likely to actually happen: a rebuild fetches `/storefront/<slug>` once per store
  serially, so a platform with many storefronts makes many chances for one to fail.
  The store owner has no way to tell the difference between "my page is broken" and
  "my plan lapsed".
- **Evidence:** the `notFound()` call is unconditional on `!data`; the
  `!res.ok || content-type` guard was added (correctly) to stop a build-time throw,
  which converted a loud failure into a silent one.
- **Reproduction:** as SF-P0-1, but with the stub serving a valid `/storefront-slugs`
  and a 500 for one slug's `/storefront/<slug>`.
- **Recommended fix:** distinguish the two cases. A genuine 404/403 from the API
  (store gone, suspended, plan lapsed) → `notFound()` as today. A 5xx/network/
  non-JSON response → throw, failing the build, so the previous good deploy stays
  live instead of being overwritten with a 404.
- **Confidence:** High.
- **Status:** **Fixed 2026-09-26.** The per-store fetch moved to `web/lib/api/storefront-data.ts`: 404/403 → `null` → `notFound()` as before; 5xx, network failure or non-JSON throws and fails the build for that page.

#### SF-P1-2. Storefront online payment is fully built and hardened server-side but unreachable — no client can start it
- **Severity:** P1
- **Category:** Feature correctness / dead code — confirmed
- **Location:** `web/components/storefront/checkout-form.tsx:76-81` and `:186-205` vs.
  `laravel-server/app/Http/Controllers/Api/Public/StorefrontController.php:236-321`,
  `routes/api.php:84-86`
- **Problem:** `CheckoutForm`'s `payment_method` state initialises to `in_store` and
  the UI offers exactly two radio options, `in_store` and `transfer`. The string
  `paystack` appears nowhere in `web/` (verified by grep across
  `web/components/storefront/`, `web/lib/store/`, `web/app/store/`), nor does any call
  to `/checkout/initialize`. The entire two-step online-payment flow —
  `initializeCheckout()`, the `StorefrontPaymentIntent` model and table, the
  cart-fingerprint binding, the dedicated `throttle:storefront-checkout` limiter, and
  14 of the 29 storefront feature tests — is unreachable from the only client that
  exists.
- **Why it matters:** Two separate problems. (a) **Product:** a storefront that cannot
  take money is a catalog with a phone number, and every other doc in the repo
  (OpenAPI descriptions, `routes/api.php`'s comments, `AGENTS.md`) reads as though
  online payment is live — a future agent or a salesperson will believe it is.
  (b) **Engineering:** the most security-sensitive code on the public surface is
  covered only by tests, never by real traffic, so drift in it will be discovered by
  the first real customer rather than by use.
- **Evidence:** `checkout-form.tsx` posts straight to `/storefront/<slug>/checkout`
  with `...formData`; the only reachable `payment_method` values are the two radios.
  `paystack_reference` is never sent, and the checkout page never reads Paystack's
  `?reference=`/`?trxref=` callback params that `initializeCheckout()`'s
  `callback_url` (`StorefrontController.php:286`) explicitly redirects back to.
- **Reproduction:** open any storefront, add an item, go to checkout — the only
  payment choices are "Pick up & Pay" and "Bank Transfer".
- **Recommended fix:** wire the existing flow — add a third radio, call
  `/checkout/initialize`, redirect to `payment_url`, and on return read
  `?reference=`/`?trxref=` and post the confirm call with `paystack_reference`. The
  backend needs no change. If online payment is *intentionally* deferred, say so in
  `laravel-server/AGENTS.md` and in the OpenAPI descriptions rather than leaving them
  reading as live.
- **Confidence:** High (grep-exhaustive on the client side).
- **Status:** **Fixed — see `docs/superpowers/specs/2026-09-26-storefront-paystack-subaccounts-design.md`.** Wiring up the Paystack UI flow was a separate business decision, deliberately held back for its own round; that round shipped the same day, once the design above answered the underlying "whose money is it" question with per-store Paystack subaccounts. `checkout-form.tsx` now has the third radio, calls `/checkout/initialize`, redirects to `payment_url`, and reads `?reference=`/`?trxref=` on return to confirm the order automatically. See the Remediation status section above for the two things that were flagged to land with it.

#### SF-P1-3. No rate limit on the public storefront read or on order placement
- **Severity:** P1
- **Category:** Security / Abuse — confirmed
- **Location:** `laravel-server/routes/api.php:77-87`, `laravel-server/bootstrap/app.php:15-40`
- **Problem:** Only `POST /storefront/{slug}/checkout/initialize` is throttled
  (`throttle:storefront-checkout`, 15/min/IP). `GET /storefront-slugs`,
  `GET /storefront/{slug}` and — critically — `POST /storefront/{slug}/checkout` have
  **no limiter at all**. Laravel 11 removed `throttle:api` from the default `api`
  middleware group (`vendor/.../Configuration/Middleware.php:495-499` builds it from
  `$this->apiLimiter`, which is null unless `throttleApi()` is called);
  `bootstrap/app.php` never calls `throttleApi()`. So the unauthenticated
  order-placement endpoint is completely unmetered.
- **Why it matters:** `payment_method: in_store` needs nothing but a name, a phone
  string and a valid product id to create a row. Each accepted order also calls
  `Notification::bulkCreateFor()` for every user of that store
  (`StorefrontController.php:552-559`), so one script can bury a real store's
  notification bell under thousands of fake orders, and inflate `online_orders` /
  `online_order_items` / `notifications` without bound on shared hosting. The
  unthrottled `GET` additionally makes the checkout page's reprice call and any
  scraper free.
- **Evidence:** the throttle group in `routes/api.php:84-86` wraps only the
  `initialize` route; the `checkout` route at `:87` sits outside it. The test suite
  cannot catch this — `StorefrontControllerTest` explicitly
  `withoutMiddleware(ThrottleRequests::class)` (`:124`).
- **Note — this corrects a claim in `docs/KNOWN_BUGS.md`:** that file's "Areas That
  Appeared Healthy" section states "auth, session-refresh, handoff, and
  storefront-checkout endpoints all sit behind named `throttle:*` middleware groups".
  Only the *initialize* step does. Corrected in that file as part of this pass.
- **Reproduction:** `for i in $(seq 1 500); do curl -s -XPOST .../api/v1/storefront/<slug>/checkout -d '{...in_store order...}'; done` — no 429 at any point.
- **Recommended fix:** add a `storefront-order` limiter (tighter than
  `storefront-checkout`, e.g. 5/min/IP) around the `checkout` route and a generous
  `storefront-read` limiter (e.g. 60/min/IP) around the two GETs; or call
  `$middleware->throttleApi()` in `bootstrap/app.php` for a platform-wide floor and
  keep the named limiters as overrides. Add one feature test that does *not* disable
  `ThrottleRequests`, so this can't regress silently again.
- **Confidence:** High.
- **Status:** **Fixed 2026-09-26.** `throttle:storefront-order` (5/min/IP) on order placement, `throttle:storefront-read` (120/min/IP, deliberately generous for the build pipeline) on both GETs. `tests/Feature/StorefrontThrottleTest.php` does not disable `ThrottleRequests`.

---

### P2 — Medium

#### SF-P2-1. Storefront products and stock are scoped by owner, not by store — a multi-store owner's every storefront lists all their stores' products
- **Severity:** P2
- **Category:** Multi-tenancy / Correctness — confirmed
- **Location:** `StorefrontController.php:119-123` (`show`), `:158-162` and `:183` (`priceCart`)
- **Problem:** Both the catalog query and the pricing query filter
  `Product::where('user_id', $store->user_id)` — the *owner*, not the store — and the
  stock check is `StockBatch::where('product_id', ...)->sum('quantity')` with no store
  scoping at all. `products` and `stock_batches` both carry `store_id`
  (`2026_08_14_164310_add_store_id_to_domain_tables.php:9-20`,
  `2026_08_14_170031_add_store_id_to_child_domain_tables.php`) and the client treats
  them as store-scoped. Multi-store is a supported, plan-gated state
  (`StoreController::store` enforces a per-plan store limit).
- **Why it matters:** An owner with two stores gets one merged catalog on both public
  URLs. A customer at store A can order an item only store B stocks; the availability
  check passes because it sums batches across both; the order lands on store A, whose
  staff cannot fulfil it — and if online payment is ever wired up (SF-P1-2), that is a
  charged customer with no refund path (SF-P2-4). It is not a cross-*tenant* leak, so
  no isolation guard fires, but it is still one store's inventory published on another
  store's page.
- **Evidence:** `test_storefront_only_shows_its_own_stores_products`
  (`StorefrontControllerTest.php:128-138`) is named for this case but actually builds
  two different **owners** (`$this->ownerA` / `$this->ownerB`) — it tests cross-tenant
  isolation, which holds. The same-owner-two-stores case is untested.
- **Reproduction:** create one owner with stores A and B, give B a `show_online`
  product, request `GET /storefront/store-a` — B's product is listed.
- **Recommended fix:** scope both queries to the store, tolerating legacy NULLs:
  `->where(fn ($q) => $q->where('store_id', $store->id)->orWhereNull('store_id'))`,
  applied identically in `show()` and `priceCart()`, and scope the `StockBatch` sum the
  same way. Add the same-owner-two-stores test. Consider whether the legacy-NULL
  tolerance should be dropped once a backfill is confirmed.
- **Confidence:** High on the code path; Medium on how many live accounts are
  multi-store today.
- **Status:** **Fixed 2026-09-26.** One `storeProducts(Store)` helper scopes both queries by `store_id` (NULL-tolerant for pre-backfill rows); the `StockBatch` sum is scoped the same way. The same-owner-two-stores case is now tested.

#### SF-P2-2. The rebuild trigger misses almost everything a customer actually sees
- **Severity:** P2
- **Category:** Correctness / Staleness — confirmed
- **Location:** `app/Models/Store.php:144-150`, `web/app/store/[store_slug]/page.tsx:22-24`
- **Problem:** `storefront_dirty_at` is stamped only when
  `wasChanged(['online_store_enabled', 'store_slug'])`. Nothing marks the storefront
  dirty for: a price change, a new or deleted product, a `show_online` toggle, a
  `is_active` toggle, the store's own `name`/`logo_url`/`phone`/`email`/`address`,
  going to zero stock, the store being **suspended** by an admin, or the owner's
  subscription lapsing off `store_url`. Because the page is a static export, all of
  those are frozen in the published HTML until an unrelated rebuild happens.
- **Why it matters:** Three concrete consequences. (a) A customer can be shown last
  month's price; the server re-prices at checkout (`priceCart()`) and the checkout page
  re-prices on mount, so they aren't *charged* wrong — but the browse experience is
  wrong, and the reprice toast ("Some prices or items in your cart changed") reads as a
  bait-and-switch. (b) A suspended store, or one whose plan lapsed, keeps a fully
  browsable public page with its catalog and prices on it; only the *checkout* fails
  (403/404), so the customer fills a cart and then hits a dead end. (c) A store that
  renames itself or uploads a logo sees no change on its public page, possibly for
  weeks, which reads as "the feature is broken".
- **Evidence:** the `wasChanged` list is literal and exhaustive; `revalidate: 60`
  in `page.tsx:23` has no effect under `output: "export"` (see SF-P3-1).
- **Reproduction:** change a `show_online` product's `selling_price`, wait past the
  15-minute schedule, reload the public page — the old price is still there.
- **Recommended fix:** two parts. (1) Extend dirty-marking beyond `Store`: stamp the
  owning store's `storefront_dirty_at` on `Product` saves that change
  `selling_price`/`name`/`show_online`/`is_active`, on `Store` saves that change the
  public profile fields, and on `status` → `suspended`. A `Product::boot()` `saved()`
  hook mirroring `Store::boot()`'s raw-`DB::table()` pattern is the in-house idiom.
  (2) For suspension/plan lapse specifically, don't rely on the rebuild at all — the
  page is already published; either publish a small client-side liveness check on the
  storefront page, or accept the current behaviour and document it. Also worth
  scoping: a nightly unconditional rebuild as a cheap staleness ceiling.
- **Confidence:** High.
- **Status:** **Fixed 2026-09-26** (part 1 of the recommendation). `Store::boot()` now dirties on every published profile field and on `status` → `suspended`; new `Product::booted()` hooks mirror it for `name`/`selling_price`/`show_online`/`is_active`, creation and deletion. **Still open:** part 2 — the client-side liveness check for a suspended/lapsed store's already-published page, and the nightly unconditional rebuild as a staleness ceiling.

#### SF-P2-3. `storefront_dirty_at` is cleared when GitHub *accepts* the dispatch, not when the rebuild succeeds — a failed build loses the pending rebuild permanently
- **Severity:** P2
- **Category:** Reliability — confirmed
- **Location:** `app/Console/Commands/RebuildStorefrontIfDirty.php:57-73`
- **Problem:** The command clears the flags immediately after
  `POST /repos/{repo}/dispatches` returns successful. That call returns 204 as soon as
  GitHub *queues* the event; it says nothing about whether the workflow ran, the build
  compiled, or the FTP sync completed. The command's own comments are careful about
  dispatch-level failures ("flags left dirty, will retry next run") but there is no
  feedback path at all from the workflow's outcome.
- **Why it matters:** A store enables its online store, the dispatch fires, the build
  fails (a `web/` type error, an npm registry blip, an FTP timeout — or SF-P0-1/SF-P1-1
  degrading it into a wrong-but-successful build), and the flag is already gone. That
  store's page never appears, and nothing will ever try again. The owner sees a URL
  they were told is live, 404ing.
- **Evidence:** `$response->successful()` on the dispatch call is the only gate before
  the `update(['storefront_dirty_at' => null])` at `:70-73`.
- **Reproduction:** temporarily break `web/` so the build fails, toggle a store's
  `online_store_enabled`, let the scheduled command run — flag cleared, no page.
- **Recommended fix:** don't clear on dispatch. Either (a) move the flag to a
  `storefront_rebuild_requested_at` + have the workflow call back a small authenticated
  endpoint on success to clear it (fits the existing `config/dumos.php` outbound
  convention in reverse), or (b) keep the optimistic clear but add a cheap watchdog:
  re-dirty any store whose `online_store_enabled` is true and whose page is absent from
  the last successful deploy. (a) is cleaner and roughly the same amount of work.
- **Confidence:** High.
- **Status:** **Fixed 2026-09-26** via the recommendation's **option (a)**, not the watchdog fallback: `deploy-web.yml` calls back `POST /internal/storefront/rebuild-complete` on success, authenticated by a shared-secret header, and the flags survive until then. The dispatch timestamp lives in `SystemConfig`, so no new synced column was needed. **Needs the ops action noted above to engage.**

#### SF-P2-4. No stock reservation between order placement and fulfilment — concurrent oversell, and no refund path once online payment is wired
- **Severity:** P2
- **Category:** Correctness / Race — confirmed
- **Location:** `StorefrontController.php:172-199` (`priceCart`'s availability-only check), `client/lib/hooks/use-fulfill-online-order-mutation.ts`
- **Problem:** `priceCart()` checks `sum(quantity) >= requestedQty` and deducts
  nothing; the code comment states this deliberately ("online orders start 'pending'
  and stock is deducted when staff fulfil them"). Two customers ordering the last unit
  within the same second both pass the check and both get a 201. There is no reserved/
  committed quantity concept anywhere in the schema.
- **Why it matters:** Today, with only `in_store`/`transfer` methods live (SF-P1-2),
  this degrades to "staff apologise to the second customer" — annoying, survivable.
  The moment the Paystack flow is wired up it becomes "the second customer paid for
  goods that don't exist", and there is **no refund or cancel-with-refund path**:
  `OnlineOrderController::markFulfilled` accepts `cancelled` but does nothing to the
  payment, and `PaymentService` exposes no refund call from this flow. That is a
  money-handling gap, not a UX one, so it should be closed *before* SF-P1-2 ships, not
  after.
- **Evidence:** no `lockForUpdate`, no reservation table, no `reserved_quantity`
  column on `stock_batches`; `markFulfilled`'s `cancelled` branch
  (`OnlineOrderController.php:110-117`) touches only `order_status`.
- **Reproduction:** with one unit in stock, fire two concurrent
  `POST /storefront/<slug>/checkout` requests for quantity 1 — both return 201.
- **Recommended fix:** the cheap version is to make the availability check
  stock-minus-outstanding-pending-orders rather than raw stock, inside a transaction —
  it doesn't reserve, but it stops the common double-sell. The correct version is a
  short-lived reservation (a row per pending order line, expiring on cancel/timeout)
  that `priceCart()` subtracts. Either way, pair it with a refund path on the
  `cancelled` branch before Paystack goes live.
- **Confidence:** High on the race; High on the missing refund path.
- **Status:** **Fixed 2026-09-26.** The oversell race is closed by the recommendation's cheap version: availability is stock minus everything committed to `pending` orders, re-checked inside the order-creating transaction under a per-store `lockForUpdate()`. **The refund half, originally flagged rather than implemented, was completed the same day as SF-P1-2**: `PaymentService::refundTransaction()` now calls Paystack's refund API for an already-paid cancellation, falling back to the original log-and-notify behaviour only if that provider call itself fails.

#### SF-P2-5. Fulfilling an online order is a non-atomic two-phase write — a local failure leaves the order un-refulfillable, unrecorded and stock undeducted
- **Severity:** P2
- **Category:** Data integrity — confirmed
- **Location:** `client/lib/hooks/use-fulfill-online-order-mutation.ts:16-22` and `:31-83`, `client/components/pos/online-orders-modal.tsx:112-128`
- **Problem:** The mutation does `await apiClient.fulfillOnlineOrder(order.id)` (server
  marks `order_status: fulfilled`, `payment_status: paid`) and **then** writes the
  local `sales` row and per-item stock deductions. If anything in step 2 throws — a
  SQLite write failure, the writer-tab lock, the app being killed mid-loop, or a
  `recordSaleItemStock` error on one of several items — the user sees "Failed to
  fulfill order", but the server already considers the order fulfilled. The modal only
  renders the Fulfill button for `order_status === 'pending'`
  (`online-orders-modal.tsx:113`), so the order disappears from the actionable list.
  There is no retry, no compensating server-side rollback, and no record that it
  happened.
- **Why it matters:** The outcome is a delivered order with no sale recorded (revenue
  missing from every report) and stock never deducted (inventory permanently
  overstated, which then cascades into reorder decisions and the storefront's own
  availability check). It is silent and unrecoverable through the UI. The per-item loop
  makes partial completion possible too: items 1-2 deducted, item 3 throws.
- **Evidence:** the two awaits are sequential with no transaction spanning them and no
  `onError` compensation; `handleFulfill`'s `onError` only toasts.
- **Reproduction:** force `insert("sales", ...)` to throw (e.g. run the fulfilment in a
  non-writer tab), press Fulfill — error toast, then reopen the modal: the order shows
  `FULFILLED` with no Fulfill button and no local sale.
- **Recommended fix:** invert the order and make the server leg idempotent. Write the
  local sale + stock deduction inside a single `transaction()` **first**, then call the
  server; on server failure the local write is already queued in `_sync_queue` and will
  push. Alternatively keep the current order but wrap step 2 in `transaction()` and, on
  failure, call a new server endpoint (or re-`markFulfilled` with `pending`) to revert —
  and make `markFulfilled` reject a non-`pending` order so a retry is safe. The first
  option is less new surface.
- **Confidence:** High.
- **Status:** **Fixed 2026-09-26** via the recommendation's preferred inversion: the local sale and every stock deduction now run in one `transaction()` *before* the server call, and `markFulfilled` rejects a non-`pending` transition (409) so the retry is safe.

#### SF-P2-6. An owner-fulfilled online order writes `sales.store_id = NULL`, so its revenue vanishes from every store-scoped report
- **Severity:** P2
- **Category:** Data integrity / Reporting — confirmed
- **Location:** `client/components/pos/online-orders-modal.tsx:52`, `client/lib/db/base-helpers.ts:174-176`, `client/lib/context/auth-context.tsx:400` and `:635`
- **Problem:** The modal passes `storeId: user?.store_id` into the mutation, which sets
  `store_id` on the `sales` insert. `insert()` auto-scopes to the active store **only
  when `data.store_id === undefined`**. For a store **owner**, `users.store_id` is
  deliberately always NULL — this is documented at length in
  `OnlineOrderController.php:17-28` ("gating on `$user->store_id` directly... always
  failed with 'No store associated' for an owner, who is exactly who this endpoint is
  for") — and the auth context copies it through verbatim (`store_id: dbUser.store_id`
  at `:400`, `store_id: apiUser.store_id` at `:635`). So `data.store_id` is `null`, not
  `undefined`, the auto-scope branch is skipped, and the sale row is written with a NULL
  `store_id`.
- **Why it matters:** Every store-scoped read in the client is
  `... ${storeId ? " AND store_id = ?" : ""}` (dozens of sites across
  `client/lib/db/queries/{sales,finance,reports}.ts`), and `getActiveStoreId()` *is* set
  for an owner (store-context promotes `storeProfile.id`). So a NULL-`store_id` sale is
  excluded from daily close, revenue, COGS, BI and dashboard figures. The
  owner-operated single-store case is the *default* deployment, and the money is real:
  fulfilled online orders simply don't appear in the store's numbers. Exactly the
  failure shape `Store::sales()`'s own doc comment (`app/Models/Store.php:158-172`)
  warns about.
- **Evidence:** `insert()`'s guard is a strict `=== undefined` check
  (`base-helpers.ts:174`); `StaffCreatePayload`'s own doc comment
  (`client/lib/types/user.ts:27-31`) documents the sibling trap — an empty-string
  `store_id` "matches neither `store_id = ?` nor the `store_id IS NULL` fallback".
- **Reproduction:** log in as the store owner (not staff), fulfil an online order,
  then query `SELECT store_id FROM sales WHERE transaction_number LIKE 'ONL-%'` — NULL.
  That order's total is absent from the day's revenue.
- **Recommended fix:** in `online-orders-modal.tsx`, pass the active store id rather
  than the user's: `storeId: user?.store_id ?? storeProfile?.id` (the component already
  has `storeProfile` from `useStore()`). Separately, harden `insert()` to treat `null`
  like `undefined` for the auto-scope branch (`data.store_id == null`) — that closes the
  whole class rather than this one caller. Both, ideally.
- **Confidence:** High on the mechanism (`null !== undefined` and the documented
  owner-NULL convention); the one-line repro above confirms it definitively.
- **Status:** **Fixed 2026-09-26**, both halves as recommended: the modal passes `user?.store_id ?? storeProfile?.id`, and `insert()`'s auto-scope guard is now `data.store_id == null`, closing the whole class.

---

### P3 — Low

#### SF-P3-1. `revalidate: 60` on the storefront fetch is inert under `output: "export"`, and its comment claims caching that doesn't exist
- **Severity:** P3
- **Category:** Correctness / misleading code — confirmed
- **Location:** `web/app/store/[store_slug]/page.tsx:22-24`
- **Problem:** `fetch(..., { next: { revalidate: 60 } })` with the comment
  `// Cache for 60 seconds`. `web/next.config.ts` sets `output: "export"`; there is no
  server, so nothing revalidates — the fetch happens once, at build time, and the result
  is frozen into HTML until the next full rebuild.
- **Why it matters:** It reads as "the storefront is at most 60 seconds stale", which is
  the exact opposite of the truth (SF-P2-2: potentially weeks stale) and would lead a
  future agent to dismiss the staleness problem as already handled.
- **Recommended fix:** delete the option and the comment; the architectural reality
  belongs in `web/AGENTS.md`'s storefront section, per `.agents/AGENTS.md` §3.
- **Confidence:** High.
- **Status:** **Fixed 2026-09-26.** Option and comment deleted; the architectural reality lives in `web/AGENTS.md`'s storefront section.

#### SF-P3-2. `OnlineOrderController::index()` returns every order the store has ever received, unpaginated
- **Severity:** P3
- **Category:** Performance — confirmed
- **Location:** `app/Http/Controllers/Api/OnlineOrderController.php:62-72`
- **Problem:** `OnlineOrder::with('items.product')->where('store_id', $storeId)->orderBy('created_at','desc')->get()` — no limit, no cursor, with items and products eager-loaded. `online-orders-modal.tsx` renders every returned row.
- **Why it matters:** Directly violates `.agents/AGENTS.md` §8 ("Always use pagination,
  limit offsets, or cursor-based scrolling to limit page results to 50 items"). It is
  harmless at launch volumes and becomes a slow endpoint plus a UI-thrashing modal for a
  store a year in — and it is the same endpoint an unthrottled order-spam attack
  (SF-P1-3) would inflate.
- **Recommended fix:** paginate (or `->limit(50)` with a status filter — pending orders
  are the actionable set; fulfilled/cancelled history could move behind a separate
  paginated view).
- **Confidence:** High.
- **Status:** **Fixed 2026-09-26.** Bounded to 50 newest-first with a `has_more` flag and an optional `?status=` filter; the response keeps its `orders` key so no client change was needed. A deeper paginated history view is still a follow-up.

#### SF-P3-3. Page weight: up to 1 MB of base64 logo inlined per storefront page, an unbounded product grid, and no product images at all
- **Severity:** P3
- **Category:** Performance — confirmed
- **Location:** `web/app/store/[store_slug]/page.tsx:56-63`, `app/Services/Web/SyncPayloadMapper.php:15`, `StorefrontController.php:119-123`, `app/Http/Resources/StorefrontProductResource.php`
- **Problem:** Three separate things compound. (a) `store.logo_url` is a base64 data URI
  in a `LONGTEXT` column capped at `MAX_LOGO_BYTES = 1 MiB`; it is rendered straight
  into `<img src>` on a prerendered page, so it lands in the HTML **and** again in the
  RSC flight payload — up to ~2 MB before any product renders. (b) `show()` returns
  every `show_online` product with no limit and the page maps all of them into
  `ProductCard`s with no pagination or virtualisation, so a pharmacy with a few thousand
  listed SKUs ships a multi-megabyte document. (c) There are no product images at all —
  `StorefrontProductResource` exposes none — which is the one thing that would justify
  the weight.
- **Why it matters:** The stated audience (per the POS `AGENTS.md` files) is low-end
  devices on unreliable internet; storefront *visitors* are the same population on the
  same networks, and this is the first impression of the store. It also violates
  `.agents/AGENTS.md` §8's pagination rule on the API side.
- **Recommended fix:** cap and paginate `show()` (and add search/filter client-side over
  a bounded set — see Feature Completeness). For the logo, publish it as a real file
  during the build rather than inlining the data URI, or cap the storefront's copy far
  below 1 MiB and downscale. Product images need a storage decision first (see Feature
  Completeness) — don't add them as data URIs.
- **Confidence:** High on the mechanism; Medium on real-world catalog sizes.
- **Status:** **Fixed in part 2026-09-26.** `show()` caps at `MAX_STOREFRONT_PRODUCTS = 300`, ordered by name — high enough that no existing storefront is truncated. **Still open:** the base64 logo's weight and the absent product images, both of which need the storage decision in feature #6 first, and true pagination with a client-side UI (feature #4).

#### SF-P3-4. `store_slug` format is enforced only client-side
- **Severity:** P3
- **Category:** Robustness — confirmed
- **Location:** `client/hooks/use-settings.ts:219-234`, `app/Http/Controllers/Api/Web/StoreController.php::checkSlug`, `app/Services/Web/SyncPayloadMapper.php`, `app/Models/Store.php:107-136`
- **Problem:** The client slugifies by round-tripping through `checkStoreSlug` and using
  the returned `result.slug`. Server-side, `checkSlug` is a read-only availability probe
  — it slugifies its *input* for comparison but doesn't gate the write. The actual write
  arrives via the sync engine's `stores` push, where `SyncPayloadMapper` has no
  `store_slug` rule and `Store::boot()`'s `saving()` hook only enforces the 6-month
  cooldown. Any string that fits the column is accepted; the unique index is the only
  real constraint.
- **Why it matters:** A slug containing `/`, whitespace or path traversal would flow
  into `generateStaticParams` and become a static-export output path. Low likelihood
  (the only writer today is the client, which slugifies) but the whole point of
  `Store::boot()`'s cooldown backstop was "the client UI already does this; this is the
  server-side backstop against a stale UI or a direct API call" — the format rule has no
  such backstop.
- **Recommended fix:** slugify (or validate `regex:/^[a-z0-9-]+$/` + length) in
  `Store::boot()`'s `saving()` hook next to the cooldown check, so it applies to every
  write path including sync.
- **Confidence:** High on the gap; Low on likelihood of exploitation.
- **Status:** **Fixed 2026-09-26.** `Store::boot()`'s `saving()` hook slugifies (`Str::slug`, 100-char cap) next to the cooldown check, reverting to the previous slug when nothing usable remains — so it applies to every write path including sync.

#### SF-P3-5. `GET /storefront-slugs` publicly enumerates every DumosRx customer running an online store
- **Severity:** P3
- **Category:** Privacy / Information disclosure — confirmed, likely acceptable
- **Location:** `StorefrontController.php:50-89`, `routes/api.php:77`
- **Problem:** An unauthenticated caller gets the complete list of slugs, i.e. the
  platform's customer list for that feature, and can then pull each store's name,
  address, phone, email and full price list from `/storefront/<slug>`.
- **Why it matters:** Mostly commercial rather than technical: it hands a competitor a
  ready-made prospect list with contact details and pricing. The individual storefronts
  are public by design; the *index* is the incremental disclosure, and it exists only
  because the static build needs it.
- **Recommended fix:** require a shared secret / build token on `/storefront-slugs`
  (the workflow already injects secrets, so this is a header plus a config value) and
  leave `/storefront/<slug>` public. Accept and document otherwise.
- **Confidence:** High on the disclosure; this is a product call, not a defect.
- **Status:** **Accepted 2026-09-26, not fixed**, as this finding itself framed it ("a product call, not a defect"). A build token would mean a missing or rotated secret fails every `web/` deploy — a worse failure mode than the disclosure, introduced into the exact pipeline SF-P0-1 was about. Revisit alongside any decision to authenticate the build pipeline generally.

#### SF-P3-6. `markFulfilled` marks a never-paid transfer order as paid, and can be re-run on an already-fulfilled order
- **Severity:** P3
- **Category:** Correctness — confirmed
- **Location:** `app/Http/Controllers/Api/OnlineOrderController.php:100-127`
- **Problem:** Two small things. (a) `if ($validated['status'] === 'fulfilled') { $order->payment_status = 'paid'; }` unconditionally — including for a `transfer` order where no transfer was ever confirmed, and for `in_store` where payment is collected at handover. That's defensible as "fulfilling implies money changed hands" but it is recorded as a payment fact with no evidence. (b) There is no state guard: the endpoint will happily re-fulfil an already-`fulfilled` order, or fulfil a `cancelled` one. The POS UI hides the button, so this is only reachable via the API — but it is also what makes SF-P2-5's retry unsafe.
- **Why it matters:** (a) makes `payment_status` unreliable for reconciliation; (b) is a
  prerequisite for fixing SF-P2-5 properly.
- **Recommended fix:** reject a transition out of anything other than `pending` (409/422),
  and leave `payment_status` alone for `transfer`/`in_store` unless the caller explicitly
  confirms payment. The `cancelled` branch should also not silently leave
  `payment_status: paid` on a Paystack order (see SF-P2-4's refund point).
- **Confidence:** High.
- **Status:** **Fixed 2026-09-26** with SF-P2-5. A non-`pending` order now gets a 409, and `payment_status` is only promoted to `paid` when the caller passes `payment_confirmed: true` (the POS does, at the counter). Cancelling an already-paid order raises the refund flag described under SF-P2-4.

---

## Feature Completeness

### Solid / already well-built — don't touch these

- **Server-side pricing is airtight.** The client submits only `product_id` + `quantity`;
  `priceCart()` re-derives every price and subtotal from the catalog, re-applies
  `is_active`/`show_online`, and is shared *verbatim* between `initializeCheckout()` and
  `checkout()` so the amount a reference is minted for can't diverge from the amount an
  order is created for. Price and quantity tampering are both closed.
- **The Paystack reference-binding design is genuinely good.** A reference must have
  been minted by this app, for this store, for a cart whose canonical fingerprint
  matches, still unconsumed, and then verified against Paystack for
  status + currency + amount — with the reservation consumed under `lockForUpdate()`
  inside the same transaction that creates the order, plus a unique-index backstop and a
  cross-check against `payment_transactions` so a subscription payment can't be replayed
  as free goods (and vice versa). The reasoning is written down at each step. 14 of the
  29 tests cover this, and it's now live traffic, not just tested code (SF-P1-2).
- **`StorefrontProductResource`'s field whitelist** and the accompanying
  `test_show_does_not_leak_internal_product_columns` regression test. Ownership columns,
  `markup_percentage`, sync bookkeeping and clinical fields are all held back, with a
  test that fails if `cost_price` ever returns.
- **Entitlement re-checking.** `storefrontEnabled()` refuses to trust the
  `online_store_enabled` flag alone and re-verifies the owner's live `store_url` feature;
  `slugs()` does the same in a single batched query rather than N+1 per store. Both are
  tested.
- **Cart partitioning per storefront** (`use-cart-store.ts`), including a deliberate v1→v2
  migration that *drops* the old global cart rather than mis-attributing it to whichever
  store the customer opens next. The prior bug is documented in the file.
- **Reprice-on-mount at checkout** with an explicit "we couldn't confirm current prices"
  amber note on failure, and a toast when items or prices changed. This is a thoughtful
  partial mitigation for the staleness the static-export model creates.
- **Server error hygiene on a public endpoint:** provider response bodies are logged, not
  returned; `base-client.ts` promotes the server's `message` onto the axios error so the
  customer sees "Insufficient stock for Paracetamol" rather than a status code.
- **Test coverage is the strongest part of this surface** — 29 feature tests covering
  suspension, plan lapse, deactivated/hidden products, oversell rejection, cross-store
  references, soft-deleted orders, currency mismatch, underpayment, and owner+staff
  notification. Keep this bar for anything added.

### Missing or underbuilt

Ordered roughly by impact on a real store.

1. ~~**Online payment in the UI.**~~ **Shipped 2026-09-26** — see SF-P1-2's Status line
   and `docs/superpowers/specs/2026-09-26-storefront-paystack-subaccounts-design.md`.
   Turned out not to be UI-only: money-flow required designing per-store Paystack
   subaccounts first, which is why this was deferred rather than done same-day with
   the rest of the pass.
2. **No order confirmation of any kind.** On success `checkout-form.tsx:118-120` shows a
   toast and pushes back to the store page. The customer gets **no order number** (the
   server returns `order` with its id — it's thrown away), no confirmation page, no email,
   no SMS. Nothing to quote when they call the store. `customer_email` isn't even collected
   on the `in_store`/`transfer` paths (only `initializeCheckout` asks for it). **Effort:
   small-medium. A confirmation page + showing the returned order id is a UI gap; email
   needs a mailable — and note `laravel-server/AGENTS.md`'s hard rule: `Mail::to()->send()`,
   never `->queue()`, because there is no confirmed queue worker.**
3. **No order tracking for the customer.** `order_status` moves `pending → fulfilled/cancelled`
   server-side and the customer can never see it. There is no public order-status endpoint
   and no page. **Effort: medium. Needs a new public endpoint with a non-guessable lookup
   key (don't expose order UUIDs against a phone number alone) plus a page; the data model
   already has everything.**
4. **No product discovery at all.** No search box, no category filter (categories *are*
   returned and rendered as badges), no sort, no pagination. Every listed product is one
   flat grid. For anything past ~50 SKUs the page is unusable, and it's also SF-P3-3's
   performance problem. **Effort: small for client-side search/category filter over the
   already-loaded set; medium if it needs server-side pagination (which SF-P3-3 argues for
   anyway).**
5. **No stock or sold-out indication.** `StorefrontProductResource` exposes no stock
   signal, so every product looks available. A customer can add an out-of-stock item, get
   all the way to "Place Order", and receive a 422 "Insufficient stock for X". **Effort:
   small-medium. Add a coarse boolean (`in_stock`, or a banded `low_stock`) to the resource
   — deliberately *not* an exact count, which is competitively sensitive and would be stale
   anyway (SF-P2-2) — and render a Sold Out state that disables Add to Cart.**
6. **No product images.** The single biggest conversion factor for a retail storefront, and
   the schema has no product image column at all. **Effort: large — needs a storage
   decision (the `logo_url`-as-data-URI precedent should *not* be repeated), a schema
   column, sync coverage per `.agents/AGENTS.md` §5, a client upload UI, and build-time
   publishing.** Worth scoping deliberately rather than bolting on.
7. **Onboarding cliff: `show_online` defaults to 0 with no bulk way to change it.**
   `products.show_online` defaults false; the only toggle is a per-product switch in
   `add-product-dialog.tsx`; and the CSV/XLSX importer
   (`client/lib/utils/product-import-export.ts`) doesn't handle the column at all
   (verified by grep). A store that imports 800 products and enables its online store gets
   an **empty storefront** and must open 800 dialogs. **Effort: small — an importer column
   plus a bulk action on the products table. High impact per unit of work; this silently
   defeats the paid feature at the exact moment a new customer tries it.**
   **✅ Shipped 2026-09-26:** `show_online` in the importer (with the header aliases and
   `Yes/No/true/1/online` spellings owners actually type; an unrecognised value leaves the
   product alone rather than guessing) and in the exporter as `Yes`/`No`, so
   export → edit → re-import is itself the bulk path. Plus a "Show online / Hide online"
   dropdown on the catalog toolbar, acting on the currently-filtered set the same way
   Export does, behind an `AlertDialog` and hidden unless the store has
   `online_store_enabled`. No row-checkbox selection was invented — the products table has
   no such pattern and the filtered-set convention already existed.
8. **No owner-side view of storefront orders outside the POS app.** Online orders are
   visible only in `client/`'s POS modal (`online-orders-modal.tsx`); grepping `web/`
   found no `OnlineOrder` surface at all. An owner away from the till can't see or act on
   orders. **Effort: medium — the endpoint exists and is already tenant-scoped; this is a
   `web/` dashboard page.** Would also benefit from SF-P3-2's pagination first.
9. **Delivery vs. pickup is implied, not modelled.** The form has an address field labelled
   "(Optional for Pickup)" and payment options named "Pick up & Pay" / "Bank Transfer" —
   conflating fulfilment method with payment method. There is no explicit delivery/pickup
   choice, no delivery fee, no delivery-area check, no minimum order value, and no order
   notes field. `total_amount` has no line for any of it. **Effort: medium — needs schema
   (fulfilment type, delivery fee, notes) + sync coverage + server-side total derivation
   inside `priceCart()`, since the client must not be trusted for a fee either.**
10. **No trust/conversion basics.** No store description (`stores` has no such column), no
    business hours, no map/directions, no reviews or ratings, no returns/delivery policy
    text. The hero falls back to the literal string "Your trusted local store, now online."
    Contact info *is* shown (phone/email badges) and is the one thing present. **Effort:
    small-medium per item, but each needs a `stores` column + sync coverage + a settings
    UI; description and hours are the two worth doing first.**
11. **Currency is hardcoded to `₦` in the storefront UI** while `stores.currency` exists and
    defaults to `NGN` (`client/lib/db/schema.ts:305`). `product-card.tsx:45`,
    `storefront-cart.tsx:71` and `:116`, and `checkout-form.tsx:219/242/247` all
    string-concatenate `₦`, and the storefront API response doesn't include `currency` at
    all. The POS client already has `formatCurrency(amount, currencyCode)`. **Effort: small —
    add `currency` to the `show()` store payload and format through it. Worth doing before
    the first non-NGN store (there is already a CFA-currency prospect on file), not after.**
12. **SEO / shareability.** No `generateMetadata` on either
    `[store_slug]` route, so every storefront page's `<title>` is
    "DumosRx - NextGen Retail & Store OS" and its OpenGraph image, description and
    `siteName` are DumosRx's own marketing copy (`web/app/layout.tsx:15-58`). Pasting a
    store's link into WhatsApp previews **DumosRx**, not the store. There is no
    `sitemap.xml` or `robots.txt` in `web/public` or `web/app`, and no JSON-LD. **Effort:
    very small — `generateMetadata` reusing the same fetch, plus a generated sitemap. This
    is the cheapest meaningful win on the whole list.**
    **✅ Shipped 2026-09-26:** `generateMetadata` on both `[store_slug]` routes via
    `web/lib/storefront-metadata.ts` (title, description, canonical, OpenGraph, Twitter,
    all from the store's own name/location; `title.absolute` bypasses the root layout's
    `"%s | DumosRx"` template), plus `app/sitemap.ts` and `app/robots.ts`, verified to emit
    as real `out/sitemap.xml`/`out/robots.txt` files under `output: "export"` +
    `trailingSlash: true`. The checkout route is `noindex`. **JSON-LD was not added.**

### Adequate as-is

Mobile responsiveness looks reasonable (responsive grid `sm:2 / lg:3 / xl:4`, a
full-width cart sheet on small screens, stacked checkout columns). The cart's
hydration handling is correct and explained. Accessibility wasn't audited in depth
and is out of scope for this pass, but one pattern is worth flagging for whoever
does: the payment-method radios are visually-hidden inputs inside `Label`s with
`onClick` handlers on the label, which is keyboard-reachable but unusual — worth a
look with `/accessibility-inspect` rather than a blind change.

---

## Recommended Next Steps

**Superseded for the bug findings — all 16 are now done** (see the
Remediation status section at the top, and `docs/FIXED_BUGS.md` for each,
`SF-P1-2` last on 2026-09-26). The original ordering is kept below the line as
the record of how it was prioritised.

What is actually left, in order:

1. **Ops, no code:** set `STOREFRONT_REBUILD_TOKEN` in the API's production `.env` and
   as a GitHub Actions secret, so SF-P2-3's rebuild-confirmation loop engages instead
   of falling back to clear-on-dispatch.
2. **SF-P2-2's remaining half** — a suspended or lapsed store's *already-published*
   page stays browsable until its rebuild lands (only checkout fails). Either a
   client-side liveness check on the storefront page, or accept and document it.
   A nightly unconditional rebuild is still worth scoping as a staleness ceiling.
3. **Raise `storefront-read`'s 120/min limiter (or give the build pipeline a token)**
   before the platform passes roughly 50 live storefronts — the build spends about two
   requests per store from a single runner IP. After SF-P0-1's fix this fails the build
   loudly rather than deleting anything, but it would still block deploys.
4. **Feature #2 (order confirmation page with an order number)** — flagged to land
   with SF-P1-2 and still not built; the first thing a real paying customer will ask
   for now that Paystack is actually reachable.
5. **Feature #11 (currency), #5 (sold-out indication), #4 (search/filter)** — each
   small, each removes a visible rough edge. #4 also finishes SF-P3-3's client half.
6. **SF-P3-3's remaining half and features #3/#6/#8/#9/#10** — each needs its own
   scoping conversation (image storage, schema + sync coverage, product judgement).
   Not blockers.

**Manual verification still outstanding for SF-P1-2 specifically:** a real
sandbox Paystack checkout click-through (connect a subaccount with one of
Paystack's test bank numbers, place a real test-mode charge, confirm
settlement) against a running local stack. Not performed as part of closing
this finding — the repo's local `.env` only has placeholder Paystack keys.
Automated tests cover the reference-binding, gating, and refund logic; they
cannot substitute for exercising Paystack's own hosted checkout page.

---

### Original ordering (2026-09-26 audit, before remediation)


Bugs first by severity, then feature gaps by impact-per-unit-of-work.

1. **SF-P0-1** — fail the build loudly when the slug list can't be fetched, instead of
   degrading to `demo` and letting the FTP sync delete every storefront. Add the
   `web/out/store/` sanity assertion to the workflow. *Highest priority by a wide margin:
   total loss of the paid feature, triggered by a transient blip, with no alert.*
2. **SF-P1-1** — distinguish a real 404/403 (→ `notFound()`) from a 5xx/network failure
   (→ throw and fail the build) in `getStorefrontData`. Same root cause as #1; fix together.
3. **SF-P1-3** — add `throttle:` groups to `POST /storefront/{slug}/checkout` and the two
   public GETs, plus one feature test that does *not* disable `ThrottleRequests`.
4. **SF-P2-6** — one-line fix (`user?.store_id ?? storeProfile?.id`) plus hardening
   `insert()`'s auto-scope guard to `== null`. Cheapest real-money correctness fix here.
5. **SF-P2-1** — scope storefront products and stock by `store_id` (NULL-tolerant), and add
   the same-owner-two-stores test the existing test's name implies.
6. **SF-P2-5** + **SF-P3-6** — make fulfilment atomic and the server leg state-guarded and
   idempotent. These are one change.
7. **SF-P2-3** — clear `storefront_dirty_at` on rebuild *success*, not dispatch acceptance.
8. **SF-P2-2** — extend dirty-marking to product and store-profile changes (a
   `Product::boot()` hook mirroring `Store::boot()`'s pattern), and consider a nightly
   unconditional rebuild as a staleness ceiling.
9. **SF-P2-4** — close the oversell race (pending-orders-aware availability at minimum) and
   add a refund path on cancellation — **before** online payment is wired up, not after.
10. **Feature #12 (SEO/`generateMetadata`)** — smallest change with the most visible product
    benefit. Do it alongside any of the above.
11. **Feature #7 (`show_online` in the importer + a bulk toggle)** — small change that
    removes an onboarding cliff silently defeating the feature customers are paying for.
12. **Feature #1/#2 (wire up Paystack; add a confirmation page with an order number)** — the
    storefront's reason to exist. Sequence SF-P2-4's refund path with it.
13. **Feature #11 (currency), #5 (sold-out indication), #4 (search/filter)** — each small,
    each removes a visible rough edge.
14. **SF-P3-1, SF-P3-2, SF-P3-4** — small hygiene fixes; bundle into whatever touches the
    area next.
15. **SF-P3-3, SF-P3-5, and features #3/#6/#8/#9/#10** — each needs its own scoping
    conversation (storage decisions, schema + sync coverage, product judgement). Not
    blockers.
