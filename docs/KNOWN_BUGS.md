# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet, tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings. Fixed entries are removed outright rather than marked — this file is a to-do list, not a changelog (git history is the changelog).

Open items below are grouped by severity (Critical → High → Medium → Low), then a `client/`-area miscellaneous section for older/unlabeled entries, then the separate `web/` pre-launch review section.

## Decided — accepted as-is (not a bug)

### Plaintext PINs stored and synced

- **Where:** `client/lib/db/queries/auth.ts:9,32,36`,
  `client/lib/context/auth-context.tsx:183,436`.
- **Context:** `users.pin` is stored and compared in plaintext, and carried
  in sync payloads for the `users` table.
- **Effect:** a `.drx` backup file, an IndexedDB dump, or a server-side DB
  read exposes every staff PIN in the clear. Compounds the admin-backdoor
  and no-lockout findings above.
- **Decision (2026-09-22):** kept as plaintext, deliberately. This is a
  known tradeoff of the offline-first architecture — PIN unlock must work
  with zero network round-trip, and every avenue for real hashing here
  (bcrypt/argon2/scrypt at interactive-unlock speed, purely client-side,
  no server call) was judged not worth the added complexity and offline-
  verification cost for what this PIN actually gates (device-local staff
  unlock, not the cloud account credential). Not revisited unless the
  threat model changes.

## `client/` — older/unlabeled entries

### Account/store switch may briefly show the previous store's stale dashboard data (unreproduced)

- **Where:** `client/lib/context/store-context.tsx`'s `switchStore()` calls
  `queryClient.cancelQueries()` then a broad, deliberately untargeted
  `queryClient.invalidateQueries()`. React Query's default behavior for
  `invalidateQueries()` is to mark queries stale and refetch in the
  background *without* clearing what's currently rendered — a component
  keeps showing its last-known (now-stale) data until the refetch resolves.
- **Reported:** a user-reported "a small lag when one switches account or
  something where for a second or so, after switching, the old account's
  dashboard is shown."
- **Investigated, not reproduced:** the store-switcher path was exercised 6
  times alternating between two real stores with meaningfully different
  data, using rapid back-to-back screenshots with no manual delay; a second,
  structurally different switching mechanism (multi-staff PIN "Switch
  Account," which goes through `login()`'s `queryClient.clear()` instead —
  clears outright rather than marking stale-but-displayable) was also
  exercised. Every trial's very first screenshot after the switch already
  showed the fully correct destination data; no stale frame was ever caught,
  and no console errors appeared.
- **Status:** the stale-render window is real by design in this app's
  local-first architecture (sql.js reads, no network round-trip), but
  apparently resolves fast enough on this test device/data volume to be
  imperceptible. Never reproduced. A slower device, a much larger local DB,
  or sync contention during the switch could plausibly still hit the window.
- **Mitigated, not root-fixed (defense in depth):** `switchStore()` now
  holds an `isSwitchingStore` flag (exposed from the store context) for the
  duration of its `cancelQueries()`/`invalidateQueries()` round trip, and
  `LicenseGuard` — which already gates the whole app on its own `loading`
  splash — renders `SplashScreen` while it's set. So a switch can no longer
  paint the outgoing store's data even if the window does open on a slower
  device. Capped at `SWITCH_STORE_MAX_WAIT_MS` (5s) so a query that never
  settles falls back to the (at worst briefly stale) UI rather than
  stranding the app on the splash. The underlying behavior is unchanged:
  React Query's `invalidateQueries()` still refetches stale-while-revalidate
  by design — it's just covered by a loading state now. If this is reported
  again despite that, get a screen recording (polled screenshots could miss
  a sub-second flash).

### `SyncController::push()`'s `stale_timestamp` conflict-fallback branch — corrected: NOT dead code

- **Where:** `laravel-server/app/Http/Controllers/Api/App/SyncController.php`, `push()`'s UPDATE handling — the `elseif (!$isCommutativeTable && $model->updated_at && isset($payload['updated_at']))` branch, guarding the case where `$payloadVersion !== null && $modelVersion !== null` is false.
- **This entry previously claimed the branch was unreachable dead code**, reasoning that `$modelVersion` (`$model->_version`) can never be `null` since every `_version` column is `integer default(1)` NOT NULL. That half of the reasoning is correct — confirmed both from every migration and git history, and directly against the production DB (a full `SELECT ... WHERE _version IS NULL` sweep across all 31 tables with a `_version` column returned zero rows).
- **What the original analysis missed:** the guard is `$payloadVersion !== null && $modelVersion !== null` — it's false whenever *either* side is null, not just when `$modelVersion` is. `$payloadVersion` genuinely can be null: a payload can simply omit the `_version` key. `tests/Feature/SyncEndpointTest.php::test_push_sync_handles_soft_deletes` does exactly this (an `UPDATE` with `_deleted: 1` and no `_version` field) and relies on the timestamp-fallback branch to accept it. Removing the branch broke that test (and `test_push_sync_generates_a_stable_device_id_when_store_insert_omits_one`) immediately.
- **Status:** left in place, confirmed live. Do not remove without also confirming no real caller ever sends an `UPDATE` payload without `_version` — today's client (`base-helpers.ts`'s `update()`) always includes it, but this legacy fallback protects against payloads that don't (whether from an older client version, or a hand-built payload like the soft-delete test above).
- **Now directly covered**, rather than only incidentally via the soft-delete test: `SyncEndpointTest.php`'s `test_push_sync_rejects_an_older_update_with_no_version_via_the_timestamp_fallback` and `..._accepts_a_newer_update_...` pin both outcomes of the branch (rejection reported as `stale_timestamp` in `failed` with the row untouched; acceptance applying the write while leaving `_version` alone and reporting nothing in `versions`). The stale "this branch is unreachable dead code" comment that sat above these tests has been replaced accordingly. The branch's logic now lives in `resolveUpdateConflict()` — same code, just extracted.

## Pre-launch review findings (web/)

Read-only review pass over `web/` (Next.js superadmin panel + marketing
site), area by area. Same convention as the earlier `client/` pass: grouped
by area, one entry per finding, removed outright once fixed. Every area,
including auth, is now fixed and moved to `FIXED_BUGS.md`.
