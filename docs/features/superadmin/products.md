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

## Fixed: product list and pagination were always empty/zero, despite a real 200 response

**Was confirmed live** on `http://localhost:3002/admin/products`: the page
loaded, metrics cards populated, category filter populated (12 real
`generic_name` values), but the table always rendered "No products found in
the global catalog" and the header read "Global Catalog: 0 SKUs" —
regardless of the 3,041 real products and regardless of search/category
filtering.

**Root cause — response shape mismatch.** `AdminController::products` used
to return:

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
in this app, e.g. `admin/stores`). Since the real payload nested `data`/`meta`
one level down under a `products` key instead, `response.data` was always
`undefined` → `productList` was always `[]`, and `response.meta` was always
`undefined` → the whole pagination footer never rendered (its whole block
is gated on `productMeta && productMeta.last_page > 1`).

**Fix:** `AdminController::products`
(`laravel-server/app/Http/Controllers/Api/Admin/AdminController.php`) now
spreads `getGlobalProducts()`'s `data`/`meta` directly into the response
root — `['...$products, 'metrics' => ..., 'categories' => ...]` — matching
`AdminController::stores`'s shape. `AdminService::getGlobalProducts()`
itself was unchanged; its `data`/`meta` return shape was already correct.

**Verified by:** `laravel-server/tests/Feature/Admin/AdminProductsResponseShapeTest.php`
(RED before / GREEN after, own seeded fixtures) plus a live walkthrough —
table now shows real rows, header reads "Global Catalog: 3041 SKUs",
pagination footer works ("Page 1 of 305", Prev/Next). See
`_findings-log.md`'s Resolved section for full detail.

**Metrics and categories were unaffected by this bug** — they were already
top-level in both the response and the type, so the three metric cards
(Most Stocked Category, Stock Flag Rate, PCN Compliance) rendered real,
correct numbers even while the table was empty (see the two formatting
fixes below, which were separate, smaller bugs on top of correct data).

## Other observations (live + code) — now fixed

- **"Stock Flag Rate" card mislabeled a count as a rate — fixed.** Live
  render showed "71" under the "STOCK FLAG RATE" heading with no `%`.
  `AdminService::getProductMetrics()` computed `rate` as a raw number
  (unlike `mostStockedCategory.growth` and `compliance.rate`, which the
  backend already formatted as `"N%"` strings). **Fix:** appended `'%'` to
  `stockAlerts.rate` server-side, matching its siblings — the frontend
  (`global-products-metrics.tsx:43`) needed no change since it already
  rendered whatever string the backend sent. Card now correctly reads
  "71%".
- **"PCN Compliance" card copy was misleading — fixed.** `compliance.status`
  is computed (`'Verified'` vs `'Action Required'`, correctly, at >90%
  threshold) but the frontend never read it — `global-products-metrics.tsx`
  hardcoded the literal word `"Verified"` in front of whatever the rate was.
  Live-observed before the fix: "Verified 0.4%" while the real backend
  `status` said `"Action Required"` — the opposite of what the card
  claimed. **Fix:** the card now renders `compliance.status ?? "Unknown"`
  followed by the rate; `GlobalProductMetrics` type updated to include
  `status`. Card now correctly reads "Action Required 0.4%".
- **Row actions (View Details / Edit Product / Standardize Entry) were
  non-functional stubs — now honestly labeled.** `global-products-table.tsx`'s
  three dropdown-menu actions per product row each just called
  `toast.info(...)`/`toast.success(...)` — no API call, no navigation, no
  `useMutation` anywhere near them. Investigated whether real destinations
  exist to wire these to: they don't — there's no per-product detail/edit
  page anywhere in the superadmin panel, and the only product CRUD
  endpoints in the backend are tenant-scoped to a store's own inventory
  (`Api/App/ProductController`), not usable/appropriate for a platform-wide
  admin view across arbitrary stores; there's also no per-row standardize
  endpoint (only the existing bulk one). **Fix:** rather than build new
  admin surfaces (out of scope) or leave the toasts silently implying
  success, all three now show an honest "not yet available" message
  explaining why (e.g. "Product editing not yet available — there's no
  admin product-edit endpoint yet").
- **"Export Metrics" button was a stub — now a real CSV export.**
  `handleExportMetrics` in `page.tsx` used to be
  `toast.info("Preparing export...")` with nothing after it. No backend
  export endpoint exists, but the action is small and well-scoped over data
  already loaded client-side, so it now builds a real CSV of the
  currently-displayed metrics (catalog total, most-stocked category +
  growth, stock flag rate + count, compliance rate + status) and triggers a
  browser download via `Blob`/`URL.createObjectURL`. Verified live: a real
  `global-product-metrics-<date>.csv` file downloads with correct values.
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
- **Fix-verification pass (later batch):** re-logged in as
  `admin@dumosrx.com` on `http://localhost:3002/admin/products` after the 5
  fixes above landed. Table populates with real rows, "Global Catalog: 3041
  SKUs" header, working pagination footer ("Page 1 of 305"), "Stock Flag
  Rate" card reads "71%", "PCN Compliance" card reads "Action Required
  0.4%", the "View Details" row action shows an honest "not yet available"
  toast, and "Export Metrics" downloads a real CSV file with correct
  values.
- This session's Chrome tab group was shared with a concurrently-running
  sibling task (Login/Stores/Users) — several attempts to open a dedicated
  tab for deeper interaction were pre-empted by the sibling's own navigation
  and tab-closing activity. All findings above were independently confirmed
  via direct authenticated `fetch()` calls from the page's own console
  (using the real `drx_admin_token` from `localStorage`) and via Laravel
  route/controller source reading, not assumed from a single screenshot.
