# Referrals — "My Referrals" (Superadmin)

Route: `web/app/admin/referrals/page.tsx` (`MyReferralsPage`), sidebar nav
item "My Referrals".

**Scope confirmation vs. the task brief's guess:** partially matches, with
an important correction. This is **not** the platform's referral-*program*
administration (that already exists and was fully surveyed as part of
Marketing's "Affiliates & Referrals" tab in the earlier batch — see
`docs/features/superadmin/marketing.md` and the `_findings-log.md` entry
"Marketing: no bugs found in Coupons or Referrals endpoint wiring", backed
by `lib/api/admin-hooks-referrals.ts`, `admin/referrals/*` routes,
`ReferralController`). This `/admin/referrals` page is a **distinct,
much simpler feature**: a personal, self-service "who did I refer to the
platform" page — every platform user (super_admin or otherwise) gets a
shareable `platform_referral_code` / registration link, and this page
shows their own code plus the list of accounts that registered through it
or that they registered directly. The page's own subtitle says as much:
"Commission/remittance is handled outside the platform." Distinct hooks
(`useMyReferrals`, `checkReferralCode`, `useUpdateReferralCodeMutation` in
`lib/api/admin-hooks-users.ts`), distinct backend routes
(`admin/my-referrals`, `admin/referral-code/check`, `admin/referral-code`
on `AdminController`), and a distinct backend model field
(`users.platform_referral_code`) from the Marketing tab's coupon-style
referral program (`ReferralController`, `admin/referrals/*`,
credit-transaction ledger). No overlap in code paths.

## Data flow

- `useMyReferrals()` (`lib/api/admin-hooks-users.ts:13`) → `GET
  admin/my-referrals` → `AdminController::myReferrals`
  (`AdminController.php:351`) → `AdminService::getReferralsFor($targetId)`
  (`AdminService.php:24`). Returns `{ platform_referral_code,
  referral_link, total, accounts: [{ id, name, email, role, store_name,
  registered_at }] }`. Frontend's `PlatformReferrals` type
  (`lib/types/admin.ts:276`) matches this shape exactly — no
  `data`/`meta`-style nesting mismatch (unlike the Products bug found in
  an earlier batch).
- `checkReferralCode(code, userId?)` → `GET
  admin/referral-code/check?code=...&user_id=...` →
  `AdminController::checkReferralCode` (`AdminController.php:388`) →
  `AdminService::checkReferralCodeAvailable()`. Returns `{ available,
  code }`. The backend's own OpenAPI doc comment explicitly says the
  `user_id` param exists to "exclude this user's own current code from the
  collision check (i.e. re-saving your own code as-is)."
- `useUpdateReferralCodeMutation()` → `POST admin/referral-code` →
  `AdminController::updateReferralCode` (`AdminController.php:418`) →
  `AdminService::updateReferralCode($targetId, $code, $callerId)`. Returns
  `{ platform_referral_code }`. `super_admin` may pass `user_id` to edit
  another user's code; anyone else may only edit their own (403
  otherwise).
