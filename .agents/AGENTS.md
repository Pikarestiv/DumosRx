# DumosRx - Core AI Rules & Architecture Guidelines

Welcome to the DumosRx repository. The following rules are the definitive
guidelines for contributing to this project.

## 0. 📚 Package-Specific Docs — Read the Right File

This is a monorepo with three genuinely different subprojects. This file
covers only what's true across **all** of them. For anything specific to
one package, read (and maintain) its own file instead:

- **`client/AGENTS.md`** — the offline-first Tauri/Next.js POS app: DB/sync
  engine architecture, query-key conventions, UI table conventions, E2E
  seeding.
- **`web/AGENTS.md`** — the marketing site + store-owner dashboard +
  platform admin panel: static export setup, admin auth architecture.
- **`laravel-server/AGENTS.md`** — the API both talk to: Controller/Service
  separation, multi-tenancy scoping (`ScopesToTenant`), roles/permissions,
  the admin auth redesign, sync engine, testing.

If a rule applies to only one package, it belongs in that package's file,
not here — duplicating it in both places just means it drifts out of sync
the first time only one copy gets updated (this happened once already: the
Playwright/IndexedDB seeding rule was written twice in this file with two
slightly different versions before this cleanup).

## 1. 👑 Codebase is the Absolute Source of Truth

Project documentation can quickly become outdated. **Always treat the current state of the codebase (e.g., database migrations, current typescript interfaces) as the absolute source of truth.**

- *Crucial Update:* We have moved away from the `medicines` and `inventory` table names. We now use `products` (for catalog holding) and `stock_batches` (for holding inventory/stocks).

## 2. 📝 Documentation Maintenance — Keep These Files Current

**This is not optional cleanup, it's part of finishing the task.** Whenever
you implement a new feature, change an architectural pattern, modify the
database schema, or make a decision a future agent would otherwise have to
rediscover the hard way, update the relevant doc **in the same change**,
not as a follow-up:

- A change scoped to one package (its UI conventions, its internal
  architecture, a gotcha specific to it) → update that package's
  `AGENTS.md` (§0 above).
- A change that alters a rule listed *in this file*, or that's genuinely
  true across every package → update this file.
- **Roadmap Updates:** When a feature from `FEATURE_ROADMAP_SPEC.md` is completed, you must remove it from the roadmap and add its documentation to `SYSTEM_FEATURES_DOCUMENTATION.md`.
- **Known Bugs:** If you spot a real bug or data gap while working on something else (e.g. during a refactor, type-safety pass, or code review) and are not fixing it as part of the current task, log it in `docs/KNOWN_BUGS.md` instead of letting it go unrecorded. Include where it is, what's wrong, and the fix if known.
- A stale doc is worse than no doc — if you notice one of these files contradicts the current code while you're in the area, fix it as part of your change rather than leaving it for later.

## 3. 🏗️ Architecture & Separation of Concerns

- **Frontend (Next.js/Tauri):** Strictly separate business logic (Custom Hooks, Zustand, TanStack Query, Services) from UI logic (Shadcn components).
- **Backend (Laravel 11):** Strictly separate Controllers (routing/HTTP layer) from Services (business logic layer).
- **File Constraints:** Keep files strictly below 350 lines. Break them down if they get too large. Code must be highly modular, DRY, and clean (no unused variables or imports).
- **No Hardcoded URLs:** Never hardcode external links or API endpoints (e.g., `https://downloads.dumosrx.com/...`) directly in UI components. Always import them from `constants.ts` or environment variables (e.g., `process.env.NEXT_PUBLIC_...`).

## 4. 📴 Offline-First Sync (client/ only — see client/AGENTS.md for the full architecture)

DumosRx is an offline-first application (SQLite local, Laravel MySQL cloud) connected by a bidirectional Sync Engine. The one rule worth repeating here because it spans both repos:

- **Cross-repo schema sync:** Any new table or column must be reflected in the local SQLite schema (`client/lib/db/schema.ts`), the Laravel MySQL migration, and the sync engine's push/pull coverage — otherwise data silently fails to sync or backup. Run `npm run test:schema` in `client/` after any schema change on either side.

Everything else (the `insert()`/`update()`/`softDelete()` helper pattern, `_sync_queue`, conflict handling) is documented in `client/AGENTS.md` — that's the file to update if it changes.

## 5. 🎨 Design Language & Aesthetics

To maintain the DumosRx "Premium" feel:

