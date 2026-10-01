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

- the store-name cell's `<a href>` (the primary "view" action, and the
  keyboard-operable one),
- the kebab's "View Store Details" item,
- the dashboard's Recent Stores dialog "View Full Profile" button.

That last one used to push `/admin/stores?search=<uuid>`, landing on the
fleet list pre-filtered by id instead of the store itself.

The `<tr>` keeps its native `role="row"`: a row carrying `role="link"`
destroys the table's semantics for assistive technology and makes the kebab
an interactive control nested inside a link. The link affordance lives on
the store-name cell instead, as a real anchor, so keyboard and screen-reader
users get a normal link with a real target. The row's own `onClick` stays as
a mouse-only convenience.

Because the row still navigates on click, the kebab's whole table cell stops
`click` and `keydown` propagation. Any new interactive control added to a
row must sit inside a cell that does the same, or it will navigate as well
as doing its own job.

## Archive (soft delete)

`DELETE /admin/stores/{id}` sets `stores.deleted_at` (plus `deleted_by_id`
and an internal `deletion_reason`). `Store` uses `SoftDeletes`, so an
archived store disappears from the fleet list and every other Store query.
Nothing is removed and `POST /admin/stores/{id}/restore` puts it back. The
fleet's Filters menu has an Archived section (`active` / `only` / `all`)
which maps to the endpoint's `archived` query parameter.

Hiding the row is not enough to stop the store working, because the sync
endpoints resolve their tenant scope from `users.store_id` and never load
the `Store` model. Archiving therefore **revokes every `personal_access_token`
belonging to the owner and the store's staff**, the same revocation the purge
performs. Restoring does not re-issue them; everyone simply logs in again.

`CheckAccountStatus` resolves the store with `withTrashed()`. Without it a
soft-deleted store returned `null` and the suspension check was skipped
entirely, so archiving a *suspended* store un-suspended it at the API level.
The middleware now also returns `403 STORE_ARCHIVED` for any session that
still holds a valid token when its store is archived, instead of leaving the
owner with silent empty pulls and rejected pushes.

`AdminUserService::deleteUser()` archives the owner's stores as a side effect
of soft-deleting the owner. It stamps `deleted_by_id` and a
`deletion_reason` naming the deleted owner, and `restoreStore()` refuses
(422) to restore a store whose owner is still soft-deleted — otherwise a
restore would put a live store back in the fleet with no owner.

## Restore puts the store back exactly as it was — suspension included

Archiving does not clear `stores.status`, so a store suspended before it was
archived comes back suspended, and `CheckAccountStatus` keeps 403-ing its
owner and staff after a restore that looked successful. That used to be
silent (A-41). `POST /admin/stores/{id}/restore` now answers with
`was_suspended`, `suspension_reason` and an admin-facing `warning` string
(`AdminStoreDeletionService::restoreWarnings()`), the `STORE_RESTORED`
activity row repeats the suspension in its description, and the fleet page's
restore action shows a warning toast instead of "is active again" whenever
`was_suspended` is true. Unsuspending is still a separate, deliberate act.

**If `stores.store_slug` or `stores.device_id` uniqueness is ever made
soft-delete-aware** (unique only among non-archived rows, which is what
reclaiming an archived store's slug would require — see A-93 in
`docs/FIXED_BUGS.md`), `restoreStore()` needs an explicit collision check
added at the same time: another store could legitimately have taken the
archived store's slug or device id in the meantime, and the restore would
then fail on the unique index, or succeed into a duplicate. With today's
unconditional unique indexes that collision cannot happen, so no check
exists.

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

Three guards:

- The purge is refused (422) when the store's owner holds a platform role
  (`super_admin`, `platform_admin`, `agent`) or is the acting admin's own
  account. Both used to proceed and then fail partway through on the
  activity-log foreign key.

