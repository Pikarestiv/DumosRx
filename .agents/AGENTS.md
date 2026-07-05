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

## 5. 🎨 Design Language & Aesthetics

To maintain the DumosRx "Premium" feel:

- **Typography:** Use `Geist` or `Inter` for body text, and a Serif font (e.g., `Playfair Display`) for headings.

- **Accents:** Primary color is deep emerald or navy, with gold/muted-yellow accents for alerts/ratings.
- **Glassmorphism:** Use backdrop-blur (`bg-background/95 backdrop-blur-sm border shadow-sm`) for dialogs, tooltips, and secondary cards.
- **Tooltips:** Use Radix UI tooltips with a subtle 1000ms delay to prevent flickering.

## 6. 🔒 Security & Optimization Standards

- **Prototype Pollution:** Never perform dynamic bracket lookup `obj[key]` using values fetched directly from inputs. Use ES6 `Map` or strict `switch` statements.
- **JWT & Anti-Tampering:** Subscription licenses are verified via offline JWT checks. Do not alter the `LicenseGuard` anti-backdating logic without explicit instruction.
- **Pagination:** Always use pagination, limit offsets, or cursor-based scrolling to limit page results to 50 items to prevent UI thrashing.
