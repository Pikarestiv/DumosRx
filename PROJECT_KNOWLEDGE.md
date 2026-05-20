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
- **Single Source of Truth**: The `medicines` table is the primary stock ledger (contains `stock_quantity`, `reorder_level`, `expiry_date`). The `inventory` table is an auxiliary ledger for batch/location and should NOT be used for general stock tracking, as it may be empty.
- **Shared Stats**: We use a centralized `useInventoryStats` hook (`client/lib/hooks/use-inventory-stats.ts`) to calculate aggregate metrics (Total, Active, Low Stock, Expiring) directly from the `medicines` table to ensure consistency across the Dashboard, Inventory, and POS modules.
- **Active Medicines vs Low Stock**: Do not let a computed stock status (like "low_stock") overwrite the boolean `is_active` flag. The system now counts all non-expired, non-deleted medicines as "Active", avoiding reliance on a potentially corrupted `is_active` flag.
- **NAFDAC Compliance**: Fields for regulatory numbers and batch tracking.
- **Category Hierarchy**: Linked to therapeutic classes.

### 2. CRM & Sales
- **Customer Profiles**: Tracking loyalty points and chronic conditions.
- **POS Flow**: Designed for speed. Supports split payments (Cash, Transfer, Card). Queries `medicines` with `_deleted = 0` to show available stock, avoiding virtual filters like `is_active`.

### 3. Supplier Management
- **Vendor Rating**: Metrics for reliability and lead time.
- **Payment Terms**: 30/60/90 day credit tracking for Nigerian distributors.

---

## 🔐 Authentication & Session Management (Hybrid Challenges)
Since DumosRx is an offline-first app (web/Tauri), session management presents unique challenges:
- **Cloud Linking**: The local app communicates with the cloud backend using a token (`auth_token`). When this token expires (e.g., throwing a `401 Unauthenticated`), the sync engine gracefully falls back to offline mode.
- **Relinking**: The `SyncIndicator` will show a "Connection Expired" modal prompting the user to re-link via Settings.
- **Open Challenge**: Implementing refresh tokens for an app that may be offline when the refresh token expires is an ongoing architectural challenge that requires careful consideration.

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

> [!CAUTION]
> **Inventory vs Medicines tables**: Do not query the `inventory` table for stock counts or POS display. Use the `medicines` table as the ultimate source of truth.

## 💻 Coding Standards & User Preferences
- **Modularity & DRY**: Code must be highly modular, reusable, and DRY.
- **File Size**: Keep files strictly below 350 lines. Break them down if they get too large.
- **Separation of Concerns**: 
  - **Frontend**: Strictly separate business logic (e.g., custom hooks, services) from UI logic (components).
  - **Backend**: Strictly separate Controllers (routing/HTTP layer) from Services (business logic layer).
- **Quality Assurance**: After every feature addition or significant change, run `npm run build` or `npx tsc` on the frontend to ensure zero TypeScript errors.
- **Clean Code**: No unused variables or unused imports allowed.

---

## 🌍 Environment & Deployment
- **Hosting**: The server is deployed on **cPanel**. There is no local MySQL database on the development machine.
- **PHP Executable Paths**:
  - **Mac (Local)**: `/opt/homebrew/opt/php@8.2/bin/php`
  - **cPanel (Production)**: `/opt/alt/php82/usr/bin/php`

---

## 🚀 DumosRx Platform Roadmap
This section tracks the high-level strategic objectives for the DumosRx platform.

### 1. Multi-Gateway Payment Integration *(Partially Done)*
Implement a robust subscription and billing system with high availability.
- **Paystack Integration**: Primary gateway for NGN and international payments.
- **Flutterwave Backup**: Secondary gateway with automatic failover logic.
- **Subscription Logic**: Recurring billing, grace periods, and license management.

### 2. Granular RBAC & Governance
Moving beyond basic roles to permission-based access control.
- **Admin Impersonation**: Secure troubleshooting workflow for Super Admins.
- **Granular Permissions**: Fine-grained access control (e.g., view-billing, edit-inventory, manage-staff).
- **Audit Trail Expansion**: Comprehensive logging for all administrative and clinical actions.

### 3. Session & Device Management
Enhanced security and visibility for user access.
- **Active Session Tracking**: View and manage active sessions per user.
- **Device Management**: Identity verification for new devices and "Logout all" functionality.
- **Security Alerts**: Notifications for suspicious login attempts or account changes.
- **Offline Auth Challenge**: *(DONE)* Implemented robust Sliding Window Token Refresh (30-day absolute expiry, 7-day silent refresh threshold).

### 4. Global Broadcast System *(DONE)*
Real-time communication with all platform users.
- **Admin UI**: Control center for creating and targeting broadcasts.
- **Client Display**: Seamless delivery of info/warning/danger alerts to pharmacy dashboards.

### 5. Security Audit & Assessment
Hardening the platform against vulnerabilities.
- **Penetration Testing**: Manual and automated testing of all API endpoints.
- **Vulnerability Scanning**: Continuous assessment of dependencies and infrastructure.
- **Security Hardening**: Implementation of advanced XSS, SQLi, and CSRF protections.

### 6. Mailing via PHP + SMTP *(DONE/IN PROGRESS)*
- Reliable email delivery via PHPMailer for contact forms and system notifications.

### 7. Clinical & Operational
- **Sales Dashboard**: Complete dashboard with real-time sync status indicators.
- **Barcode Scanning**: Integration for the POS.
- **Report Generation**: Enhanced PDF/Excel generation for regulatory audits.

---

*This document was last updated on 2026-05-21. Move forward with precision and elegance.*
