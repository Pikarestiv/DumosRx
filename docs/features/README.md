# DumosRx Feature Documentation & Smoke-Test Index

Produced by walking every section of the app against real seeded data
(`Pikarestiv Stores 2`, 1,513 real products), documenting what each control
does, closing real test-coverage gaps, and fixing bugs found along the way.
See `docs/superpowers/plans/2026-09-02-full-app-smoke-test-and-docs.md` for
the plan this followed, and `_findings-log.md` for the full list of what was
found.

## Sections (nav order)

1. [Dashboard](dashboard.md) — stat cards, Action Center, sync indicator, Recent Activity.
2. [Inventory](inventory.md) — Overview / Catalog / Batches / Ledger / Audits tabs, product import/export.
3. [Point of Sale](pos.md) — checkout, held transactions, discounts, product-request empty state.
4. [Prescriptions](prescriptions.md) — pharmacy-vertical module, dispensing, plan-tier gate.
5. [Customers](customers.md) — directory, purchase history, loyalty tiers, credit payments.
6. [Procurement](procurement.md) — vendors, purchase orders, receiving, stock-batch creation.
7. [Expenses](expenses.md) — categories, smoothed monthly totals, edit/delete.
8. [Reports](reports.md) — Daily Close, Operational Reports, Analytics & Insights.
9. [Activity Log](activity-log.md) — cross-cutting audit trail for every other section.
10. [Settings](settings.md) — all 21 sub-tabs (several are URL aliases to shared panels).

## Findings log

[`_findings-log.md`](_findings-log.md) is the running record of everything
found while walking the app — see its summary section at the top for the
totals.
