# Dashboard Migration — Step 3: Feature Migration (Staff, Fleet, Billing into `client/`)

**Status:** Approved design, not yet planned/implemented.

**Context:** This is Step 3 of the dashboard-consolidation migration described in `docs/superpowers/plans/2026-08-24-dashboard-migration-phase1-handoff.md` ("Steps 3–7: feature migration, nav consolidation, dashboard deletion, redirects"). Phase 1 (Steps 1–2, that doc) made `web/` (dumosrx.com) stop authenticating anyone and redirect all login/CTA entry points to `client/` (app.dumosrx.com), plus built a cross-origin handoff mechanism so admin impersonation still works. It explicitly did **not** touch `web/`'s own dashboard (`web/app/dashboard/**`) — that code is still live, still reachable by anyone who already has a session or bookmark, and still the only place three features exist: Staff management, Store Fleet management, and Subscription/Billing.

**Goal of this step:** Build real, working equivalents of those three feature areas inside `client/`'s dashboard, so that `web/`'s copies become genuinely redundant. This step does **not** delete `web/`'s dashboard, touch its nav, or add redirects — that's Steps 4–6 (nav consolidation, dashboard deletion, redirects), each to be scoped separately once this lands, per the same incremental pattern Phase 1 used.

**Out of scope for this step:**
- Deleting or modifying any file under `web/app/dashboard/**` or `web/components/dashboard/**`.
- Nav changes in `client/`'s sidebar (adding entry points to the new sections beyond the Settings tabs described below counts as Step 4, not this step) — the three new sections land as Settings tabs/sub-sections only.
- Cloud email+password (dual local-PIN + cloud-login) auth for staff members — confirmed out of scope; the existing client-side email field on a staff record stays as-is (informational only), no password field is added.

---

## Architecture: three different sync strategies, chosen per area

`client/` is offline-first (local SQLite + a sync engine, `client/lib/db/sync-engine/`) because its core job — POS, inventory, prescriptions — must keep working without a network connection. `web/`'s dashboard, by contrast, was always fully online. This step does not treat "offline-first" as a blanket default; each of the three areas gets the strategy that matches whether it actually needs offline access:

- **Staff**: local-first. Staff PIN login at the register must keep working through a network outage, so this area keeps using the local SQLite `users` table client already has, and gets *wired into* the sync engine (which today has the right-shaped columns — `_synced`, `_version`, `_synced_at`, `_deleted` — sitting unused). This is completing an already-half-built integration, not building green-field.
- **Fleet** (store CRUD): online-only, direct API calls. Creating, editing, or deleting a store is an inherently connected, account-level action; there is no offline use case for it, and the existing read path (`getStores()`) already works this way.
- **Billing/Subscription**: online-only, direct API calls, same reasoning as Fleet — a plan change or payment cannot happen offline anyway.

All three call the same `laravel-server` endpoints `web/`'s dashboard already uses (`/staff`-scoped `users`, `/stores`, `/subscription/*`) — none of these are web-specific, confirmed during design research.

---

## A. Staff (`Settings > Staff`)

`client/`'s existing local staff feature (`client/components/settings/staff-management.tsx` + `staff/{staff-list,staff-form-dialog,staff-delete-dialog}.tsx`, backed by `client/lib/hooks/queries/use-users.ts` and the local SQLite `users` table, `client/lib/db/schema.ts:346-363`) already covers core CRUD (create/edit/delete, username/PIN/role) and has the same 5-role set as `web/` (`client/lib/constants/roles.ts` matches `web/`'s `ROLE_OPTIONS`). This step brings it to full parity and makes it actually sync.

### A1. Correction (found during plan drafting, 2026-08-25): `users` sync already works end-to-end

**This supersedes this section's original premise.** The design section above assumed the local `users` table needed to be wired into the sync engine, based on an earlier research pass that grepped sync-engine files for the literal string "users" and found nothing. That was a false negative: `client/lib/db/base-helpers.ts`'s `insert`/`update`/`softDelete` are table-agnostic and already queue every `users` write to `_sync_queue` (with a `users`-specific branch in `softDelete` to free unique constraints on delete); `client/lib/db/sync-engine/push.ts`/`pull.ts` are both table-agnostic with no allowlist; and `laravel-server/app/Http/Controllers/Api/App/SyncController.php` already lists `'users'` in its `$tables` array with extensive `users`-specific server-side handling (store-id assignment by role, duplicate email/username prevention, model resolution). Staff sync is fully built and working in both directions today.

Task A1 in the implementation plan is therefore a **regression test confirming this**, not new sync-engine integration work. The rest of this section (A2 onward, the 9 feature-gap closures) is unaffected by this correction.

### A2. Close the feature gaps (in the existing local components, not a rewrite)

| Gap | Where |
|---|---|
| Store filter (multi-store accounts) | `staff-management.tsx` — add a store-scoped dropdown, mirroring `web/`'s `?store_id=`-synced select |
| Stats cards (total/limit, active-now, role legend) | New `staff-stats.tsx`, replacing the current plain-text limit line |
| Export staff list | Button in `staff-management.tsx` |
| "Main Account" badge + owner-first sort | `staff-list.tsx` |
| PIN badge column | `staff-list.tsx` (currently username-only) |
| Active/Inactive badge + soft deactivate/reactivate | `staff-list.tsx` + `staff-delete-dialog.tsx` — the schema already has an unused `is_active` column; replace the current hard-delete-only flow with `is_active:false` (deactivate) + a reactivate action, matching `web/`'s `staff-view.tsx`/`staff-table.tsx` behavior |
| Activities/audit-log tab | New tab alongside the management list, pulling from the same `use-logs`-style infra other parts of `client/` already use for activity logging |
| Store-assignment field in the create/edit form | `staff-form-dialog.tsx` — currently hardcodes `store_id: activeStoreId` on create with no selector; add one, and allow reassignment on edit |
| PIN-change device-sync warning toast | `staff-form-dialog.tsx` — specific copy noting the PIN won't take effect on that staff member's terminal until it refreshes/restarts, matching `web/`'s `staff-modal.tsx:73-95` |

