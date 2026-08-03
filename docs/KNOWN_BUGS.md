# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet — tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings.

## Supplier tax ID never pre-fills on edit

**Where:** `client/components/stock-batch/supplier-management.tsx` (`transformSupplier()`), consumed by `client/components/suppliers/add-supplier-dialog.tsx`.

**What:** `transformSupplier()` builds the supplier view-model used by the supplier directory but never maps the `tax_id` column into it. `AddSupplierDialog` reads `initialSupplier?.taxId` when pre-filling the edit form, so it's always `undefined` — editing an existing supplier always starts with a blank Tax ID field, silently discarding whatever was saved.

**Status:** Flagged via a code comment on `SupplierViewModel.taxId` in `client/lib/types/supplier.ts` (not fixed — this was noticed during a type-safety pass, not a behavior-fix pass).

**Fix:** Add `taxId: apiData.tax_id || ""` to `transformSupplier()`.

## Stock movement history never shows who/supplier/batch

**Where:** `client/components/stock-batch/stock-movements.tsx` (`mapMovement()`), backed by `getStockMovements()`/`getStockAdjustments()` in `client/lib/db/local-database.ts`.

**What:** The Stock Movements list and detail modal have `user`, `supplier`, and `batchNumber` fields, but the underlying query only joins `stock_movements` to `products` (for the product name) — it never joins `users` (for `performed_by`), `suppliers`, or `stock_batches` (for the batch number). So every row's "User" column always shows the "System" fallback, and supplier/batch are always blank, regardless of who actually performed the movement or which batch it affected.

**Status:** Flagged only — `mapMovement()` was simplified during a type-safety pass to stop pretending these fields might resolve (previously it had dead fallback chains like `m.user?.name || m.user_name || "System"` that could never fire against the actual query shape). Not fixed.

**Fix:** Join `users` on `performed_by` and `stock_batches` on `stock_batch_id` (and `suppliers` transitively through the batch's originating purchase order, if that's wanted) in `getStockMovements()`/`getStockAdjustments()`, then map the real columns through in `mapMovement()`.
