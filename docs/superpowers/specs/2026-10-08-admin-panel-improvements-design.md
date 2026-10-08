# Admin Panel Improvements — Design

**Date:** 2026-10-08
**Scope:** `web/` admin panel + the `laravel-server/` endpoints it reads
**Status:** Approved design, pending implementation plan

## Intent

A batch of owner-reported usability defects in the platform admin panel,
collected in one pass. The unifying complaint is **surface inconsistency**:
the same object (a store, a user) behaves differently depending on which
screen you reached it from, actions available in a list vanish on the detail
page, and several surfaces render in a neutral grey that does not match the
panel's blue-slate design language.

Success means: one store has one detail page reachable the same way from
everywhere, with the same actions available on it as in the fleet list; the
users directory is organised by who the account *is* rather than by a role
dropdown; destructive bulk cleanup of test data is possible without clicking
through N dialogs; and no admin surface renders grey.

Two items turned out to be misreported and are specified as what they
actually are, not as the reporter described them — see §5.1 (staff sync) and
§7.2 (user deletion is not permanent).

## Decisions taken before writing this spec

| Question | Decision |
|---|---|
| Users page tabs / role filter | Three tabs (Store Owners / Staff / Platform Team); role filter rendered only on Platform Team |
| Referrer reassignment vs. commissions | Forward-only. Sets the attribution field and writes an audit entry; the referral credit ledger is never rewritten |
| Bulk delete mechanism | Client-side sequential loop over the existing audited single-item endpoints, with a typed confirmation. No new bulk backend endpoints |
| Table sorting | Server-side `sort`/`direction` params, not client-side sorting of the current page |
| Grey-surface remediation | Admin-scoped shared variants for repeating surfaces + per-usage overrides for one-offs. The global `--card`/`--muted` tokens are **not** retuned |
| Staff sync display | Fix the display now; real staff-identified sync is out of scope |

---

## 1. Navigation: one store, one detail page

### 1.1 Overview → Recent Stores

`web/components/admin/dashboard/recent-stores.tsx` currently calls
`setSelectedStore(store)` on row click, opening
`web/components/admin/dashboard/store-dialog.tsx` as a modal. The row click
becomes `router.push(adminStoreDetailPath(store.id))` instead, using the
existing helper in `web/lib/admin-routes.ts`.

`StoreDialog` is mounted only on `web/app/admin/page.tsx` (verified: no other
importers). With its last caller gone it is deleted along with the
`selectedStore` state on that page. The doc comment on `adminStoreDetailPath`
mentions "the dashboard's Recent Stores dialog" and is updated in the same
change.

### 1.2 Users directory → parent store

The `Parent Store` cell in `web/components/admin/users/user-table.tsx` becomes
a link to `adminStoreDetailPath(user.store_id)`, rendered only when
`store_id` is present (platform accounts show the literal `"Platform Admin"`
with no id). The row's action dropdown must keep working: the kebab cell's
handler calls `stopPropagation()` so the cell link never swallows it.

**Constraint:** the link is on the store cell only, not the whole row. A
whole-row link to the *store* from a *user* row is a surprising target, and
the row's own primary action is "View Detailed Profile".

---

## 2. Users page restructure

### 2.1 Naming

`web/components/admin/sidebar-items.ts:36` and the page `<h1>`: "Platform
Users" → "Users". The tab labels now carry the distinction the old title was
trying to make.

### 2.2 Three tabs

`ACCOUNT_TYPE_TABS` in
`web/components/admin/users/user-directory-filters.ts` gains a third entry
between the two existing ones:

```
owners   → "Store Owners"   → accounts that own a store
staff    → "Staff"          → accounts employed by a store
platform → "Platform Team"  → super admins, platform admins, agents
```

The backend already supports this: `AdminUserService::constrainToAccountType()`
handles `ACCOUNT_TYPE_STAFF` (`whereNotNull('store_id')->whereDoesntHave('stores')`),
and `ROLE_LABELS_BY_ACCOUNT_TYPE` already has a `staff` key (currently an
empty array). No new endpoint.

The `ROLE_FILTER_SLUGS` doc comment currently states that staff accounts "are
no longer listed in the Platform Users directory at all". That statement
becomes false with this change and is rewritten, and `web/AGENTS.md`'s
corresponding claim is corrected in the same change (§2 of the root
`AGENTS.md`: docs ship with the code).

