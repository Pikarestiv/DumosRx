# Known Bugs — Pre-Launch Correctness Audit

Tracking file for unresolved issues found during the pre-launch sweep of
calculation/correctness and UX-clarity bugs across the app. Fixed items are
removed from this file once resolved — check git history for what was fixed
and how. Status values: `open`, `flagged` (product decision needed, not a
clear bug).

## Open bugs

### Follow-up task

1. **Standardize write/mutation flows on `@tanstack/react-query`'s `useMutation` instead of the current manual-`useState`-loading-flag pattern, app-wide.**
   Every write flow touched during the UX/correctness sweep (held transactions,
   requested products, loyalty tiers/redemption options, payment accounts,
   returns, supplier create/update) has been converted, with each mutation's DB
   call + toast + cache invalidation living in a dedicated hook under
   `lib/hooks/` rather than inline in the component. **Not yet converted:**
   every other write flow in the app outside that touched set — a much larger
   remaining surface, deliberately deferred to avoid a blind app-wide refactor
   in one pass. Needs its own scoped plan (which dialogs move their DB call
   in-house, how shared mutation hooks are organized) before starting.

## Flagged — product decisions, not bugs

- Prescriptions: each medication's `cost` field is a free-typed number with no
  visible `unit_cost × quantity` relationship — a data-entry ambiguity (staff must
  know to type the line total, not a per-unit price), though nothing downstream
  currently miscomputes from it.
- Should sales already recorded near local midnight (before the dashboard's
  timezone fix) be reconsidered for past reports? No data migration is needed
  (stored timestamps are correct UTC; only the comparison logic was wrong), but
  flagging in case historical report re-runs matter for the business.
- Re-seeding demo data with `force: true` doesn't dedupe products/suppliers/customers
  by name (only the demo cashier user is deduped) — running "Seed Demo Data" twice
  layers a second full catalog/customer set on top of the first. Comment in the code
  suggests this is intentional ("if the operator really wants to layer on more");
  confirm that's really the intended demo experience.
- No "clear/reset demo data" path exists in this codebase — only additive seeding.
  Worth confirming whether resets happen via some other mechanism (backend/admin
  store-recreation) or are genuinely missing.
- The one seeded "mixed" payment demo sale has no real payment-split records behind
  it (fully paid via `amount_paid: totalAmount`, cosmetically labeled mixed) — fine
  today since nothing reads split data from it, but worth deciding if demo realism
  wants fabricated splits.
- The default loyalty redemption options seeded for a new store
  (`lib/db/queries/loyalty.ts`'s `DEFAULT_REDEMPTION_OPTIONS`) have hardcoded labels
  like `"₦500 Discount"`. Low priority since these are just starting defaults in a
  fully editable rewards catalog, but a non-Naira store's first-run defaults will
  show the wrong currency in the label text until edited.
- `components/settings/billing/subscription-plans.tsx` hardcodes NGN for its own
  price display — plausibly intentional (the SaaS vendor's own subscription charge
  currency, via Nigerian billing infra, independent of what currency a given store
  operates in for its own sales). Same reasoning applies to
  `components/settings/billing/referral-tab.tsx` (referral credits) and the
  coupon-applied toast/credits badge in `subscription-plans.tsx`.
