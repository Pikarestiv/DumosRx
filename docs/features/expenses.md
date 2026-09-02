# Expenses

Route: `app/(dashboard)/expenses/page.tsx` → `<ExpenseList />`
(`components/expenses/expense-list.tsx`). All business logic (data fetch,
search/category filtering, derived stats) lives in
`lib/hooks/use-expenses-page.ts`, wrapping `useExpenseList()`
(`lib/hooks/use-finance-data.ts`).

## Schema

`expenses` table (`lib/db/schema.ts`): `category`, `description`, `amount`,
`date`, `payment_method`, `vendor_name`, `reference_number`, `notes`,
`covers_months` — plus the usual sync/soft-delete columns. `vendor_name` and
`reference_number` exist in the schema but have **no UI** anywhere in the Add/
Edit dialog or detail view; they're unused columns as far as this feature
goes.

There is no `is_recurring`/`recurring` boolean or cadence field. The closest
concept to "recurring vs one-off" is **`covers_months`** — see below.

## Insights strip

Four cards above the list, backed by `useExpensesPage()`:

- **Total expenses** — `sum(amount)` across every expense, **all time**,
  deliberately *not* smoothed (a real ledger total of cash actually spent,
  ever).
- **This month** — smoothed sum for the current calendar month via
  `getSmoothedAmountInWindow()` (`lib/db/queries/finance.ts`) — see the
  covers_months section below for what "smoothed" means.
- **Top category** — the category with the highest smoothed spend in the
  current month; shows "N/A" when there's no smoothed spend this month.
- **Transactions** — a plain count of all (non-deleted) expense rows, all
  time.

## Category filter

`ExpenseCategoryFilter` renders **All / Rent / Utilities / Salaries /
Maintenance / Marketing / Other** as chips (mobile) or tabs (desktop) — one
shared `selectedCategory` state, client-side filter over the already-fetched
list (`exp.category === selectedCategory`, or no filter for "All"). Verified
live: selecting "Rent" against a store with only a Utilities expense correctly
showed the "No expenses found" empty state; "All" restored the row.

Search (separate control, own input) filters by case-insensitive substring
match against `description` only — combines with the category filter (both
must match).

## Add / Edit ("Add Expense" / "Edit Expense" dialog)

`components/expenses/add-expense-dialog.tsx`, one component for both create
and edit (`expenseToEdit` prop switches title, button label, and whether
`useSaveExpenseMutation` calls `update()` vs `insert()`
(`lib/hooks/use-expense-mutations.ts`)). Fields:

- **Date** — `DatePickerInput`, defaults to today, `disableFuture`, capped to
  the last 5 years.
- **Category** — select: Rent / Utilities / Salaries / Maintenance /
  Marketing / Other. Defaults to "Rent" on Add.
- **Description** — required free text.
- **Amount** — required number, `step="0.01"`.
- **Method** — select: Cash / Bank Transfer / Card. Defaults to "Cash".
- **Spread over how many months? (optional)** — `covers_months`, a plain
  number input (`min="2"`). This is the "recurring vs one-off" distinction
  the schema actually supports: it doesn't create N separate future expense
  rows or repeat anything — it's a single row whose amount is *smoothed*
  across N months for reporting. Typing a value ≥ 2 (with an amount already
  entered) shows a live preview line, e.g. "Reports will count ₦1,000/month
  for 12 months starting September 2026, instead of the full amount in one
  period." Left blank/1, the full amount counts entirely in its own date's
  month (the ordinary one-off case).
- **Notes (optional)** — free-text `notes` column, shown only on the detail
  dialog when non-empty (blank notes render nothing there, not an empty
  section).

On edit, the form is pre-filled from the selected expense including
`covers_months` and `notes` — confirmed live re-opening Edit on a
just-created expense showed all fields, including the covers_months preview
line, intact.