**Staff tab grouping.** Staff rows are grouped under their store, with the
store name as a group header linking to that store's detail page. Grouping is
applied to the rows of the current page only — it is a presentational grouping
of a flat paginated list, not a server-side aggregate — and the tab carries a
store filter so an admin can narrow to one store directly. The group header
states the count of staff shown for that store on this page, worded so it
cannot be misread as the store's total staff.

### 2.3 Role filter visibility

The role dropdown renders only when `accountType === "platform"`. On Store
Owners it offered one meaningful option; on Staff it would offer the same.
`ROLE_LABELS_BY_ACCOUNT_TYPE.owners` and `.staff` become unused by the filter
UI but stay as the source for role *labels* elsewhere.

The existing block comment in `web/app/admin/users/page.tsx` explaining why
there is no billing-plan filter section is migrated into this spec rather than
carried along (root `AGENTS.md` §3). Reason it existed: `getGlobalUsers()`
accepts only `search`/`role`/`account_type`/`store_id`, and a plan lives on
the store, not the user, so plan filtering belongs on the Store Fleet list —
which already has it.

### 2.4 Context-sensitive primary action

| Active tab | Primary button |
|---|---|
| Store Owners | "Register Store" → `/admin/stores/new` |
| Staff | none |
| Platform Team | "Add Platform Admin" → `/admin/users/new` |

"Register Store" stays gated on `create_accounts` and "Add Platform Admin" on
super admin, both hidden rather than disabled when the caller lacks the
permission, per `web/AGENTS.md`.

### 2.5 Notify All moves to Communications

The "Notify All" button is removed from the users page. The endpoint
(`POST /admin/users/bulk-notify`, `permission:send_notifications`) and
`web/components/admin/users/bulk-notify-dialog.tsx` are **kept** and surfaced
from Communications → In-App Broadcasts (`web/components/admin/views/broadcasts-tab.tsx`),
which is where audience-wide messaging already lives.

The dialog currently receives its audience as the users page's live filter
state (`account_type`, `role`, `search`). Relocated, it has no ambient filter
to inherit, so the Communications entry point presents an explicit audience
selector built from the same three parameters and shows the resolved recipient
count before sending. **This is the one piece of genuinely new UI in the
item** — a bulk notify with an invisible or implicit audience is how an
accidental platform-wide send happens.

With the button gone, the Export button is no longer competing for header
width on mobile and shows its text label at all breakpoints.

### 2.6 Export label

"Export this page (n)" → "Export (n)", on both the users page and
`web/app/admin/stores/page.tsx`. The count already communicates the scope.

### 2.7 Bulk user delete

Row checkboxes with a header select-all (current page only), and a bulk action
bar that appears when a selection exists. Gated on super admin, matching the
existing single-row "Delete Account".

Execution: sequential `DELETE /admin/users/{id}` calls over the selection, one
at a time, with a progress indicator and a per-item result list so a partial
failure names exactly which accounts survived. No new endpoint; every deletion
stays individually audited by `AdminUserService::deleteUser()`'s `ActivityLog`
write.

**Confirmation.** The single-row dialog requires typing the target's email
back, which does not scale to a selection. The bulk dialog instead requires
typing the literal `"DumosRx"` and states the exact count and the effect
described in §7.2. That literal already exists as
`STORE_PURGE_CONFIRMATION` in `web/lib/api/admin-hooks-stores.ts`, where it
also has to match the server-side validation on the purge endpoint. Rather
than have a users dialog import a store constant, it is re-exported under a
neutral name from a shared module that both the store and user flows consume,
so the two confirmations cannot drift to different words.

**Selection guards.** The viewer's own account and other super-admin accounts
are not selectable. This is a UI guard over a backend gap — see §7.1.

### 2.8 Edit Profile in the row menu

"Edit Profile" is added to the kebab menu in `user-table.tsx`, opening the
existing `web/components/admin/users/user-profile-edit-form.tsx` directly
rather than requiring a trip through the profile dialog. The form and its
mutation are reused unchanged; only a second entry point is added.

---

## 3. Stores page

### 3.1 Demo filter

`AdminStoreService::getStores()` (`laravel-server/app/Services/Admin/AdminStoreService.php:103`)
gains a `$demo` parameter alongside the existing `$status`/`$plan`/`$archived`,
accepting `all` (default, no filter), `only` (`where('is_demo', true)`) and
`exclude` (`where('is_demo', false)`). The `is_demo` column already exists and
is already projected into both list mappings.

