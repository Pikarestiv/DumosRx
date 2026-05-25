# 🚀 DumosRx: Performance Optimization & Security Architecture

This document outlines the core strategies, patterns, and configurations designed to ensure high availability, fast response times, and maximum security across the DumosRx local desktop client, web app, and Laravel backend API.

---

## 🏎️ Performance Optimization Strategies

### 1. Database Indexing (Local SQLite & Cloud MySQL)
Proper indexing ensures query latency remains under 50ms even as pharmacy transactional history grows (100k+ sales records).

*   **Offline Client (SQLite)**:
    *   Since queries are executed inside a client-side WebAssembly environment, memory is constrained. Indexes are critical on query filter keys:
        ```sql
        CREATE INDEX IF NOT EXISTS idx_medicines_deleted ON medicines(_deleted);
        CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category_id);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON _sync_queue(_synced);
        ```
*   **Cloud API (MySQL)**:
    *   Index composite columns frequently used in reports and dashboards:
        ```sql
        ALTER TABLE sales ADD INDEX idx_sales_pharmacy_created (pharmacy_id, created_at);
        ALTER TABLE medicines ADD INDEX idx_med_sync (pharmacy_id, updated_at);
        ```

### 2. Database Connection Pooling (Laravel Cloud Server)
Connection creation overhead can degrade API throughput under peak sync events.
*   **Strategy**: Utilize Laravel database connection pooling (via tools like **Swoole** or **Octane**, or database proxies like **ProxySQL** / **AWS RDS Proxy** on larger infrastructure).
*   **Persistent Connections**: Set `'options' => [PDO::ATTR_PERSISTENT => true]` in `config/database.php` for standard environments, reducing handshake overhead.

### 3. Caching & State Hydration
*   **Client-Side (Zustand + TanStack Query)**:
    *   Cache static lists (e.g. suppliers, therapeutic classes) locally in SQLite and hydrate client memory using React hooks with standard cache invalidate timers (`staleTime: 1 hour`).
*   **Cloud Server (Laravel + Redis)**:
    *   Cache frequently accessed configurations, tenant subscription statuses, and aggregate sales analytics:
        ```php
        Cache::remember("pharmacy_{$id}_subscription", 3600, function () use ($id) {
            return Subscription::where('pharmacy_id', $id)->first();
        });
        ```

### 4. Pagination & Lazy Loading
Loading raw lists in table views leads to heavy layout thrashing and DOM bloat.
*   **Pagination (POS & Inventory Databases)**:
    *   All list components (like `MedicineDatabase`) query SQLite using limit offsets or cursor-based scrolling to limit page results to 50 items.
*   **Lazy Loading (Next.js Bundle Optimization)**:
    *   Lazy load complex overlays and modal dialogs (e.g., `AddMedicineDialog`, `ConfirmDialog`) using Next.js `dynamic()`:
        ```typescript
        const AddMedicineDialog = dynamic(() => import('./add-medicine-dialog').then(mod => mod.AddMedicineDialog), {
          ssr: false,
          loading: () => <DialogSkeleton />
        });
        ```

### 5. Queues & Background Processing
Heavy processes must never block the client’s request-response lifecycle.
*   **Sync Execution**:
    *   When the server receives a push payload from the client's `SyncEngine`, it immediately queues the bulk write job and returns a `202 Accepted` status code.
*   **Mailers & Notifications**:
    *   Transactions such as sending receipt PDFs or low-stock alerts are dispatched to Laravel's queue driver (Redis or Database-backed worker processing).

---

## 🔒 Security Hardening

### 1. API Rate Limiting (Cloud API Protection)
Prevent Denial of Service (DoS) and brute force attacks on sync endpoints.
*   **Throttle Sync Calls**:
    *   Apply restrictive rate limits in `routes/api.php` utilizing Laravel's built-in rate-limit middleware:
        ```php
        RateLimiter::for('sync-endpoints', function (Request $request) {
            return Limit::perMinute(30)->by($request->user()->id);
        });
        ```

### 2. Prototype Pollution Mitigation (React / TS)
Avoid vulnerabilities associated with dynamic property lookups on plain Javascript objects.
*   **Rule**: Never perform dynamic bracket lookup `obj[key]` using values fetched directly from inputs or external databases.
*   **Pattern**: Use ES6 `Map` or strict `switch` patterns:
    ```typescript
    // Secure
    const badgeMap = new Map([
      ['active', 'default'],
      ['low_stock', 'outline']
    ]);
    const variant = badgeMap.get(status) || 'secondary';
    ```

### 3. Subscriptions & License Verification (Anti-Tampering)
Offline apps are vulnerable to billing bypasses via computer clock manipulation.
*   **Sliding Window JWT Validation**:
    *   License keys are cryptographically signed JWT tokens containing custom claims (`expires_at`, `max_staff_count`, `tier`).
*   **Anti-Backdating Guards**:
    *   `LicenseGuard` persists the maximum verified timestamp seen by the app during transactions. If the local system clock is turned back prior to this timestamp, access is automatically locked down.

### 4. Load Testing and Security Auditing
*   **Load Testing**:
    *   Simulate concurrent pharmacy sync routines using **Artillery** or **k6** to validate that database connection pools and locks handle writing safely.
*   **Static Code Analysis (SAST)**:
    *   Continuous integration scans using **Semgrep** or **SecureCoder** ensure zero vulnerabilities (e.g. SQL Injection, XSS) slip into production bundles.
