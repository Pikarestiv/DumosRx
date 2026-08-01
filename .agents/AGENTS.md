# DumosRx - Core AI Rules & Architecture Guidelines

Welcome to the DumosRx repository. The following rules are the definitive guidelines for contributing to this project.

## 1. 👑 Codebase is the Absolute Source of Truth

Project documentation can quickly become outdated. **Always treat the current state of the codebase (e.g., database migrations, current typescript interfaces) as the absolute source of truth.**

- *Crucial Update:* We have moved away from the `medicines` and `inventory` table names. We now use `products` (for catalog holding) and `stock_batches` (for holding inventory/stocks).

## 2. 📝 Documentation Maintenance

Whenever you implement a new feature, change an architectural pattern, or modify the database schema, **you must update the relevant documentation files** (or this `AGENTS.md` file) to ensure future AI agents and human developers have accurate context.

- **Roadmap Updates:** When a feature from `FEATURE_ROADMAP_SPEC.md` is completed, you must remove it from the roadmap and add its documentation to `SYSTEM_FEATURES_DOCUMENTATION.md`.

## 3. 🏗️ Architecture & Separation of Concerns

- **Frontend (Next.js/Tauri):** Strictly separate business logic (Custom Hooks, Zustand, TanStack Query, Services) from UI logic (Shadcn components).
- **Backend (Laravel 11):** Strictly separate Controllers (routing/HTTP layer) from Services (business logic layer).
- **File Constraints:** Keep files strictly below 350 lines. Break them down if they get too large. Code must be highly modular, DRY, and clean (no unused variables or imports).
- **No Hardcoded URLs:** Never hardcode external links or API endpoints (e.g., `https://downloads.dumosrx.com/...`) directly in UI components. Always import them from `constants.ts` or environment variables (e.g., `process.env.NEXT_PUBLIC_...`).

## 4. 📴 Offline-First Sync Engine & Database Hygiene

DumosRx is an offline-first application (SQLite local, Laravel MySQL cloud) connected by a bidirectional Sync Engine.

- **Sync Coverage:** Remember to always make sure new tables or columns created are taken cognizance of in the sync feature, local db, indexed db and online db so the data won't be ignored during syncs and backups.
- **NEVER** perform direct `db.run()` calls for data mutations.

- **ALWAYS** use the `insert()`, `update()`, and `softDelete()` helpers in `local-database.ts`. This ensures the `_sync_queue` is properly populated and the `_version` / `_synced` flags are respected.
- **Data Types:** SQLite is loosely typed. Ensure dates are consistently stored as ISO-8601 strings to avoid comparison logic errors during sync.

## 5. 🧪 End-to-End Testing (Playwright)

Since DumosRx is an offline-first application relying on IndexedDB via `sql.js`, E2E tests must be carefully designed to avoid flakiness:

- **Database Seeding:** Do not rely on network interception for the initial state. Instead, use a `global.setup.ts` to pre-seed the `idb-keyval` store with a test account and necessary mock data before tests run. This test account will be used across all test suites to bypass the network sync requirement for the first load.
- **Test Accounts:** Always ensure there is a dedicated test account created locally in the mock database (e.g., `admin@dumosrx.com` with PIN `1234`).
- **Navigation:** Avoid using `page.goto()` for internal page transitions as it forces a full reload, resetting SPA state and potentially clearing in-memory DB references if not rehydrated properly. Instead, navigate using UI elements like sidebar links (e.g., `await page.locator('a[href="/expenses"]').first().click()`).
- **Network Independence:** Tests must be able to run fully offline once the `global.setup.ts` has initialized the local database.
- **Page Coverage:** Ensure you write E2E tests for all the core pages (Dashboard, POS, Inventory, Customers, Procurement, Expenses, Reports) so the entire app is covered.

## 6. 🎨 Design Language & Aesthetics

To maintain the DumosRx "Premium" feel:

- **Typography:** Use `Geist` or `Inter` for body text, and a Serif font (e.g., `Playfair Display`) for headings.

