# Global Products (Superadmin)

Route: `app/admin/products/page.tsx` (`GlobalProductsManagement`) →
`app/admin/products/global-products-metrics.tsx` +
`app/admin/products/global-products-table.tsx`.

**Scope correction vs. the task brief's guess:** this is **not** the SaaS's
own subscription/pricing-plan catalog (Free/Starter/Pro/Enterprise tiers).
It's a platform-wide, read-mostly rollup over every store's real pharmacy
inventory `products` table (3,041 rows in this dev DB, confirmed via
`php artisan tinker --execute="echo \App\Models\Product::count();"`) —
"Global Category" facets on `generic_name`, "Store Instances" per product,
avg. cloud price, aggregate stock-health, and NAFDAC-number compliance. The
subscription/pricing-tier catalog lives elsewhere (`useFeatureGate()` /
`system_configs`), not here.

## Data flow

- `useAdminProducts(page, search, category)`
  (`lib/api/admin-hooks-stores.ts:60`) → `GET admin/products?page=&search=&category=`
  → `AdminController::products` (`laravel-server/app/Http/Controllers/Api/Admin/AdminController.php:166`),
  gated by `permission:manage_platform` route middleware (`routes/api.php:137`)
  plus an inline `hasRole('super_admin')` check.
- `useStandardizeProductsMutation()` (`admin-hooks-stores.ts:83`) →
  `POST admin/products/standardize` → `AdminController::standardize` →
  `AdminService::standardizeCatalog()`.

## Bug: product list and pagination are always empty/zero, despite a real 200 response

**Confirmed live** on `http://localhost:3002/admin/products`: the page loads,
metrics cards populate, category filter populates (12 real `generic_name`
values), but the table always renders "No products found in the global
catalog" and the header reads "Global Catalog: 0 SKUs" — regardless of the
3,041 real products and regardless of search/category filtering.

**Root cause — response shape mismatch.** `AdminController::products` returns:

```json
{ "products": { "data": [...10 items...], "meta": {...} }, "metrics": {...}, "categories": [...12...] }
```

(verified directly: `fetch('/api/v1/admin/products?page=1', ...)` from the
authenticated page's own console returned exactly this — `products.data`
had 10 items, `products.meta` was present, top-level `metrics`/`categories`
were correct.)

But the frontend's `AdminProductsResponse` type
(`lib/types/admin.ts:128`) — and `GlobalProductsManagement`'s destructuring
(`response?.data`, `response?.meta`) — expect a **flat** paginated shape
(`data`/`meta` at the top level, matching every other admin list endpoint
in this app, e.g. `admin/stores`). Since the real payload nests `data`/`meta`
one level down under a `products` key instead, `response.data` is always
`undefined` → `productList` is always `[]`, and `response.meta` is always
`undefined` → the whole pagination footer never renders (its whole block
is gated on `productMeta && productMeta.last_page > 1`).

**Fix would be one of:** either `AdminController::products` should spread
`getGlobalProducts()`'s `data`/`meta` at the top level (matching
`AdminController::stores`'s shape), or the frontend should read
`response.products.data` / `response.products.meta`. Not fixed here per
task scope (investigation/documentation only).

**Metrics and categories are unaffected** — they're already top-level in
both the response and the type, so the three metric cards (Most Stocked
Category, Stock Flag Rate, PCN Compliance) render real, correct numbers
(cross-checked live: 71 batches under quantity 10, 2160 "critical" — the UI
reads `stockAlerts.rate` as a raw count `71` mislabeled as a percentage on
the card face, see below).

## Other observations (live + code)

