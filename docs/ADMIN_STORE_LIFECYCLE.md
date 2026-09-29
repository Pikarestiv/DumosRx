# Admin Store Fleet: search, navigation and deletion

Covers the super-admin console's Store Fleet page (`web/app/admin/stores`),
its detail page (`web/app/admin/stores/details`) and the endpoints behind
them.

## Search

`GET /admin/stores?search=` matches store name, store id, **device id**
(`stores.device_id`) and the owner's first name, last name or email.
Device id was added so the founder can paste the identifier printed on a
terminal and land on the store it belongs to; the fleet row renders the
device id under the store id for the same reason.

The input is debounced client-side at **300 ms** (`SEARCH_DEBOUNCE_MS` in
the page), the query keeps the previous page's rows via TanStack's
`placeholderData: keepPreviousData` and holds them for a 30 s `staleTime`,
and a search edit resets pagination to page 1. Those four together are what
stop a keystroke from both re-querying and blanking the table.

## Navigation

`adminStoreDetailPath()` in `web/lib/admin-routes.ts` is the only place a
link to one store's detail page is built. It is used by:

- the fleet row's own click/Enter handler (the primary "view" action),
- the kebab's "View Store Details" item,
- the dashboard's Recent Stores dialog "View Full Profile" button.

That last one used to push `/admin/stores?search=<uuid>`, landing on the
fleet list pre-filtered by id instead of the store itself.

Because the row navigates on click, the kebab's whole table cell stops
`click` and `keydown` propagation. Any new interactive control added to a
row must sit inside a cell that does the same, or it will navigate as well
as doing its own job.

## Archive (soft delete)

`DELETE /admin/stores/{id}` sets `stores.deleted_at` (plus `deleted_by_id`
and an internal `deletion_reason`). `Store` uses `SoftDeletes`, so an
archived store disappears from the fleet list, sync and every other Store
query. Nothing is removed and `POST /admin/stores/{id}/restore` puts it
back. The fleet's Filters menu has an Archived section (`active` / `only` /
`all`) which maps to the endpoint's `archived` query parameter.

## Permanent delete (purge)

`DELETE /admin/stores/{id}/purge` is irreversible and exists for the
founder's own mistakes, e.g. a duplicate store created during a demo.

Most `store_id` columns in this schema carry no database-level foreign key
(see `add_store_id_to_domain_tables`), so nothing cascades on its own and a
bare `forceDelete()` would strand every product, sale and staff row.
`AdminStoreDeletionService::purgeStore()` therefore introspects the live
schema for every table with a `store_id` column and clears each one, which
also covers tables added later without editing the service. It then removes
the store's staff accounts, their subscriptions, payment transactions and
API tokens, and the owner account too — but only when that owner owns no
other store.

Two guards:

- `confirmation` must equal the literal string `DumosRx`. It is validated
  server-side, so a direct API call cannot skip the friction the dialog
  imposes; the dialog's Delete Forever button stays disabled until the
  phrase matches exactly.
- Every archive/restore/purge route carries `role:super_admin` in
  `routes/api.php`, on top of the group's `permission:manage_platform`. The
  UI hides the menu entries for other roles purely to avoid dead items.

SQLite ignores `PRAGMA foreign_keys` inside an open transaction, so the
purge suspends constraints *around* its transaction rather than inside it.

## Store detail metrics

`AdminStoreDetailService` returns profile, owner, subscription, account
manager, sync, storefront, payments, counts, recent transactions and recent
activity. `AdminStoreMetricsService` (a separate class, for the file-size
rule) adds two blocks:

- `business_metrics` — lifetime revenue, order count, average order value,
  trading days, first/last sale, revenue and order growth against the prior
  30-day window, and a six-month revenue trend.
- `operational_metrics` — staff count, registered device and device id,
  active API sessions, inventory (products, categories, suppliers,
  customers), stock movement and stock audit activity (total and last 30
  days), last-active timestamp and a sync-health label.

Every sales figure goes through the same store scoping as
`AdminStoreService::revenueSubquery()` (`sales.store_id` when present,
legacy cashier match when null) so the detail page can never quote a
different revenue than the fleet list.