`web/components/admin/stores/store-toolbar.tsx` gains a matching "Demo"
section in its filter dropdown, following the exact shape of the existing
`ARCHIVED_SCOPES` block, and the filter is counted in the toolbar's active
filter badge and cleared by "Clear Filters".

### 3.2 Bulk permanent store delete

Row checkboxes and a bulk action bar as in §2.7, super admin only.

Execution: sequential `DELETE /admin/stores/{id}/purge`, each carrying the
`confirmation: "DumosRx"` body the endpoint validates server-side
(`AdminStoreDeletionController.php:118`). Progress and per-item results as
above; `assertPurgeAllowed()` rejections (own store, platform-owned store)
surface per item with their message rather than aborting the run.

Confirmation: the existing `PurgeStoreDialog` typed-confirm pattern, extended
to name the count and list the selected store names. The dialog must state
what the purge actually removes, which is more than the store — see §7.3.

**Ordering note for the implementation plan:** purges run sequentially, never
concurrently. `purgeRows()` takes `lockForUpdate()` on the owner's stores and
suspends foreign-key constraints around its transaction; overlapping purges
are not a tested configuration.

### 3.3 Store detail page action parity

The reported defect: the fleet row kebab offers impersonate, billing history,
activity log, grant trial, activate plan, demo toggle, suspend/unsuspend,
archive/restore and purge, and none of them are available on the store's own
detail page.

`web/app/admin/stores/page.tsx` is already 320 lines and holds all of those
handlers inline. Rather than duplicating them onto the detail page, the
handler bundle is extracted into a shared hook (`web/hooks/use-store-actions.ts`)
owning the mutations, toasts, dialog open state and `pendingStoreId`
derivation. Both the fleet page and the detail page then consume that hook and
render the existing `StoreRowActions` menu and `StoreDialogHost`.

This keeps both surfaces on one set of mutations by construction, and brings
`stores/page.tsx` back under the 350-line limit instead of pushing a second
file over it.

`StoreRowActions` currently takes an `AdminStoreSummary`. The detail page has
an `AdminStoreDetail`. The hook's surface is typed against the fields the
actions actually use (`id`, `name`, `status`, `is_demo`, `is_archived`) so
both types satisfy it without a cast or a second component.

---

## 4. Store detail: contact specialist and referrer

### 4.1 Contact specialist card → display + edit mode

`web/components/admin/stores/details/account-manager-card.tsx` currently
renders a permanently-live `<Select>` with a "Save Assignment" button, so the
card reads as an unsaved form even when nothing is being changed.

It becomes: a read-only display of the resolved specialist (name, role,
contact details, and whether the assignment is explicit or inherited via
referral/default) with a pencil button that reveals the select plus
Save/Cancel. Cancel restores the last saved value. The existing
`resolvedManagerId` sync-on-prop-change logic is retained for the edit state.

### 4.2 Referrer reassignment

New: `PUT /admin/stores/{id}/referrer`, super admin only, alongside the
existing `PUT /admin/stores/{id}/account-manager` (`routes/api.php:246`).

It sets `users.referred_by_id` on the store's **owner** (the referral
attribution lives on the user, not the store — `User::referredBy()`,
`User.php:348`) and writes an `ActivityLog` entry naming the previous and new
referrer and the acting admin.

It does **not** touch referral credits, commission transactions or any
existing ledger row. Attribution changes from this point forward only. The
dialog copy states this explicitly, so nobody expects reassignment to
retroactively move earned commission.

Candidate referrers reuse the `useAccountManagerCandidates()` source, which
already lists platform accounts that can hold this kind of relationship.

**Coupling to be surfaced in the UI.** `AccountManagerCard` resolves an
implicit contact specialist *via the referral* when none is explicitly
assigned (`store.account_manager_is_explicit === false`). Reassigning the
referrer therefore silently changes the resolved contact specialist for those
stores. The referrer dialog warns when this is the case, and the two cards sit
adjacent on the detail page.

---

## 5. Store detail: staff sync display

### 5.1 Root cause (reported as "always shows never synced")

This is not a display bug. `user_devices` rows are written only by
`UserDeviceTracker::touch()`, called from `SyncController`'s `push()`,
`pull()` and `counts()` — i.e. attributed to whichever account's bearer token
performed the sync. The Tauri client holds one cloud token per linked device
(`client/lib/api/token-manager.ts`), established when the store is linked;
staff authenticate locally against SQLite and never call the sync endpoints
under their own identity.

Consequently staff users have no `user_devices` rows at all, and
`AdminUserService.php:222` correctly returns `null` → the UI's "Never synced".
It is accurate for every staff member and always will be, under the current
architecture.