---

## B. Fleet (`Settings > Store Profile`, new sub-section)

The header's existing store switcher already handles *viewing* other stores in the fleet. This adds *managing* the fleet from Settings: list all stores, create, edit profile fields, delete. No per-store stock/activity/transaction tabs (unlike `web/`'s fleet detail view) — switching to a store via the header switcher already surfaces its live inventory/POS/activity, so duplicating those tabs in a management screen would be redundant, not just extra work.

**Files:**
- `client/lib/api/client.ts` — add `createStore`, `updateStore`, `deleteStore` (read path `getStores`/`checkStoreSlug` already exists).
- New section under the existing `store` Settings tab (`client/app/(dashboard)/settings/[tab]/settings-client.tsx`), alongside/replacing `client/components/settings/store/multi-store-card.tsx` (which today is just a link-out stub to `${WEB_APP_URL}/dashboard/stores` — becomes the real list/create/edit/delete UI).

---

## C. Subscription & Billing (new `Settings` tab)

New top-level Settings tab (own icon, e.g. `CreditCard`, added to `client/app/(dashboard)/settings/[tab]/settings-tab-nav.tsx` next to Staff/System). Contents, ported from `web/`'s billing view (`billing-view.tsx`, `subscription-plans.tsx`, `subscription-plan-card.tsx`, `subscription-card.tsx`, `subscription-status-alert.tsx`, `referral-tab.tsx`) as new `client/` components — not shared/copy-pasted, per the standing "defer shared package" decision from Phase 1:

- Current plan display + change-plan flow
- Billing history / invoices
- Coupon entry
- Referral program tab (confirmed in scope)

**Files:**
- `client/lib/api/client.ts` — add `getSubscriptionStatus`, `pay`, `getReferralStats`, `validateCoupon`, `verifyPayment`, `getBillingHistory` (none exist client-side today; `web/`'s versions in `web/lib/api/client.ts` are the interface reference).
- New `client/components/settings/billing/*` components for the above.

### Retarget existing alerts to the new internal tab

Four existing UI elements currently point at subscription/billing action inconsistently (found during design research — none of these currently point anywhere legitimate/consistent):

| Component | Current behavior | New behavior |
|---|---|---|
| `client/components/auth/license-guard.tsx` | "Renew Subscription" opens `${WEB_APP_URL}/dashboard/billing` in a new external tab | Internal navigation to the new Settings > Billing tab |
| `client/components/dashboard/locked-module-overlay.tsx` | "Upgrade Plan" opens `${WEB_APP_URL}/dashboard/billing` externally | Internal navigation to Settings > Billing |
| `client/components/dashboard/dashboard-action-center.tsx` | Expiry/trial cards route to `/settings/cloud`, a route that does not exist | Fixed to route to the new Settings > Billing tab |
| `client/components/settings/system-settings.tsx` | "Open Web Dashboard" card links to bare `${WEB_APP_URL}` root | Repointed to Settings > Billing (in-app); card copy updated since it no longer needs to send users to `web/` at all |

All four become in-app navigations; none should open an external tab to `web/` after this step.

---

## Error handling

- Fleet and Billing writes (create/edit/delete store; plan change, payment, coupon) are online-only: on network failure, surface a toast error and leave local state untouched — no optimistic local write, no offline queue (consistent with "no offline use case" from the architecture section).
- Staff sync failures (push/pull) follow whatever conflict/retry pattern the existing sync engine already uses for its other tables — no new sync semantics introduced.
- Payment/coupon flows surface server-provided error messages (already returned by the existing `/subscription/*` endpoints `web/` calls) rather than generic client-side messages, matching `web/`'s current behavior.

## Testing

- `client/` has Vitest configured (used in Phase 1's `handoff-client.test.ts`) — new API client methods (Fleet's three, Billing's six) get unit tests mocking `fetch`, same pattern as Phase 1's `createHandoffCode`/`consumeHandoffCode` tests.
- Sync engine changes for the `users` table get feature-level tests if the sync engine already has a test suite for its other tables (verify at implementation time; mirror whatever pattern exists there).
- UI components (staff gap closures, Fleet list/CRUD, Billing tab) are verified manually via `client && npm run dev`, consistent with how the rest of `client/`'s Settings UI is verified — no existing component-level UI test suite to extend.
- `web/` has no test runner (unchanged, confirmed in Phase 1); this step makes no `web/` changes anyway.

---

## Self-review

- **Scope check**: three areas (Staff, Fleet, Billing), each independent enough to plan/implement separately or in parallel — Fleet and Billing share no code and don't depend on Staff's sync-engine work. The cross-cutting piece (retargeting 4 alert components) depends only on Billing's new tab existing.
- **Consistency**: architecture section's "online-only for Fleet/Billing, local-first for Staff" is applied consistently in sections A/B/C — no section contradicts it.
- **Ambiguity resolved**: cloud dual-auth for staff — explicitly out of scope (confirmed). Referral program — explicitly in scope (confirmed). Fleet's per-store detail tabs — explicitly excluded with reasoning (redundant with the store switcher), not left ambiguous.
- **No placeholders remain.**