- **"Stock Flag Rate" card mislabels a count as a rate.** Live render showed
  "71" under the "STOCK FLAG RATE" heading. `AdminService::getProductMetrics()`
  computes `rate: $totalProducts > 0 ? round(...) : 0` correctly as a
  percentage (`71`, i.e. `2160/3041*100 ≈ 71.0`... actually the count 2160
  low-stock batches out of a different denominator), but the frontend
  (`global-products-metrics.tsx:43`) renders `productMetrics?.stockAlerts?.rate ?? "0%"`
  with no `%` suffix ever appended by the backend to a bare integer
  (`'rate' => round(...)` is a number, not a formatted string, unlike
  `mostStockedCategory.growth` and `compliance.rate` which the backend does
  append `'%'` to as strings). Net effect: the big headline number under
  "Stock Flag Rate" reads as a bare "71" with no unit, while the two other
  cards correctly show "-0.5%" and "0.4%". Minor formatting inconsistency,
  not a data-correctness bug.
- **"PCN Compliance" card copy is misleading.** `compliance.status` is
  computed (`'Verified'` vs `'Action Required'`, correctly, at >90%
  threshold) but the frontend never reads it — `global-products-metrics.tsx:60`
  hardcodes the literal word `"Verified"` in front of whatever the rate is:
  `` `Verified ${productMetrics?.compliance?.rate ?? "0%"}` ``. Live-observed:
  "Verified 0.4%" — i.e. the card claims compliance is "Verified" while the
  real compliance rate is 0.4% and the backend's own `status` field says
  `"Action Required"`. This is a real (if minor) misleading-copy bug: the
  word "Verified" should be conditional on `compliance.status`, not a static
  label.
- **Row actions (View Details / Edit Product / Standardize Entry) are
  non-functional stubs.** `global-products-table.tsx`'s three dropdown-menu
  actions per product row each just call `toast.info(...)` /
  `toast.success(...)` — no API call, no navigation, no `useMutation`
  anywhere near them. Confirmed via code read (`onClick={() => toast.info(...)}`
  for all three); could not additionally confirm live-in-table since the
  table is always empty per the bug above, but the toast text and lack of
  any hook wiring makes this unambiguous from source alone.
- **"Export Metrics" button is a stub.** `handleExportMetrics` in
  `page.tsx:63` is `toast.info("Preparing export...")` with nothing after
  it — no download, no API call. Confirmed live: clicking shows the toast
  and nothing else happens.
- **"Standardize Catalog" is a real, platform-wide mutating action —
  intentionally NOT executed live.** `AdminService::standardizeCatalog()`
  runs two unconditional `UPDATE` statements across **every** product on the
  **entire platform** (not scoped to a store or a search filter): any
  product with a null/empty `generic_name` gets set to `'General'`, and any
  product with a null/empty `manufacturer` gets set to `'Unknown'`. This is
  real, live pharmacy inventory data shared with the store-owner-facing
  `client/` app — running it in this dev session would have permanently
  overwritten real product fields for however many of the 3,041 seeded
  products happen to have those fields empty, with no dry-run/preview and no
  visible undo. Per this task's brief ("be very conservative... look, but
  don't submit changes unless confident it's safe/reversible"), this was
  deliberately not clicked. The route, permission gate, and controller code
  were all verified by reading source instead (see above) — endpoint is real
  and correctly wired, just not exercised.

## Live walkthrough notes

- Login, category-filter dropdown (12 real values populated from distinct
  `generic_name`), and search box all render and issue requests correctly;
  the empty-list bug above means search/filter/pagination can't be
  functionally exercised end-to-end even though the requests themselves are
  correct (confirmed via Network tab: `GET /api/v1/admin/products?page=1`
  → 200, each keystroke's debounced search re-fires the same endpoint with
  `&search=...`).
- No console errors observed during this walkthrough.
- This session's Chrome tab group was shared with a concurrently-running
  sibling task (Login/Stores/Users) — several attempts to open a dedicated
  tab for deeper interaction were pre-empted by the sibling's own navigation
  and tab-closing activity. All findings above were independently confirmed
  via direct authenticated `fetch()` calls from the page's own console
  (using the real `drx_admin_token` from `localStorage`) and via Laravel
  route/controller source reading, not assumed from a single screenshot.
