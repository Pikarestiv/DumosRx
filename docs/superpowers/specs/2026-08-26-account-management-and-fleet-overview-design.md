# Dashboard Migration — Remaining Gap: Account Management + Fleet Overview

**Status:** Approved design, not yet planned/implemented.

**Context:** This closes a gap found while pre-flight-checking Step 5 (dashboard deletion) of the migration described in `docs/superpowers/plans/2026-08-24-dashboard-migration-phase1-handoff.md`. Step 3 (feature migration — Staff, Fleet CRUD, Subscription/Billing) already landed. Before `web/`'s dashboard (`web/app/dashboard/**`) can be safely deleted, every view it serves needs either a `client/` equivalent or a documented reason it's safe to drop. Auditing the remaining views (overview, store-details, downloads, notifications, profile, support) found:

- **Safe to drop, no port needed** (redundant with `client/`'s existing model): `store-details` (client's store switcher + live inventory/activity/reports already cover this), `notifications` (client's notification bell covers it), `support` (client's feedback form + system-settings support link cover it), `downloads` (client's own equivalent is `web/app/downloads`, a public page outside the dashboard tree — untouched by this spec).
- **Genuine gaps, need porting** (this spec): **Profile** (personal info edit, Sessions & Devices, account danger-zone) and **Overview** (cross-store fleet stats table + daily-summary email trigger).

**Out of scope for this spec:**
- Deleting any part of `web/`'s dashboard — that's a separate step once this lands.
- `web/`'s "Sessions & Devices" was initially assumed not to apply to `client/`'s single-device model; that assumption was wrong and corrected during design — confirmed research shows client's cloud login (`device_name: "Client App"`) creates a Sanctum token in the exact same `personal_access_tokens` table `web/`'s login does, and `web/`'s existing `SessionController::index` already lists (and can revoke) client's sessions with no origin filtering. This is a real, already-partially-cross-platform-visible feature, not a mismatched concept.
- Cloud email dual-auth for staff (unrelated, out of scope, confirmed in a prior spec).

---

## Architecture

Like Fleet and Billing before it, all four pieces here are **online-only, direct API calls** — no local SQLite persistence, no sync-engine involvement. None of this data (personal profile, sessions, account-deletion state, cross-store fleet stats) has an offline use case; it's account/subscription-owner-level data, not POS operational data.

**New infrastructure needed:** `client/` has no concept of the *cloud* logged-in user today. `useAuth()`/`auth-context.tsx`'s `User` type represents the *local, device-level, PIN-authenticated* staff/admin account (no `phone`, no `deletion_requested_at`) — it must not be extended or conflated with the cloud account. Instead, a new `useCurrentUser()` hook wraps the already-existing-but-unused `apiClient.getProfile()` (`GET /user`) via TanStack Query, matching the pattern `use-billing.ts` established for `getSubscriptionStatus()`. This hook is the data source for Profile, Sessions, and the danger-zone views. It is a new, additive concept — it does not touch `auth-context.tsx`.

Similarly, there's no existing "fleet-wide stats" aggregate in `client/`. Rather than porting `web/`'s single combined `GET /dashboard/summary` endpoint wholesale (which bundles `user`+`stats`+`stores`, conflating three concerns `client/` already keeps separate), the Fleet Overview reuses `client/`'s existing `getStores()` (already returns `FleetStore`-shaped rows per prior work) plus `getSubscriptionStatus()` (already exists), and adds one new endpoint call for the aggregate stats block (`total_sales`, `stores_count`, `stock_batch_value`, `customers`, `cloud_storage`) since nothing in `client/` computes that today. See Section E for the exact contract.

---

## Section D: Personal Account Management

### D1. `useCurrentUser` hook (foundational)

**Files:**
- Modify: `client/lib/api/client.ts` — `getProfile()` already exists (`GET /user`) but is typed `unknown` and unused; give it a real `CurrentUser` return type.
- Create: `client/lib/types/user.ts` addition (or a new file if that one is getting large) — `CurrentUser` interface: `{ id, first_name, last_name, email, phone?: string | null, deletion_requested_at?: string | null, deletion_reason?: string | null, ...other fields the /user response returns that this feature doesn't need to enumerate exhaustively, captured via a permissive extra-fields allowance }`.
- Create: `client/lib/hooks/use-current-user.ts` — `useCurrentUser()` query hook (TanStack Query, `queryKeys` factory entry `currentUser: () => resource(["currentUser"], [])`, remote-only like `billing`), plus `useUpdateProfileMutation()` invalidating it on success.

### D2. Profile edit (name/phone)

**Files:**
- Modify: `client/lib/api/client.ts` — add `updateProfile(payload: { first_name: string; last_name: string; phone?: string | null }): Promise<{ message: string; user: CurrentUser }>`, `POST /profile/update`.
- Create: `client/components/settings/account/profile-settings.tsx` — form with `first_name`/`last_name`/`phone` editable, `email` rendered read-only with the same "Emails cannot be changed" helper text as `web/`, sourced from `useCurrentUser()`. Edit/Save pattern matches `web/`'s (edit mode toggle, not always-editable fields), reusing the existing `Input`/`Label`/`Button` conventions already established in `client/components/settings/*`.

### D3. Sessions & Devices

**Files:**
- Modify: `client/lib/api/client.ts` — add `getSessions(): Promise<Session[]>` (`GET /sessions`), `revokeSession(id: string): Promise<{ message: string }>` (`DELETE /sessions/{id}`), `revokeAllSessions(): Promise<{ message: string }>` (`POST /sessions/revoke-all`).
- Create: `client/lib/types/user.ts` (or wherever `CurrentUser` lands) addition — `Session { id: string; name: string; ip_address: string | null; user_agent: string | null; last_used_at: string | null; created_at: string; is_current: boolean }`.
- Create: `client/lib/hooks/use-sessions.ts` — `useSessions()`, `useRevokeSessionMutation()`, `useRevokeAllSessionsMutation()`, invalidating `["sessions"]` on success, same pattern as `use-billing.ts`.
- Create: `client/components/settings/account/sessions-list.tsx` — one row per session: device icon + parsed "Browser on OS" label from `user_agent` (**improvement over web**: prefer the server-returned `name` field — the `device_name` supplied at login — over UA-sniffing when `name` is present and non-generic, since `client/`'s own login already sends a meaningful `device_name`; fall back to UA parsing only when `name` is absent/generic, matching web's behavior as the fallback path, not the primary one), "Current Device" pill when `is_current` (no revoke button rendered for the current session — client-side omission, matching web, backed by the server's independent 403 rejection as defense-in-depth), `ip_address` (or "Unknown IP") + last-active timestamp (`last_used_at` falling back to `created_at`). "Log out of all other devices" button shown only when more than one session exists. Client-side pagination (5 at a time, "Show More" — matches web) is unnecessary scope for a first port; render all sessions in one list unless the count is large enough to matter in practice (defer pagination unless implementation reveals a real need).

### D4. Account danger-zone

This section touches both `laravel-server` and `client/`, since the server-side password-check gap (found during design) is being fixed as part of this work, not just ported as-is.

**D4a. Server-side fix (laravel-server) — real password verification**

**Files:**
- Modify: `laravel-server/app/Http/Controllers/Api/DashboardController.php` (`resetData` method) — add `password` to the validation rules (`required|string`) and verify it against the authenticated user's stored password hash (`Hash::check($request->password, $request->user()->password)`) before proceeding; return 403 with a clear error message on mismatch. This closes the gap where the password field was UI-only.
- Modify: `laravel-server/app/Http/Controllers/Api/AuthController.php` (`requestDeletion` method) — same treatment: add `password` to validation (`required|string`), verify via `Hash::check`, 403 on mismatch, before setting `deletion_requested_at`.
- Note: this is a behavior change for `web/`'s existing danger-zone UI too (it already sends `password` in both requests — see research — so no `web/` frontend changes are needed; the backend simply starts actually checking a field it already receives). Existing web users with a correct password see no change; anyone previously exploiting the unchecked field (there is no evidence of exploitation, this is a proactive fix) would now be rejected, which is the intended outcome.
- Add backend feature tests confirming: correct password succeeds, wrong password returns 403 without performing the reset/deletion-request, missing password returns 422.

**D4b. Client UI**

**Files:**
- Modify: `client/lib/api/client.ts` — add `resetData(type: string, password: string): Promise<{ message: string }>` (`POST /dashboard/reset`), `requestAccountDeletion(payload: { reason: string; password: string }): Promise<{ message: string }>` (`POST /profile/request-deletion`), `cancelAccountDeletion(): Promise<{ message: string }>` (`POST /profile/cancel-deletion`).
- Create: `client/components/settings/account/account-danger-zone.tsx` — mirrors `web/`'s two action groups: (1) scoped data-reset buttons (Clear Sales, Clear Logs, Clear Stock Batch, Clear Customers, Clear Terminals, Nuke Everything) each opening a confirmation dialog requiring password entry (reusing `ConfirmDialog`, extended with a password field, or a small dedicated dialog if `ConfirmDialog`'s existing props don't accommodate an input field — check at implementation time); (2) account deletion request/cancel flow, showing the amber "Requested" banner + Cancel link when `useCurrentUser().deletion_requested_at` is set, otherwise the "Request Deletion" button opening a dialog requiring a non-empty reason (`Textarea`) and password. No typed-confirmation-text pattern (matches web — reason + password only, both non-empty-checked client-side, now genuinely checked server-side too per D4a).
- **Important distinction from `web/`'s "Nuke Everything"**: `client/` is a local-first SQLite app — "Clear Sales"/"Clear Logs"/etc. here must operate on **local SQLite data** (going through the existing `softDelete`/local-database patterns so sync-queueing behaves correctly), not the cloud `/dashboard/reset` endpoint's server-side tables, which reset the *cloud-synced* copies of the same data. Decide at implementation time whether "Reset" in `client/` should call the cloud endpoint (resetting server data, matching `web/`'s scope exactly, since that endpoint is about the account's cloud data) or needs a local-equivalent action too — the spec's position: **replicate `web/`'s exact scope** (cloud-side reset via the same endpoint), since `client/` already has its own separate local factory-reset ("Danger Zone" in `data-settings.tsx`, confirmed to exist) for wiping local SQLite — these are two different, both-legitimate resets (local device vs. cloud account), and this section only ports the cloud one. Do not conflate them or attempt to merge the two danger-zone UIs into one.

---

## Section E: Fleet Overview

### E1. Cross-store stats + stores table

**Files:**
- Modify: `client/lib/api/client.ts` — add `getFleetStats(): Promise<FleetStats>` (new endpoint; see note below on backend work needed), typed per the `DashboardStats` shape confirmed in research: `{ total_sales?: { value?: number; growth?: string }; stores_count?: number; last_sync?: string; stock_batch_value?: { value?: number }; customers?: { value?: number; growth?: string }; cloud_storage?: { used_gb?: number; limit_gb?: number; percentage?: number } }`.
- **Backend note:** `web/`'s stats come bundled inside `GET /dashboard/summary`, which also returns `user` and `stores` — fields `client/` already gets elsewhere. Rather than have `client/` consume the whole bundle and discard two-thirds of it, add a slimmer `GET /dashboard/stats` endpoint (or confirm at implementation time whether reusing `/dashboard/summary` and just ignoring the unused `user`/`stores` keys is simpler and low-risk enough to skip a new backend endpoint — implementer's call, weighing "one new endpoint" against "fetch a slightly oversized payload and use part of it"). Either way, no new backend *logic* is needed — `DashboardService`'s existing stats-computation logic (whatever produces `stats` in `/dashboard/summary` today) is reused, just re-exposed or consumed differently.
- Create: `client/components/settings/account/fleet-overview.tsx` (or `client/components/dashboard/fleet-overview.tsx` if this should live outside Settings — see placement note below) — 4 stat cards (Total Fleet Sales, Active Stores, Stock Batch Value, Fleet Customers) matching `web/`'s `OverviewStats` layout, plus the cloud-storage meter (simple width-styled div, no new dependency), plus a stores table reusing `getStores()`'s existing `FleetStore[]` data (already fetched by `MultiStoreCard`'s Fleet management section) for the Store Name / Status / Last Sync / Total Sales columns. Row click navigates into that store's management view (client's existing Fleet edit dialog from the prior Fleet plan, or a lighter drill-down — implementer's call; `web/`'s row-click target (`store-details`) is one of the views this spec is deliberately not porting, so this should NOT attempt to recreate a full store-details drill-down, just make the row informative).
- **Placement decision, deferred to the writing-plans stage**: should this live inside Settings (alongside the existing Fleet CRUD section, since it's fleet-related) or as its own page? Given the earlier decision to keep Fleet/Staff/Billing Settings-tab-only (not adding top-level sidebar entries), the consistent choice is to fold this into the existing Settings > Store Profile tab, above or alongside the Fleet management list — not a new top-level nav item. Confirm this placement during planning rather than re-litigating nav scope here.

### E2. Daily summary email trigger

**Files:**
- Modify: `client/lib/api/client.ts` — add `sendEndOfDaySummary(): Promise<{ message: string }>` (`POST /dashboard/send-summary`, no body).
- In `fleet-overview.tsx`: a "Send Daily Summary" button, gated the same way `web/` gates it client-side (`subscription?.features?.auto_backup ?? (plan !== "starter" && plan !== "free")`, sourced from the already-existing `useSubscriptionStatus()` hook) — this is a UX nicety, not a security boundary, since the server (`StoreSummaryController::sendSummary`) independently re-checks entitlement and returns 403 with `"This is a premium feature. Please upgrade your plan to access it."` on failure; the client must handle that 403 gracefully (toast the server's message) in case the two gates ever drift.
- Also port the "Delayed Dashboard Data" amber banner (shown when `subscription.limits.sync_interval > 0`) — purely derived from data `useSubscriptionStatus()` already provides, no new endpoint.

---

## Error handling

- All new reads (`useCurrentUser`, `useSessions`, `getFleetStats`) surface failures via inline error states, matching the precedent set in the Billing plan's final-review fix (don't let a network failure render as an indistinguishable blank/empty state).
- Profile update, session revocation, data reset, and account-deletion request/cancel all surface server error messages via toast (matching existing convention across Staff/Fleet/Billing components) rather than generic client-side text, since the server (especially after D4a's real password check) returns specific, user-actionable messages.
- The "Send Daily Summary" 403 (premium-feature gate drift) is explicitly handled, not just left to a generic error path, per E2 above.

## Testing

- New API client methods (`updateProfile`, `getSessions`, `revokeSession`, `revokeAllSessions`, `resetData`, `requestAccountDeletion`, `cancelAccountDeletion`, `getFleetStats`, `sendEndOfDaySummary`) get unit tests mocking `fetch`, following the `handoff-client.test.ts`/`billing-client.test.ts` pattern already established in this codebase.
- D4a's backend password-verification fix gets Laravel feature tests (correct password succeeds, wrong password 403s without side effects, missing password 422s) for both `resetData` and `requestDeletion`.
- UI components are verified manually via `npm run dev`, consistent with how the rest of this migration's Settings UI has been verified — no existing component-level UI test suite to extend.

## Self-review

- **Scope check:** two independent areas (Account Management, Fleet Overview) that share only the new `useCurrentUser` foundation loosely (Fleet Overview doesn't depend on it) — plannable as two separate implementation plans, consistent with how Staff/Fleet/Billing were split.
- **Consistency:** "online-only, direct API, no local sync" is applied uniformly; the one local-data touchpoint (D4b's "Nuke Everything" scope question) is explicitly resolved (cloud-side only, not conflated with the existing separate local factory-reset).
- **Ambiguity resolved:** Sessions/Devices confirmed as a real, in-scope feature (not dropped, correcting an earlier wrong assumption during design). Password verification gets a real backend fix, not just UI-parity replication (explicit decision). Fleet Overview's row-click does not attempt to recreate the store-details drill-down this migration is deliberately not porting.
- **No placeholders remain.**