**Live-verified smoothing math:** created a Utilities expense, ₦12,000,
`covers_months: 12`, dated today (September 2026). Total expenses (all time)
showed the full **₦12,000**; This month showed **₦1,000** (12,000 / 12) and
Top category flipped to "Utilities" — matches `getSmoothedAmountInWindow()`'s
per-month attribution. Editing the amount to ₦15,000 (still 12 months)
recalculated This month to **₦1,250** live, no page reload needed.

## Expense detail dialog

`ExpenseDetailDialog` (click any row) shows amount, category badge,
Description, Date, Payment Method, Recorded By (only rendered if
`recorded_by_name` is present), and a Notes card (only rendered if `notes` is
non-empty). **`covers_months` is not surfaced anywhere in this dialog** — a
prepaid/spread expense looks identical to a one-off here; the only place its
effect is visible is the Add/Edit form's preview line and the smoothed
Insights-strip numbers.

Footer has **Edit** (opens the Add/Edit dialog pre-filled) and **Delete**
(opens a `ConfirmDialog`: "Are you sure you want to delete this expense? This
action cannot be undone." / Cancel / Delete). Confirming calls
`useDeleteExpenseMutation` → `softDelete("expenses", id)` and closes the
detail dialog. Live-verified: deleted a test expense, list returned to "No
expenses found" and all four Insights cards reset to zero/N/A.

## Desktop table: inline "quick edit"

`ExpenseDesktopRow` (desktop table only, not the mobile card list) has a
pencil icon that appears on row hover. Clicking it swaps that row's Category
cell for a `<select>` (options: the same six categories, no "All") and its
Amount cell for an `EditableNumberCell`, plus inline Save (check)/Cancel (X)
buttons — a narrower edit than the full dialog: `useQuickEditExpenseMutation`
only patches `category` and `amount`, nothing else on the row. Live-verified:
opening quick-edit, then Cancel, left the row's amount unchanged (no write
occurred).

## Virtualization

The desktop table uses `@tanstack/react-virtual`'s `useVirtualizer` over the
sorted/filtered list (`DESKTOP_ROW_HEIGHT = 56`, `overscan: 8`) — noted in
the task brief as already using this pattern; not something this task needed
to add.

## Sorting

Desktop table columns (Date/Category/Description/Method/Amount) are each
sortable via `SortableHeaderCell` / `useSortableData`, toggling asc/desc per
column click. Mobile card list has no sort control (always shows
`filteredExpenses` in the hook's default order — dated newest first).

## Test coverage

- `e2e/expenses.spec.ts` (pre-existing) — logs in, opens the Add Expense
  dialog, fills Description + Amount (Date pre-filled), saves, and asserts
  the new row appears. Never exercised Category selection, `covers_months`,
  `notes`, editing, or deleting an existing expense.

**Gap confirmed (Step 3):** `grep -n "test(" e2e/expenses.spec.ts` showed
exactly one test ("should log in, render expenses page, and add an
expense"). Edit and delete of an existing expense had zero e2e coverage.

**Closed (Step 4):** added a second test, "should edit an existing expense
and then delete it", to `e2e/expenses.spec.ts`:

1. Adds a fresh expense (own fixture data, independent of the first test).
2. Opens it, clicks **Edit**, changes the description and amount, saves via
   **Update Expense**, and asserts the updated description is visible (and
   the old one is gone).
3. Re-opens the (now-updated) row, clicks **Delete**, confirms via the
   `ConfirmDialog`, and asserts the row disappears from the list.

Both tests pass: `npx playwright test --project=chromium e2e/expenses.spec.ts
--no-deps` (the brief's literal `npx playwright test e2e/expenses.spec.ts`
also invokes the known, pre-existing, unrelated `e2e/global.setup.ts`
breakage — not this task's to fix).

## Bugs found

None. The Step 1 live walkthrough (add with all fields, category filter,
search, edit, inline quick-edit + cancel, detail view, delete) behaved
correctly in every case, including the `covers_months` smoothing math on both
create and edit. No fix was needed for this task.