- `getReferralsFor()`'s per-account `store_name` resolves via
  `$u->store->name ?? null`, i.e. `User::store()` — the same `hasOne`
  relation (default-inferred FK `stores.user_id`, meaning "store this user
  **owns**") already documented as buggy for **staff-tier** users
  elsewhere in this app (Users list, Activity Log — see those sections'
  entries in `_findings-log.md`). It happens to resolve correctly here
  because every referred account in this dev DB is itself a **store
  owner** (`stores.user_id` = their own id), which is the expected common
  case for this specific feature (referring a *new pharmacy*, i.e. a new
  store owner, not a staff member). Flagged as the same latent root cause,
  not re-logged as a new bug, since it wasn't reproducible with available
  live data.

## Live walkthrough

Tested at `http://localhost:3002/admin/referrals`, logged in as
`admin@dumosrx.com` (super_admin).

- **Page load:** "Your Referral Link" card showed
  `https://dumosrx.com/register?agent_ref=pikarestiv`; "Accounts (1)" table
  showed one real row: "Smoke Tester" / `smoketest@example.com` / "Smoke
  Test Store" / registered 8/24/2026. Network tab confirmed `GET
  admin/my-referrals` → 200 with exactly this data. Cross-checked via
  `php artisan tinker`: `admin@dumosrx.com`'s `platform_referral_code` is
  `pikarestiv`; `User::where('registered_by_id', <admin id>)->count()` is
  1, matching the single row shown. The "Smoke Tester" user's own
  `store_id` column is actually blank in the DB — the "Smoke Test Store"
  displayed comes correctly from the `User::store()` (owned-store) relation
  described above, since Smoke Tester owns that store.
- **Copy button:** present and wired to `navigator.clipboard.writeText`;
  not independently verified against the OS clipboard (out of scope for a
  headless-adjacent Chrome session) but the code path is trivial and
  unambiguous by source read.
- **Edit flow — real bug found (see Findings).** Clicking the pencil icon
  opens an inline editor pre-filled with the current code
  (`pikarestiv`). Clicking "Save" **without changing anything** — the most
  natural "let me just re-confirm/re-save my code" action a superadmin
  might take — fails with a toast: `"pikarestiv" is already taken. Try
  another.` Reproduced live; network tab showed `GET
  admin/referral-code/check?code=pikarestiv` (no `user_id` param) → 200
  `{ available: false, ... }`. Cancelled out of the edit without saving
  (state unaffected, confirmed no `POST admin/referral-code` was ever
  issued).

## Findings

### Bug: "Save" on your own unchanged (or case/whitespace-equivalent) referral code always fails as "already taken"

**Severity:** Medium (a real, easily-reproduced dead end for a legitimate
action — re-saving or lightly editing your own code — not just an edge
case).

`app/admin/referrals/page.tsx`'s `handleSave` calls:

```js
const { available, code } = await checkReferralCode(trimmed);
```

`checkReferralCode`'s exported signature (`lib/api/admin-hooks-users.ts:20`)
is `(code: string, userId?: string)`, and the backend endpoint it hits
explicitly supports a `user_id` param for exactly this purpose — the
`checkReferralCode` OpenAPI doc comment on the backend
(`AdminController.php:373`) reads: *"Exclude this user's own current
code from the collision check (i.e. re-saving your own code as-is)."* But
the frontend call site never passes it. Every save attempt — even one
that doesn't actually change the code, or changes only its casing/
whitespace (which `updateReferralCode`'s own normalization would collapse
back to the same stored value) — collides with the user's own existing row
and is rejected as taken. Live-reproduced: saving `pikarestiv` while
already `pikarestiv` → `"pikarestiv" is already taken. Try another.`

**Effect:** the only way to successfully use this feature at all is to
change to a code that's *never* been used by this account before; a
superadmin who opens the editor, doesn't intend to change anything, and
clicks Save (e.g. to dismiss the editor by way of confirming) always hits
an error instead of a no-op success.

**Suggested fix scope** (not implemented — investigation only): pass the
current user's id through, e.g.
`checkReferralCode(trimmed, user?.id)` in `handleSave`.

### Confirmed, not a bug: this page's `User::store()` resolution happens to be correct here (unlike the same relation's known bug for staff users elsewhere)

See "Data flow" above. Not re-logged as a separate open bug in the
findings log — it's the same already-documented root cause
(`User::store()`'s `hasOne`-owned-store semantics), just a call site where
the input data (referred accounts are all store owners) doesn't currently
expose the defect. Worth knowing if a staff-tier account is ever
`registered_by_id`-attributed to a referrer in the future: this page's
"Store" column would silently misreport it the same way the Users list and
Activity Log already do.

## Caveats

- Did not test the `user_id` super_admin-only cross-account edit path
  (`POST admin/referral-code` with someone else's `user_id`) — no UI
  affordance exists for it on this page (it's presumably reserved for a
  future admin-editing-another-user's-code feature, or CLI/support use);
  confirmed by source read that the backend correctly gates it to
  `super_admin` only (403 otherwise) and that no frontend call site
  currently invokes it with a foreign `userId`.
- Did not exercise a *successful* code change (i.e. actually saving a new,
  never-used code) live, to avoid leaving the shared dev account's real
  `platform_referral_code` altered for other testers/batches after this
  task ends. The failure mode above was reproducible without ever needing
  a successful save.