- `confirmation` must equal the literal string `DumosRx`. It is validated
  server-side, so a direct API call cannot skip the friction the dialog
  imposes; the dialog's Delete Forever button stays disabled until the
  phrase matches exactly. `TrimStrings` is skipped for this route
  (`AppServiceProvider`), otherwise `" DumosRx"` would pass server-side
  while the dialog rejected it, and the "exact match" claim would only be
  true in the UI.
- Every archive/restore/purge route carries `role:super_admin` in
  `routes/api.php`, on top of the group's `permission:manage_platform`. The
  UI hides the menu entries for other roles purely to avoid dead items.

SQLite ignores `PRAGMA foreign_keys` inside an open transaction, so the
purge suspends constraints *around* its transaction rather than inside it.
Suspending them also suspends every `ON DELETE CASCADE` / `SET NULL` the
schema does declare, on MySQL and SQLite alike, so deleting the owner and
staff used to leave dangling `notifications`, `permission_user`,
`coupon_usages` and `activity_logs` rows and dangling
`account_manager_id` / `referred_by_id` / `registered_by_id` pointers on
*other* users. `ForeignKeyCascadeEmulator` replays those declared actions in
PHP, reading them from `Schema::getForeignKeys()`, so a foreign key added
later is covered without editing it.

The purge also deletes **legacy sales with a null `store_id`** whose
`cashier_id` is the owner or one of the store's staff, plus their cascade
children. Those are the rows the fleet's own revenue query attributes to
this store; left behind, they silently reattribute the purged store's
revenue to whichever other store the surviving owner still has.

The owner's "does this account own any other store?" check and the staff-id
read both happen **inside** the transaction, with `lockForUpdate()` on the
owner's `stores` rows, so a store created concurrently for the same owner
cannot slip past the guard. SQLite compiles the lock clause away and
serializes writes anyway, so tests are unaffected.

## The audit trail is part of each action, not a follow-up to it

All three actions write their `ActivityLog` row **inside** the same
`DB::transaction()` that performs the change, and every row carries
`store_id` as well as `user_id`:

- `STORE_PURGED` used to be written after the purge transaction had already
  committed, so an audit-log insert that failed for any reason (a full disk,
  a constraint, a transient connection error) left the whole store
  irreversibly deleted with no record of who did it or why (A-40). The
  purge's deletions now live in `purgeRows()` and the log write is the last
  statement of the transaction that calls it — the early `return` in the
  deletion body is exactly why the split is needed.
- `STORE_ARCHIVED` / `STORE_RESTORED` used to omit `store_id`, so the store's
  own activity view (`/admin/activity?store_id=`) never showed that it had
  been archived or restored; only the global admin feed did.

Covered by `tests/Feature/Admin/AdminStoreLifecycleAuditTest.php`, which
fails the `STORE_PURGED` insert from a model event and asserts the store and
its owner are still there.

## Store detail metrics

`AdminStoreDetailService` returns profile, owner, subscription, account
manager, sync, storefront, payments, counts, recent transactions and recent
activity. `AdminStoreMetricsService` (a separate class, for the file-size
rule) adds two blocks:

- `business_metrics` — lifetime revenue, order count, average order value,
  trading days, first/last sale, revenue and order growth against the prior
  30-day window, and a six-month revenue trend.
- `operational_metrics` — staff count, registered device and device id,
  active API sessions (unexpired, impersonation tokens excluded),
  inventory (products, categories, suppliers, customers), stock movement
  and stock audit activity (total and last 30 days), last-active timestamp
  and a sync-health label.

Every sales figure goes through the same store scoping as
`AdminStoreService::revenueSubquery()` (`sales.store_id` when present,
legacy cashier match when null) so the detail page can never quote a
different revenue than the fleet list.

"Trading days" counts distinct days on the **store's own clock**, matching
`Store::localDayRangeUtc()`'s definition of a day, rather than the UTC date
of a UTC-stored `created_at`. The SQL applies the store's current UTC offset
per driver; the only rows it can place on the wrong day are ones recorded
across a DST switch, in the zones that have one.
