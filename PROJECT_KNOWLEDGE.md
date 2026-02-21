# 🧠 DumosRx: Project Intelligence & Handover

Welcome to the **DumosRx** project. This document serves as the definitive source of "tribal knowledge" and architectural context for the pharmacy management system. It is designed to be read by the next AI assistant to ensure a seamless transition and continuity of design and logic.

## 🏗️ Core Architecture & Philosophy

DumosRx is built as an **offline-first** application to handle the intermittent internet connectivity common in some parts of Nigeria.

### 🌓 Bidirectional Sync Engine
The most critical part of the system is the **Sync Engine** (`client/lib/db/sync-engine.ts`).
- **Local Storage**: Uses SQLite (via `sql.js` in the browser / WASM).
- **Versioning**: Every record has a `_version` and `_synced` flag.
- **Sync Queue**: All local modifications (INSERT, UPDATE, DELETE) are logged to a `_sync_queue` table.
- **Push & Pull**: 
  - `pushChanges()`: Sends the `_sync_queue` to the Laravel API.
  - `pullChanges()`: Fetches changes from the server since the last `last_synced_at` timestamp.
  - **Conflict Resolution**: Currently follows "Last Write Wins" based on the server's timestamp, but uses `INSERT OR REPLACE` locally to merge updates.

### 🧩 Frontend: Next.js + shadcn/ui
- **UI Architecture**: Premium, high-contrast, serif-accented design.
- **State Management**: 
  - **Zustand**: For global UI state (auth, search, overlays).
  - **TanStack Query**: For server-side sync state.
  - **Custom Hooks**: `useLocalData.ts` provides a reactive wrapper around the SQLite store.
- **Charts**: Custom `Recharts` implementation for Nigerian business metrics (Naira-based analytics).

### ⚙️ Backend: Laravel 11 API
- **Stateless API**: Uses Laravel Sanctum for token-based auth.
- **Sync Controller**: `App\Http\Controllers\Api\SyncController` handles the heavy lifting of merging client batches into the MySQL database.
- **Roles**: Super Admin, Manager, Pharmacist, Sales.

---

## 💊 Key Domain Modules

### 1. Inventory & Medicines
- **NAFDAC Compliance**: Fields for regulatory numbers and batch tracking.
- **Expiry Management**: Logic to flag near-expiry medicines.
- **Category Hierarchy**: Linked to therapeutic classes.

### 2. CRM & Sales
- **Customer Profiles**: Tracking loyalty points and chronic conditions.
- **POS Flow**: Designed for speed. Supports split payments (Cash, Transfer, Card).

### 3. Supplier Management
- **Vendor Rating**: Metrics for reliability and lead time.
- **Payment Terms**: 30/60/90 day credit tracking for Nigerian distributors.

---

## 🎨 Design Language & Aesthetics
To maintain the "Premium" feel:
- **Foundations**: Use `Geist` or `Inter` for body, and a Serif font (e.g., `Playfair Display`) for headings.
- **Accents**: Primary color is a deep, professional emerald or navy, with gold/muted-yellow accents for "Alerts" and "Ratings".
- **Glassmorphism**: Subtle use of backdrop-blur for dialogs and secondary cards.

---

## ⚠️ AI-to-AI: Critical Advice & Pitfalls

> [!IMPORTANT]
> **Database Hygiene**: Never perform direct `db.run()` calls for data mutations without checking if they need to be synced. Always use the `insert()`, `update()`, and `softDelete()` helpers in `local-database.ts` to ensure the `_sync_queue` is populated.

> [!WARNING]
> **Data Types**: SQLite is loosely typed. Ensure dates are consistently stored as ISO-8601 strings to avoid comparison logic errors during sync.

> [!TIP]
> **Testing Sync**: When testing the Sync engine, look at the browser's LocalStorage `dumosrx_db` or use the `SQL` console if available in your debug tools.

## 🚀 Current Roadmap & Pending Tasks
- [ ] Complete the **Sales Dashboard** with real-time sync status indicators.
- [ ] Implement **Barcode Scanning** integration for the POS.
- [ ] Enhance **Report Generation** (PDF/Excel) for regulatory audits.

---

*This document was last updated on 2026-04-01. Move forward with precision and elegance.*
