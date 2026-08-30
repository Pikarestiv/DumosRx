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