- **Typography:** Use `Geist` or `Inter` for body text, and a Serif font (e.g., `Playfair Display`) for headings.
- **Accents:** Primary color is deep emerald or navy, with gold/muted-yellow accents for alerts/ratings.
- **No Hardcoded Colors:** Never use arbitrary hardcoded hex codes (like `text-[#123456]` or `bg-[#FFFFFF]`) in Tailwind classes. Always use the predefined semantic theme variables (e.g., `bg-primary`, `text-muted-foreground`, `border-border`, `bg-card`) to ensure light/dark mode compatibility and a consistent design language.
- **Glassmorphism:** Use backdrop-blur (`bg-background/95 backdrop-blur-sm border shadow-sm`) for dialogs, tooltips, and secondary cards.
- **Tooltips:** Use Radix UI tooltips with a subtle 1000ms delay to prevent flickering.
- **Localization (Dates):** Always maintain Nigeria's date structure (`DD/MM/YYYY`) for UI elements instead of the US format (`MM/DD/YYYY`). Use custom DatePicker components (like `DatePickerInput`) rather than native `<input type="date">` to enforce this visual format across all browsers.

## 6. 🕐 Server Clock / MySQL Timezone Gotcha (laravel-server only)

The Namecheap shared-hosting box's MySQL is configured with `time_zone = SYSTEM`, which reports the OS's raw local clock (observed as **EDT**, ~4 hours behind UTC) instead of converting to UTC. Laravel's PHP layer (`date.timezone = UTC`) generates all of its own timestamps (`now()`, `updated_at` via Eloquent, `_synced_at`) correctly in UTC — the two clocks disagree by design unless corrected.

- **Consequence if missed:** the sync engine's incremental pull (`SyncController.php`) filters rows by `updated_at`/`_synced_at > lastSynced`, comparing PHP-generated UTC timestamps. Any **raw SQL** that sets a timestamp via MySQL's own `NOW()`/`CURRENT_TIMESTAMP()` (e.g. a manual `UPDATE ... SET updated_at = NOW()` run directly against the DB) will silently write a timestamp ~4 hours in the "past" relative to UTC — meaning the sync pull filter can permanently skip that row, even though the data itself is correct. This is exactly what happened while manually correcting a stock-batch double-count bug: the value was fixed, but two attempts to bump `updated_at` via `NOW()` never propagated to the client because MySQL's clock never actually caught up to the UTC watermark already recorded in `_synced_at`.
- **Fix in place:** `config/database.php`'s `mysql` connection sets `\PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'"`, forcing every connection Laravel opens to run in UTC. This only applies to connections opened through the app — **not** to phpMyAdmin or any other tool connecting directly.
- **phpMyAdmin (or any direct DB client) still shows raw local time.** Its session is separate from the app's PDO connections, so `NOW()`/`CURRENT_TIMESTAMP()` run there will still return the ~4-hours-behind local clock, not UTC, unless you explicitly run `SET time_zone = '+00:00';` at the top of that session first. When manually inspecting or correcting timestamp columns via phpMyAdmin, either do that, or set an explicit literal UTC timestamp (e.g. `'2026-08-02 00:00:00'`) rather than relying on `NOW()`.
- **General rule:** never use MySQL's `NOW()`/`CURRENT_TIMESTAMP()` in raw SQL against this database, in migrations or otherwise — let Eloquent set timestamps (it already does, correctly, in UTC).

## 7. 🔒 Security & Optimization Standards

- **Prototype Pollution:** Never perform dynamic bracket lookup `obj[key]` using values fetched directly from inputs. Use ES6 `Map` or strict `switch` statements.
- **JWT & Anti-Tampering:** Subscription licenses are verified via offline JWT checks. Do not alter the `LicenseGuard` anti-backdating logic without explicit instruction.
- **Pagination:** Always use pagination, limit offsets, or cursor-based scrolling to limit page results to 50 items to prevent UI thrashing.
- **Admin auth tokens (web/ only):** The `web/` admin panel's access token lives in memory only (Zustand), never `localStorage` — see `web/AGENTS.md` for the full architecture. If you're touching admin login/refresh/logout, read that section first; don't reintroduce a `localStorage` copy of the token or a middleware that promotes an ambient cookie into a bearer header for general API routes.

## 8. 🧪 Testing & Validation

- Whenever a new feature is implemented, an architectural change is made, or an existing calculation is modified, **you must check whether to update existing tests or add new ones.**
- Data integrity calculations, sync operations, and offline reconciliation flows MUST always be covered by automated tests to prevent silent data corruption.
- **UI/UX Interactions:** NEVER use `window.confirm` for user confirmations. ALWAYS use a custom modal or `AlertDialog` component (e.g. from Radix/Shadcn) to maintain consistent design and avoid native browser popups.
- **Backend verification isn't UI verification:** Testing permission/role logic via `tinker` (or any backend-only harness) only confirms the *server-side* logic works — it does not catch UI-layer bugs like an inverted filter condition, a role missing from a nav's visibility list, or a page that's reachable but its data call still 403s. When a change spans both a backend permission model and a frontend that renders around it (nav visibility, gated buttons, redirects), do a real logged-in browser smoke test as part of the same pass — not as a follow-up after the user asks — especially for anything role- or permission-gated.
- **E2E Testing (Playwright, client/ only):** covered in `client/AGENTS.md` (`global.setup.ts` IndexedDB seeding, the `e2e/fixtures.ts` test fixture, page coverage expectations) — update that file, not this one, if the E2E setup changes.
