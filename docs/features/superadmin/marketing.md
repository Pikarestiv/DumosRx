# Marketing (Superadmin)

Route: `app/admin/marketing/page.tsx` (`MarketingPage`) — two tabs:

- **Coupons & Trials** → `components/admin/marketing/coupons-manager.tsx` +
  `coupon-dialog.tsx`
- **Affiliates & Referrals** → `components/admin/marketing/referrals-manager.tsx`
  + `referrals-summary-cards.tsx`, `referrals-settings-form.tsx`,
  `referrals-relationships-table.tsx`, `referrals-audit-log.tsx`,
  `referrals-adjust-dialog.tsx`

Both tabs are platform-wide (not store-scoped) and gated server-side by the
`permission:manage_platform` route-group middleware (`routes/api.php:137`,
covers `/admin/coupons*` and `/admin/referrals*`).

## Coupons & Trials

- `useAdminCoupons()` (`lib/api/admin-hooks-referrals.ts`) → `GET admin/coupons`
  → `CouponController::index` (`laravel-server/app/Http/Controllers/Api/Admin/CouponController.php`)
  — returns a raw JSON array (`Coupon[]`), matched by the hook's
  `Coupon[] | { data: Coupon[] }` type. Confirmed live: 0 coupons in DB
  (`php artisan tinker --execute="echo \App\Models\Coupon::count();"` → `0`)
  matches the UI's "No coupons generated yet." exactly — no shape mismatch
  here (unlike Global Products, see `products.md`).
- **Generate Coupon** dialog (`coupon-dialog.tsx`) fields map 1:1 onto
  `CouponController::store`'s validation (`code` unique, `type` enum
  `discount_percent`/`discount_amount`/`trial_extension`, `value` int ≥0,
  optional `target_plan`/`target_interval`(`monthly`/`yearly`)/`expires_at`
  (must be `after:now`)/`max_uses`/`max_uses_per_user`, defaulting the last
  to `1` server-side if omitted) → `useGenerateCouponMutation()` → `POST
  admin/coupons`. Verified live that the dialog opens with all the expected
  fields (Coupon Code, Type select, value input whose label switches
  contextually per type, Target Plan, Interval select, Expiry Date picker,
  Max Total Uses, Max Uses Per User) and pre-fills `max_uses_per_user` to
  `1`, matching the backend default.
- Edit (`useUpdateCouponMutation` → `PUT admin/coupons/{coupon}`), toggle
  active/inactive (`PUT admin/coupons/{coupon}/toggle`), usages
  (`GET admin/coupons/{coupon}/usages`), and delete
  (`DELETE admin/coupons/{coupon}`) all exist in
  `lib/api/admin-hooks-referrals.ts` and map onto real `CouponController`
  methods and real routes (`routes/api.php:192-197`) — verified by source
  read; not independently exercised live (see Caveats).
- **Not exercised live:** actually submitting a coupon (create/edit/
  toggle/delete round-trip). This is a genuinely reversible, low-risk
  action (a coupon nobody has redeemed has zero real-world consequence, and
  a `destroy()` exists to clean it up) and was worth doing, but this
  session's Chrome tab group was shared with a concurrently-running sibling
  task (Login/Stores/Users): every freshly-created tab for this purpose was
  either navigated away from or closed within 1-3 tool calls before the
  round-trip could complete (confirmed repeatedly — `tabs_create_mcp`
  succeeding, then the very next `tabs_context_mcp` call showing the tab
  gone). After several attempts (per this task's own instruction to stop
  retrying after 2-3 stalls), verification fell back to direct source
  reading (`CouponController.php`, above) plus one confirmed live screenshot
  of the "Generate New Coupon" dialog fully rendered with correct fields.

## Affiliates & Referrals

All four read endpoints were verified directly against the backend using
the real admin bearer token extracted from the authenticated page's own
`localStorage` (`drx_admin_token`), and cross-checked against the DB:

| Hook | Endpoint | Live response | DB cross-check |
|---|---|---|---|
| `useReferralsSummary()` | `GET admin/referrals/summary` | `{"total_referrals":0,"total_credits_earned":0,"total_credits_spent":0,"active_referrers":0}` | `User::whereNotNull('referred_by_id')->count()` → `0` ✓ |
| `useReferralsSettings()` | `GET admin/referrals/settings` | `{"enabled":true,"reward_trigger":"recurring","reward_percentage":10,"allow_full_credit_payment":true}` | n/a (config row) |
| `useReferralsRelationships()` | `GET admin/referrals` | flat Laravel paginator, `total: 0` | matches `total_referrals` above |
| `useReferralsTransactions()` | `GET admin/referrals/transactions` | flat Laravel paginator, `total: 0` | `ReferralCreditTransaction::count()` → `0` ✓ |

Unlike Global Products, `ReferralController`'s three list/summary methods
(`getSummary`, `getReferrals`, `getTransactions` in
`laravel-server/app/Http/Controllers/Api/Admin/ReferralController.php`)
return response shapes that match their frontend types exactly (flat
`PaginatedResponse<T>` for the two list endpoints, a flat object for
summary/settings) — no shape-mismatch bug here.

- **Referral Program Settings** form (`referrals-settings-form.tsx`) →
  `useUpdateReferralsSettingsMutation()` → `PUT admin/referrals/settings` →
  `ReferralController::updateSettings`. Not submitted live (see Caveats) —
  this genuinely changes a live platform-wide reward-trigger/percentage
  config, not a scoped test object, so it was correctly left conservative
  per the task brief even setting aside the tab-contention issue.
- **Administrative Override** ("Adjust User Balance") →
  `useAdjustReferralsCreditsMutation()` → `POST admin/referrals/adjust-credits`
  → `ReferralController::adjustCredits`, which validates
  `type: earned|spent|admin_adjustment` and directly mutates a real user's
  `referral_credits` balance (with an insufficient-balance guard on `spent`).
  This is real financial-ledger data on a real account. Correctly not
  exercised live — this is exactly the kind of action the task brief flags
  as "look, but don't submit."

## Caveats / what wasn't independently exercised live

- No coupon create/edit/toggle/delete round-trip was completed live, for
  the tab-contention reason described above — code-level verification
  (route existence, controller validation matching the dialog's fields,
  correct permission middleware) stands in its place.
- The Affiliates & Referrals tab's UI itself (summary cards, relationships
  table, audit log, settings form, adjust-balance dialog) was not visually
  confirmed live in this session for the same tab-contention reason — its
  four read endpoints were instead verified directly via authenticated
  `curl`/`fetch` against the real backend and cross-checked against
  `php artisan tinker` counts (table above), and its component wiring
  (`referrals-manager.tsx`) was confirmed by source read to call the real
  hooks with no stub/mock code paths, unlike Global Products' row actions.
- No console errors were observed on the Marketing page during the portion
  of the walkthrough that was live (Coupons tab load + dialog open).