### 5.2 Fix

`web/components/admin/stores/store-staff-list.tsx` stops presenting a
per-staff sync line as a fact about that person. Instead:

- Where a `user_devices` row genuinely exists, the existing
  `Synced {when} · {device}` line is kept.
- Where it does not, the row shows no sync line at all, rather than "Never
  synced" — absence of a device record is not evidence the person never
  worked.
- The card gains one line of context stating that sync is recorded per device
  against the linking account, with the store's own sync state available on
  the Store Sync card already present on the same page.

`StaffDeviceHistory` is unaffected: it is an on-demand drill-down that
correctly shows nothing when there are no devices.

### 5.3 Out of scope

Real per-staff sync visibility requires staff-identified sync calls — a
sync-engine and client-auth change spanning `client/` and `laravel-server/`.
Not attempted here. Logged in `docs/KNOWN_BUGS.md` as a known limitation with
this spec's §5.1 as the explanation.

---

## 6. Cross-cutting: sortable headers and grey surfaces

### 6.1 Server-side sorting

`client/components/ui/sortable-header-cell.tsx` is ported to
`web/components/ui/sortable-header-cell.tsx` (the two apps do not share a
component package), keeping the same click-to-sort, click-again-to-flip
interaction and indicator icons so the two products feel the same.

Backend: `sort` and `direction` query params on the admin stores and users
list endpoints. Sort columns are resolved through a **strict allow-list**
(`match` in PHP, a `Map` in TypeScript) — never a dynamic lookup keyed by the
raw param, per root `AGENTS.md` §8's prototype-pollution rule, and because an
unvalidated `sort` param reaching `orderBy()` is a SQL injection surface. An
unrecognised value falls back to the current default (`latest()`) rather than
erroring.

Allow-listed columns, chosen as the ones backed by a real column or an
existing select expression:

- **Stores:** name, created_at, status, total_revenue (already an
  `addSelect` subquery, so it is sortable without new joins)
- **Users:** email, created_at, last_login_at, role, and name via
  `first_name`/`last_name` (two columns, ordered in that order)

Three visible columns are deliberately **not** sortable, because each is
computed after the paginated query returns and sorting by it would reorder
only the current page — which reads as broken rather than as unsupported:

- `plan` on stores — derived in PHP from the owner's latest subscription
  (`AdminStoreService.php:161`), not a column on `stores`
- `owner` on stores — a `first_name`/`last_name` concatenation across the
  `user` relation; sortable only by adding a join or correlated subselect
- `last_sync` on users/staff — comes from the post-query
  `latestDevicePerUser()` lookup, not from the paginated query

Their headers render as plain, non-interactive headers. A header that looks
sortable and sorts one page is worse than one that does not offer it.

Sort state resets to page 1 on change and is held alongside the existing
filter state.

Scope: the stores and users tables. Products, subscriptions and activity keep
their current ordering; extending the same pattern there is a follow-up.

### 6.2 Grey surfaces

**Root cause.** `web/app/globals.css:66,74` defines `--card` and `--muted` as
zero-chroma greys (`oklch(1 0 0)` / `oklch(0.97 0 0)` light,
`oklch(0.205 0 0)` / `oklch(0.269 0 0)` dark). The admin panel's own surfaces
are blue-tinted slate. Anything inheriting the shadcn defaults therefore
renders visibly off against its neighbours:

| Primitive | Default | Reported symptom |
|---|---|---|
| `components/ui/tabs.tsx:29` | `bg-muted` | Marketing hub tabs, platform settings tabs, activity tabs, subscription bucket tabs |
| `components/ui/table.tsx:60` | `hover:bg-muted/50` | Coupons & trials row hover |
| `components/ui/skeleton.tsx:7` | `bg-muted` | User feedback tab loading skeleton |
| `components/ui/card.tsx:10` | `bg-card` | Card surfaces generally |

Plus 25 explicit `bg-muted`/`border-border`/`bg-accent` usages across
`web/app/admin` and `web/components/admin`.

**Approach (chosen: admin-scoped variants, not token retuning).** The `ui/*`
primitives are shared with the marketing site and the store-owner dashboard,
so retuning `--card`/`--muted` globally would shift two other products to fix
one. Instead:

