# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet, tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings. Fixed entries are removed outright rather than marked — this file is a to-do list, not a changelog (git history is the changelog).

Open items below are grouped by severity (Critical → High → Medium → Low), then a `client/`-area miscellaneous section for older/unlabeled entries, then the separate `web/` pre-launch review section.

---

## Critical

### `laravel-server/` — 10 migrations from 2026-09-23 not yet run on production
`laravel-server/database/migrations/2026_09_23_*.php` (10 files)

These add `stores.receipt_logo_position`, `activity_logs.correlation_id`, `purchase_order_items.{selling_price,cost_price_override,lot_number}`, `stock_movements.status`, `stores.{storefront_dirty_at,store_slug_changed_at}`, `sales.markup_type`, `stores.{staff_can_request_transfers,markup_sales_enabled}`, and widen `stock_movements.movement_type` from an incomplete MySQL `ENUM` to `VARCHAR`. All verified safe (additive `ALTER TABLE`, `--pretend` reviewed, applied cleanly to a throwaway sqlite db (the last two, added later the same day) and the local dev DB, full `php artisan test` suite green: 278 passed).

**Until these are deployed and run on production**, any device syncing a change to those columns gets `SQLSTATE[42S22]: Unknown column` (confirmed live: `activity_logs.correlation_id`, `stock_movements` transfer rows via the old `movement_type` ENUM; the last three were caught by code review before ever shipping, not yet confirmed live) and the push silently fails for that row — it stays in the client's local `_sync_queue` retrying forever, not lost, but never reaching the server either.

Production migrations run through a protected route, not direct `artisan` access (no SSH on the shared host — see `laravel-server/AGENTS.md`): `GET https://<production-domain>/migrate-db?key=<MIGRATE_DB_KEY>`. Deploy this branch first, then hit that route. Remove this entry once confirmed run.

---

## High

### `laravel-server/` — staff PINs are stored in plaintext and serialized to API clients
`app/Models/User.php:34` (fillable `pin`), `:58-61` (`$hidden` omits it), `app/Http/Controllers/Api/Web/StaffController.php:153`, `app/Http/Controllers/Api/Concerns/AuthenticatesSessions.php:267-270`

`users.pin` is a plain `string(4)` column (`2026_05_16_070000_add_sync_fields_to_users_table.php:16`) written verbatim by `StaffController::store`/`update` and by sync push, never hashed. It is also absent from `$hidden`, so every endpoint that returns a `User` model serializes it: `GET /api/v1/user` returns the caller's PIN on every session bootstrap, `GET /api/v1/staff` returns the PIN of every staff member in the store, and sync pull ships them to each device. The PIN is the actual POS login credential (`client/lib/db/queries/auth.ts` compares it directly), so this is a credential disclosed in plaintext at rest and in transit-to-client.

---

## Medium

### `client/` — existing Pro/Enterprise stores will lose the "Reseller sale" POS row on deploy, silently
`client/lib/hooks/use-feature-gate.ts` (`isMarkupSalesEnabled`), `stores.markup_sales_enabled`

New store-level toggle added 2026-09-23, default `0` (explicit product requirement — deliberate, not an oversight). Any store already on Pro/Enterprise and actively using reseller-commission sales before this ships will find the POS cart's "Reseller sale" row gone the moment it deploys, with no in-app notice explaining why, until the owner finds and turns on the new toggle in Settings → Register Configs ("Enable Markup Sales"). Not a bug to fix — the default was explicitly requested — but worth a release note / proactive heads-up to any store already using the feature before this ships, so it doesn't read as a broken app to them.

---

## Low

### `laravel-server/` — some `feedback` sync pushes rejected as "forbidden", cause not yet investigated
`app/Http/Controllers/Api/App/SyncController.php` (~line 357, `authorizeChangeTarget` check)

Seen live in a production sync response: two `feedback` table rows rejected with `reason: "forbidden"` (the record exists but doesn't resolve to the caller's authorized store/user scope). Not reproduced or root-caused — could be stale `_sync_queue` entries from before an account/store switch on that device, or a genuine ownership-scoping gap specific to `feedback`. Rows stay queued locally, not lost. Investigate if it recurs or affects more than a couple of stale rows.

---

## `client/` — older/unlabeled entries

No open items currently — the last one (account/store switch stale
dashboard data) is fixed, see `FIXED_BUGS.md`.