- **Accents:** Primary color is deep emerald or navy, with gold/muted-yellow accents for alerts/ratings.
- **No Hardcoded Colors:** Never use arbitrary hardcoded hex codes (like `text-[#123456]` or `bg-[#FFFFFF]`) in Tailwind classes. Always use the predefined semantic theme variables (e.g., `bg-primary`, `text-muted-foreground`, `border-border`, `bg-card`) to ensure light/dark mode compatibility and a consistent design language.
- **Glassmorphism:** Use backdrop-blur (`bg-background/95 backdrop-blur-sm border shadow-sm`) for dialogs, tooltips, and secondary cards.
- **Tooltips:** Use Radix UI tooltips with a subtle 1000ms delay to prevent flickering.
- **Localization (Dates):** Always maintain Nigeria's date structure (`DD/MM/YYYY`) for UI elements instead of the US format (`MM/DD/YYYY`). Use custom DatePicker components (like `DatePickerInput`) rather than native `<input type="date">` to enforce this visual format across all browsers.

## 6a. 🕐 Server Clock / MySQL Timezone Gotcha

The Namecheap shared-hosting box's MySQL is configured with `time_zone = SYSTEM`, which reports the OS's raw local clock (observed as **EDT**, ~4 hours behind UTC) instead of converting to UTC. Laravel's PHP layer (`date.timezone = UTC`) generates all of its own timestamps (`now()`, `updated_at` via Eloquent, `_synced_at`) correctly in UTC — the two clocks disagree by design unless corrected.

- **Consequence if missed:** the sync engine's incremental pull (`SyncController.php`) filters rows by `updated_at`/`_synced_at > lastSynced`, comparing PHP-generated UTC timestamps. Any **raw SQL** that sets a timestamp via MySQL's own `NOW()`/`CURRENT_TIMESTAMP()` (e.g. a manual `UPDATE ... SET updated_at = NOW()` run directly against the DB) will silently write a timestamp ~4 hours in the "past" relative to UTC — meaning the sync pull filter can permanently skip that row, even though the data itself is correct. This is exactly what happened while manually correcting a stock-batch double-count bug: the value was fixed, but two attempts to bump `updated_at` via `NOW()` never propagated to the client because MySQL's clock never actually caught up to the UTC watermark already recorded in `_synced_at`.
- **Fix in place:** `config/database.php`'s `mysql` connection sets `\PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+00:00'"`, forcing every connection Laravel opens to run in UTC. This only applies to connections opened through the app — **not** to phpMyAdmin or any other tool connecting directly.
- **phpMyAdmin (or any direct DB client) still shows raw local time.** Its session is separate from the app's PDO connections, so `NOW()`/`CURRENT_TIMESTAMP()` run there will still return the ~4-hours-behind local clock, not UTC, unless you explicitly run `SET time_zone = '+00:00';` at the top of that session first. When manually inspecting or correcting timestamp columns via phpMyAdmin, either do that, or set an explicit literal UTC timestamp (e.g. `'2026-08-02 00:00:00'`) rather than relying on `NOW()`.
- **General rule:** never use MySQL's `NOW()`/`CURRENT_TIMESTAMP()` in raw SQL against this database, in migrations or otherwise — let Eloquent set timestamps (it already does, correctly, in UTC).

## 6. 🔒 Security & Optimization Standards

- **Prototype Pollution:** Never perform dynamic bracket lookup `obj[key]` using values fetched directly from inputs. Use ES6 `Map` or strict `switch` statements.
- **JWT & Anti-Tampering:** Subscription licenses are verified via offline JWT checks. Do not alter the `LicenseGuard` anti-backdating logic without explicit instruction.
- **Pagination:** Always use pagination, limit offsets, or cursor-based scrolling to limit page results to 50 items to prevent UI thrashing.

## 7. 🧪 Testing & Validation

- Whenever a new feature is implemented, an architectural change is made, or an existing calculation is modified, **you must check whether to update existing tests or add new ones.**
- Data integrity calculations, sync operations, and offline reconciliation flows MUST always be covered by automated tests to prevent silent data corruption.
- **E2E Testing (Playwright):** We use Playwright for E2E testing the frontend. Since DumosRx is offline-first, a fresh browser context starts with an empty IndexedDB. Instead of performing the "Setup New Store" flow in every test, we use a `global.setup.ts` script to create a seeded database and export it. Use the custom `test` fixture from `e2e/fixtures.ts` to automatically inject this seeded database into `window.restoreDatabase()` before navigating to the target page. Test files should import `test` and `expect` from `./fixtures` rather than `@playwright/test`.

- **UI/UX Interactions:** NEVER use `window.confirm` for user confirmations. ALWAYS use a custom modal or `AlertDialog` component (e.g. from Radix/Shadcn) to maintain consistent design and avoid native browser popups.