1. Admin-scoped shared variants for the surfaces that repeat — a tab-rail
   variant (`bg-slate-100 dark:bg-slate-800` rail, `bg-white dark:bg-slate-900`
   active trigger, matching the hand-rolled rail already in
   `app/admin/users/page.tsx`), a table row-hover class constant
   (`hover:bg-slate-50 dark:hover:bg-slate-800/50`, matching `user-table.tsx`)
   and an admin skeleton variant. Defined once and consumed by the admin
   surfaces, so a new admin tab rail cannot reintroduce the grey by default.
2. Per-usage overrides for the one-off `bg-muted/50` panels, `border-border`
   borders and `bg-muted` badges in the 25 sites listed above, using the house
   card/surface classes from root `AGENTS.md` §6.
3. `globals.css` gains the missing `no-scrollbar` utility — **it is currently
   used at `app/admin/settings/[[...tab]]/settings-client.tsx:44` and is not
   defined anywhere, so that tab rail's scrollbar-hiding has never worked** —
   plus a slate-tinted thin-scrollbar utility applied to the admin sidebar's
   `overflow-y-auto` nav (`components/admin/admin-sidebar.tsx:50`), which is
   currently browser-default.

Root `AGENTS.md` §6 is extended with the tab-rail and row-hover house values,
for the same reason the card rule is already written there: this exact drift
has happened before and was caught by the owner rather than by review.

---

## 7. Defects found while surveying, specified as part of this batch

These were not reported. They sit directly under the reported items and are
either prerequisites for them or would make the reported fixes misleading.

### 7.1 `deleteUser()` has no self-deletion or super-admin guard

`AdminUserService::deleteUser()` (`AdminUserService.php:412`) deletes whatever
id it is given. There is no check that the target is not the acting admin, and
none that it is not another super admin. Today the only friction is the
dialog's type-the-email step — a client-side guard on a destructive
super-admin endpoint.

Bulk delete (§2.7) makes this materially worse: one select-all could include
the operator's own account.

**Fix:** guard in the service, mirroring the shape
`AdminStoreDeletionService::assertPurgeAllowed()` already uses — refuse when
`$id === Auth::id()`, and refuse when the target's role is in
`PLATFORM_ROLES` unless some explicit escalation is added later. Covered by
Pest tests. The UI selection guard in §2.7 stays as well; both layers.

### 7.2 "Delete Account" is not a permanent deletion

`User` and `Store` both use `SoftDeletes`. `deleteUser()` calls
`$user->delete()` and `$store->delete()` — both soft. But
`delete-user-dialog.tsx` says the account "erases the user's stores, sales and
products irreversibly" and its success toast says "account and all associated
data have been permanently deleted". Both are false: the rows remain.

**Correction to an earlier draft of this spec.** This section previously
claimed the soft-deleted user's email "stays taken". That is wrong, and the
error was caught in review of the §7.2 fix itself. `User::boot()`'s `deleting`
hook (`app/Models/User.php:325-334`) fires on every soft delete and suffixes
both `email` and `username` with `_del_<timestamp>`, then saves. So a soft
delete **does** free the original email and username for reuse.

What this means for the stated goal behind §2.7 — clearing out test accounts:
bulk-deleting them DOES free their email addresses, but leaves their rows in
place (soft-deleted). It is therefore more useful for that cleanup than the
earlier draft of this spec claimed, while still not being the data removal
that store purge (§3.2) performs.

**Also relevant:** there is no user-restore path in the admin panel. Only
`POST /admin/stores/{id}/restore` exists; no equivalent route, handler or
button exists for users, so a soft-deleted account can only be brought back
by direct database access. Copy must not promise a restore the UI cannot
deliver.

**Fix:** correct the copy on the single and bulk dialogs to describe what it
actually does — archives the account and the stores it owns, signs everyone
out so those stores stop syncing, retains the records, frees the email for
reuse, and offers no one-click undo — and point at store purge (§3.2) as the
operation that genuinely removes data. The copy must also avoid the verb
"deactivate", which already names a distinct, less destructive action sitting
directly above Delete in the same row menu (`deactivateUser()` sets
`is_active = false` only and is reversible via Reactivate).
`docs/ADMIN_STORE_LIFECYCLE.md` is checked for the same inaccuracy and
corrected if present.

### 7.3 Store purge removes the owner and staff accounts too

`purgeRows()` hard-deletes the store's staff users, and hard-deletes the
**owner** when that store was their only one
(`$ownerIsSolelyThisStore`). `PurgeStoreDialog`'s copy mentions "its staff
accounts" but not the owner.

**Fix:** the single and bulk purge dialogs state that the owner account is
removed when the store is their last one. This is also the answer to "I want
to wipe test stores": purge, not user delete, is the operation that does it.

