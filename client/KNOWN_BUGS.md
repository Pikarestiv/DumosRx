# Known Bugs — Pre-Launch Correctness Audit

Tracking file for unresolved issues found during the pre-launch sweep of
calculation/correctness and UX-clarity bugs across the app. Fixed items are
removed from this file once resolved — check git history for what was fixed
and how. Status values: `open`, `flagged` (product decision needed, not a
clear bug).

## Open bugs

### Follow-up task

1. **Standardize write/mutation flows on `@tanstack/react-query`'s `useMutation` instead of the manual-`useState`-loading-flag pattern, app-wide.**
   Status: **app-wide rollout complete**, module by module, each verified with
   typecheck + full test suite: Prescriptions (including a full-submit flow
   that previously had *no* loading state at all — a double-click risk),
   Procurement mobile create/edit (plus the shared `AddProductDialog`'s
   quick-add-product flow, same missing-loading-state issue), Settings/Account
   (danger-zone resets/deletion), Settings/Staff & Store (fleet create/update/
   delete), Stock/Inventory (cycle-count submit, supplier quick-edit),
   Expenses (add/edit, delete, quick-edit), Customers (loyalty tier/reward
   delete), POS (online-order fulfillment), Products (catalog quick-edit, the
   main add/edit-product save flow — also previously had no loading state at
   all, and category management). Every converted mutation's DB call + toast +
   cache invalidation now lives in a dedicated hook under `lib/hooks/`, with
   components as thin consumers of `mutate()`/`isPending` — matching the
   pattern established earlier this session (including its trickiest case, a
   dialog whose DB call lives in its parent).
   **Known remaining gap, found via a final broad sweep, not yet converted:**
   `lib/hooks/use-customer-data.ts`'s `addCustomer`/`updateCustomer`/
   `recordPayment` (consumed by `transaction-details-dialog.tsx` and customer
   management components) are still plain async functions calling `insert()`/
   `update()`/`recordCustomerPayment()` directly, with toasts inline rather
   than in a hook's `onSuccess`/`onError`. Left unconverted since it's a
   larger, self-contained piece (three functions, multiple consumers, some of
   which already own their own in-flight UI state around the awaited call) —
   deliberately scoped out rather than folded in at the tail end of this
   rollout.
