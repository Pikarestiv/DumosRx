# Superadmin Smoke-Test Findings Log

Running log of bugs/UX issues found while walking the superadmin app
(`web/`, distinct from the store-owner-facing `client/` app) section by
section, in the same style as `docs/features/_findings-log.md` in the repo
root (client app). Newest entries at the bottom.

## Resolved

(none yet — nothing in this batch was fixed; task scope was investigation
and documentation only)

## Open

### Products: `/admin/products` list and pagination are always empty despite a real 200 response and real data

`AdminController::products` (Laravel) returns
`{"products": {"data": [...], "meta": {...}}, "metrics": {...}, "categories": [...]}`
— nesting the paginated `data`/`meta` one level under a `products` key. The
frontend (`app/admin/products/page.tsx`, `AdminProductsResponse` in
`lib/types/admin.ts`) expects them flat at the top level, matching every
other admin list endpoint in this app (e.g. `admin/stores`). Result: the
Global Products table always shows "No products found in the global
catalog" and the header always reads "Global Catalog: 0 SKUs", regardless
of the 3,041 real products in the dev DB. Metrics and categories (which are
already top-level in both response and type) render correctly and are
unaffected. Confirmed via a direct authenticated `fetch()` from the page's
own console (`products.data.length === 10`, `response.data === undefined`).
See `docs/features/superadmin/products.md` for full detail. **Not fixed**
— out of scope for this investigation-only task.

### Products: "Stock Flag Rate" metric card renders a bare number where its siblings render a percentage

`AdminService::getProductMetrics()` returns `stockAlerts.rate` as a raw
number (unlike `mostStockedCategory.growth` and `compliance.rate`, which
the backend formats as `"N%"` strings). The frontend renders it verbatim
with no `%` appended, so the "Stock Flag Rate" card shows a bare "71" next
to two sibling cards correctly showing "-0.5%" and "0.4%". Minor
formatting inconsistency, not a data-correctness bug. See
`docs/features/superadmin/products.md`.

### Products: "PCN Compliance" card always says "Verified" regardless of actual compliance status

The backend computes a real `compliance.status` field (`'Verified'` above
90%, else `'Action Required'`), but `global-products-metrics.tsx`
hardcodes the literal word "Verified" in front of the rate instead of
reading `status`. Live-observed: card reads "Verified 0.4%" while the true
compliance rate is 0.4% and the backend's own `status` says "Action
Required" — the opposite of what the card claims. See
`docs/features/superadmin/products.md`.

### Products: per-row "View Details" / "Edit Product" / "Standardize Entry" actions are non-functional toast stubs

Confirmed via source read (`global-products-table.tsx`): all three dropdown
actions on each product row call `toast.info(...)`/`toast.success(...)`
with no API call, no mutation hook, and no navigation behind any of them.
Could not additionally confirm interactively since the table is always
empty (see the list/pagination bug above), but the absence of any hook
wiring in source is unambiguous. See `docs/features/superadmin/products.md`.

### Products: "Export Metrics" button is a stub

`handleExportMetrics` in `app/admin/products/page.tsx` is
`toast.info("Preparing export...")` with no follow-up — no download, no API
call. Confirmed live. See `docs/features/superadmin/products.md`.

### Products: "Standardize Catalog" is a real, unscoped, platform-wide mutation — deliberately not exercised

`AdminService::standardizeCatalog()` runs two unconditional `UPDATE`
statements across every product on the whole platform (default-filling
empty `generic_name`→`'General'` and `manufacturer`→`'Unknown'`), with no
dry-run/preview and no visible undo. This is real inventory data shared
with the store-owner-facing `client/` app. Correctly left unexercised per
this task's "look, don't submit" guidance for anything with real
platform-wide consequences. Route/controller/permission-gate verified
correct by source read. See `docs/features/superadmin/products.md`.

### Marketing: Coupons/Referrals create-and-mutate flows not independently exercised live (tab contention, not a product bug)

This task's Chrome session shared a tab group with a concurrently-running
sibling smoke-test task (Login/Stores/Users). Every dedicated tab opened
for a coupon create/edit/toggle/delete round-trip, or for visually loading
the Affiliates & Referrals tab, was navigated away from or closed by
outside activity within 1-3 tool calls, repeatedly, before the interaction
could complete. Verification fell back to: direct authenticated
`fetch()`/`curl` calls against the real backend using the session's own
bearer token (confirming exact response shapes and cross-checking against
`php artisan tinker` DB counts), plus full source reads of
`CouponController`, `ReferralController`, and the relevant frontend hooks
and components — all of which checked out as correctly wired to real
routes with no stubs. Not a bug; flagged so a future task with an isolated
browser session can complete the live create/delete round-trip if desired.
See `docs/features/superadmin/marketing.md`'s Caveats section.

### Marketing: no bugs found in Coupons or Referrals endpoint wiring

Both tabs' read endpoints (`admin/coupons`, `admin/referrals/summary`,
`admin/referrals`, `admin/referrals/transactions`, `admin/referrals/settings`)
return response shapes that exactly match what their frontend hooks/types
expect — unlike Products, there is no `data`/`meta` nesting mismatch here.
Live/DB cross-checks all agreed (0 coupons, 0 referred users, 0 referral
credit transactions, matching what each screen would show). See
`docs/features/superadmin/marketing.md`.