### 7.4 `standardizeCatalog()` does not do what its label says

`AdminCatalogService::standardizeCatalog()` (`AdminCatalogService.php:112`) is
two unscoped mass `UPDATE`s: `generic_name` → `'General'` and `manufacturer`
→ `'Unknown'` where blank. No dedupe, no name normalisation — despite the
OpenAPI summary at `AdminPlatformController.php:97` claiming "dedupe/normalize
product names", and despite the disabled per-row "Standardize Entry" item
implying a per-product equivalent.

Three problems: it is cross-tenant with no store scoping; it is irreversible
with no record of which values were backfilled, so a real "Unknown"
manufacturer becomes indistinguishable from a placeholder; and because
Eloquent's builder `update()` bumps `updated_at`, every touched row re-pulls
to every client on its next incremental sync — platform-wide, potentially the
entire catalogue of every store at once. (PHP generates the timestamp in UTC,
so root `AGENTS.md` §7's MySQL clock gotcha does not apply here. The pull
volume does.)

**Fix in this batch:** honest dialog copy naming the two field backfills and
the resync consequence; a dry-run that reports the affected row count before
anything is written; optional store scoping so it can be run per store rather
than platform-wide; and a corrected OpenAPI summary. The sync blast radius is
logged in `docs/KNOWN_BUGS.md` regardless of how much of the rest lands.

---

## 8. Testing

**Pest (`laravel-server/`)**

- `deleteUser()` refuses to delete the acting admin; refuses another super
  admin; still deletes an ordinary owner (§7.1)
- `getStores()` `demo` param: `only` / `exclude` / default (§3.1)
- Sort params: each allow-listed column orders correctly; an unrecognised or
  hostile `sort` value falls back to the default and never reaches `orderBy()`
  (§6.1)
- `PUT /admin/stores/{id}/referrer`: sets `referred_by_id`, writes the
  `ActivityLog` entry, rejects non-super-admin, and **leaves referral credit
  rows untouched** (§4.2)
- `standardizeCatalog()` dry-run reports a count without writing (§7.4)

**Vitest (`web/`)**

- Staff list renders no sync line when `lastSyncedAt` is null, and the real
  line when it is present (§5.2) — pins the regression so "Never synced"
  cannot come back silently
- Role filter renders only on the Platform Team tab (§2.3)
- Primary action button per tab (§2.4)
- Bulk selection excludes the viewer's own account and other super admins
  (§2.7)
- Bulk delete reports per-item failures without aborting the run (§2.7, §3.2)
- Contact specialist card starts in display mode; pencil reveals the select;
  cancel restores the saved value (§4.1)

**Browser smoke test (not optional).** Root `AGENTS.md` §9: this change spans
a backend permission model and a frontend that renders around it (tab
visibility, super-admin-gated bulk bars, hidden-not-disabled buttons). A real
logged-in pass over the users page, stores page and one store detail page is
part of this work, not a follow-up — as a super admin and as a non-super-admin
platform admin.

**Schema.** No new tables or columns, so `npm run test:schema` is unaffected.
`referred_by_id` and `is_demo` already exist on both sides.

## 9. Documentation to update in the same change

Per root `AGENTS.md` §2, docs ship with the code:

- `web/AGENTS.md` — three-tab users directory; the staff-accounts-not-listed
  claim is now false; the shared store-actions hook; admin surface class
  variants
- `laravel-server/AGENTS.md` — the referrer endpoint; the `demo` and sort
  params; the `deleteUser()` guards; the per-device sync section gains §5.1's
  explanation of why staff have no device rows
- Root `AGENTS.md` §6 — tab-rail and table-row-hover house values
- `docs/KNOWN_BUGS.md` — the `standardizeCatalog()` sync blast radius (§7.4)
  and the staff-sync architectural limitation (§5.3)
- `docs/ADMIN_STORE_LIFECYCLE.md` — checked and corrected if it repeats the
  "permanent deletion" inaccuracy (§7.2)
- `docs/FIXED_BUGS.md` — entries for §7.1–§7.3 as they land, removed from
  `KNOWN_BUGS.md` outright if any are already logged there

## 10. Out of scope

- Staff-identified sync calls (§5.3)
- Retroactive referral commission recalculation (§4.2)
- Sortable headers on products, subscriptions and activity (§6.1)
- New transactional bulk endpoints (decision: client-side loop)
- Retuning the global `--card`/`--muted` tokens (decision: admin-scoped
  variants)
