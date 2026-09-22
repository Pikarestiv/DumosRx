# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet, tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings. Fixed entries are removed outright rather than marked — this file is a to-do list, not a changelog (git history is the changelog).

Open items below are grouped by severity (Critical → High → Medium → Low), then a `client/`-area miscellaneous section for older/unlabeled entries, then the separate `web/` pre-launch review section.

---

## Critical

---

## High

### `laravel-server/` — staff PINs are stored in plaintext and serialized to API clients
`app/Models/User.php:34` (fillable `pin`), `:58-61` (`$hidden` omits it), `app/Http/Controllers/Api/Web/StaffController.php:153`, `app/Http/Controllers/Api/Concerns/AuthenticatesSessions.php:267-270`

`users.pin` is a plain `string(4)` column (`2026_05_16_070000_add_sync_fields_to_users_table.php:16`) written verbatim by `StaffController::store`/`update` and by sync push, never hashed. It is also absent from `$hidden`, so every endpoint that returns a `User` model serializes it: `GET /api/v1/user` returns the caller's PIN on every session bootstrap, `GET /api/v1/staff` returns the PIN of every staff member in the store, and sync pull ships them to each device. The PIN is the actual POS login credential (`client/lib/db/queries/auth.ts` compares it directly), so this is a credential disclosed in plaintext at rest and in transit-to-client.

---

## Medium

---

## Low

---

## `client/` — older/unlabeled entries

No open items currently — the last one (account/store switch stale
dashboard data) is fixed, see `FIXED_BUGS.md`.
