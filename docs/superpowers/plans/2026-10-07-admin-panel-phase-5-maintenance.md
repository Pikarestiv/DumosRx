# Admin Panel Phase 5 — Maintenance & Migration Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the operator a safe, visible, audited way to see and apply pending production migrations, and retire the secret-in-a-URL endpoint that currently does it.

**Architecture:** An `AdminMaintenanceService` reads Laravel's migrator state directly (ran vs. files on disk) rather than parsing command output, and applies pending migrations through a literal `Artisan::call('migrate', ['--force' => true])`. A thin `AdminMaintenanceController` exposes two `role:super_admin` routes. The web panel gets an informational card on `/admin/operations` and a dedicated, four-layer-gated `/admin/maintenance` page carrying the one action.

**Tech Stack:** Laravel 11 (`Illuminate\Database\Migrations\Migrator`, `Artisan`, `ActivityLog`), Next.js 16 + TanStack Query + Shadcn (`AlertDialog`), Vitest, PHPUnit.

**Spec:** `docs/superpowers/specs/2026-10-07-admin-panel-phase-5-maintenance-design.md`

## Global Constraints

- Files stay **strictly below 350 lines** (`.agents/AGENTS.md` §4).
- **No explanatory inline comments**; max 2 lines for a genuine hyper-local hack. Decisions go in the spec or an `AGENTS.md` (§3).
- **No hardcoded colors** — semantic theme tokens only (`bg-card`, `text-muted-foreground`, `border-border`). No hex (§6).
- **Dates render DD/MM/YYYY** via the existing `formatDateToDDMMYYYY` (§6).
- **Never `window.confirm`** — Shadcn `AlertDialog` only (§9).
- **No `NOW()`/`CURRENT_TIMESTAMP()`** in any SQL this phase adds; Eloquent writes timestamps in UTC (§7).
- **No dynamic bracket lookup from input** (§8). The migrate command name and its flags are literals; nothing about the invocation comes from request data.
- **Pagination ≤ 50** anywhere a list could grow (§8). The pending list is bounded by the migrations directory, but the response caps displayed output.
- Controller/Service separation: controllers route and validate, services hold logic (§4).
- Every code change ships its doc update **in the same change** (§2).

## Review Focus

Five things the spec implies that no single task's happy path exercises, most likely to bite first:

1. **An unreadable `migrations` table must yield `unknown`, never `0 pending`.** "0 pending" is indistinguishable from "up to date" and is precisely the lie A-170 was. Pinned in Task 2.
2. **A migration that fails midway still needs its audit entry.** The record of a failed migration matters more than a successful one; a `try` that logs only on success loses exactly the event worth having. Pinned in Task 3.
3. **A request that times out mid-migration loses its response while the migration may still apply.** The operator's source of truth must be re-read state, not the request outcome — so both the run response and the page must re-read. Pinned in Tasks 3 and 6.
4. **The custom-role refusal must prove it reached `role:super_admin`.** `AdminRoleService::createRole()` grants `manage_platform` itself, so a test that merely sees a 403 may be watching the outer group gate. Pinned in Task 4.
5. **Destructive detection reads source text, so it must not claim certainty.** A false positive (the word in a comment) is acceptable; silently implying "none flagged = safe" is not. Pinned in Task 2 and in the dialog copy in Task 6.

---

### Task 1: `AdminMaintenanceService` — read migrator state

**Files:**
- Create: `laravel-server/app/Services/Admin/AdminMaintenanceService.php`
- Test: `laravel-server/tests/Feature/Admin/AdminMaintenanceStatusTest.php`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `migrationStatus(): array` returning
  `['status' => 'ok'|'unknown', 'pending' => array<int, array{name: string, alters_existing_data: bool}>, 'pending_count' => int, 'last_batch' => int|null, 'last_ran_at' => string|null, 'error' => string|null]`

- [ ] **Step 1: Write the failing test for the pending list**

```php
public function test_it_lists_pending_migrations_in_apply_order(): void
{
    $status = app(AdminMaintenanceService::class)->migrationStatus();

    $this->assertSame('ok', $status['status']);
    $this->assertIsArray($status['pending']);
    $this->assertSame(count($status['pending']), $status['pending_count']);
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `php artisan test --filter=AdminMaintenanceStatusTest`
Expected: FAIL — `Class "App\Services\Admin\AdminMaintenanceService" not found`

- [ ] **Step 3: Implement `migrationStatus()`**

```php
<?php

namespace App\Services\Admin;

use Illuminate\Database\Migrations\Migrator;
use Illuminate\Support\Facades\File;

class AdminMaintenanceService
{
    private const DESTRUCTIVE_PATTERNS = [
        'dropColumn', 'dropIfExists', '->drop(', 'renameColumn', 'Schema::rename', 'truncate', 'delete(',
    ];

    public function __construct(private Migrator $migrator) {}

    public function migrationStatus(): array
    {
        try {
            $ran = $this->migrator->getRepository()->getRan();
            $batches = $this->migrator->getRepository()->getMigrationBatches();
        } catch (\Throwable $e) {
            return [
                'status' => 'unknown',
                'pending' => [],
                'pending_count' => 0,
                'last_batch' => null,
                'last_ran_at' => null,
                'error' => $e->getMessage(),
            ];
        }

        $files = $this->migrator->getMigrationFiles([database_path('migrations')]);
        $pending = [];

        foreach ($files as $name => $path) {
            if (! in_array($name, $ran, true)) {
                $pending[] = [
                    'name' => $name,
                    'alters_existing_data' => $this->altersExistingData($path),
                ];
            }
        }

        return [
            'status' => 'ok',
            'pending' => $pending,
            'pending_count' => count($pending),
            'last_batch' => empty($batches) ? null : max($batches),
            'last_ran_at' => null,
            'error' => null,
        ];
    }

    private function altersExistingData(string $path): bool
    {
        $source = File::get($path);
        $up = $this->upMethodBody($source);

        foreach (self::DESTRUCTIVE_PATTERNS as $pattern) {
            if (str_contains($up, $pattern)) {
                return true;
            }
        }

        return false;
    }

    private function upMethodBody(string $source): string
    {
        $start = strpos($source, 'function up(');

        if ($start === false) {
            return '';
        }

        $end = strpos($source, 'function down(', $start);

        return $end === false ? substr($source, $start) : substr($source, $start, $end - $start);
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `php artisan test --filter=AdminMaintenanceStatusTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminMaintenanceService.php laravel-server/tests/Feature/Admin/AdminMaintenanceStatusTest.php
git commit -m "feat: read migrator state for the admin maintenance panel"
```

---

### Task 2: The two cases the happy path hides — `unknown`, and destructive detection

**Files:**
- Modify: `laravel-server/tests/Feature/Admin/AdminMaintenanceStatusTest.php`
- Create: `laravel-server/tests/fixtures/migrations/2026_01_01_000000_additive_fixture.php`
- Create: `laravel-server/tests/fixtures/migrations/2026_01_01_000001_destructive_fixture.php`
- Modify: `laravel-server/app/Services/Admin/AdminMaintenanceService.php` (only if a test proves it wrong)

**Interfaces:**
- Consumes: `AdminMaintenanceService::migrationStatus()` from Task 1.
- Produces: no new signature.

- [ ] **Step 1: Write the failing test for the unknown state (Review Focus 1)**

```php
/**
 * "0 pending" is indistinguishable from "up to date" and is exactly the
 * false statement A-170 consisted of.
 */
public function test_an_unreadable_migrations_table_is_unknown_not_zero_pending(): void
{
    Schema::drop('migrations');

    $status = app(AdminMaintenanceService::class)->migrationStatus();

    $this->assertSame('unknown', $status['status']);
    $this->assertNotSame(0, $status['pending_count'], 'unknown must not be reported as zero pending');
    $this->assertNotNull($status['error']);
}
```

- [ ] **Step 2: Run it**

Run: `php artisan test --filter=test_an_unreadable_migrations_table_is_unknown`
Expected: FAIL — `pending_count` is `0`, which the assertion rejects.

- [ ] **Step 3: Make `unknown` carry a null count rather than zero**

In `migrationStatus()`'s `catch`, change `'pending_count' => 0` to `'pending_count' => null`, and widen the Produces type to `int|null`. A null count is what lets every consumer — card, page, future cron check — distinguish "none" from "don't know" without re-deriving it from `status`.

- [ ] **Step 4: Run it to verify it passes**

Run: `php artisan test --filter=test_an_unreadable_migrations_table_is_unknown`
Expected: PASS

- [ ] **Step 5: Write the failing tests for destructive detection (Review Focus 5)**

```php
public function test_it_flags_a_pending_migration_that_removes_a_column(): void
{
    $service = app(AdminMaintenanceService::class);

    $this->assertTrue($service->fileAltersExistingData(
        base_path('tests/fixtures/migrations/2026_01_01_000001_destructive_fixture.php')
    ));
}

public function test_it_does_not_flag_a_purely_additive_migration(): void
{
    $service = app(AdminMaintenanceService::class);

    $this->assertFalse($service->fileAltersExistingData(
        base_path('tests/fixtures/migrations/2026_01_01_000000_additive_fixture.php')
    ));
}

/** The scan reads source text, so a drop in down() must not flag the migration. */
public function test_it_does_not_flag_a_migration_whose_drop_is_only_in_down(): void
{
    $service = app(AdminMaintenanceService::class);

    $this->assertFalse($service->fileAltersExistingData(
        base_path('tests/fixtures/migrations/2026_01_01_000000_additive_fixture.php')
    ));
}
```

The additive fixture must contain a `dropColumn` inside `down()` — that is what makes the third test meaningful rather than a duplicate of the second:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            $table->string('fixture_additive')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            $table->dropColumn('fixture_additive');
        });
    }
};
```

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            $table->dropColumn('fixture_destructive');
        });
    }

    public function down(): void
    {
        Schema::table('feedback', function (Blueprint $table) {
            $table->string('fixture_destructive')->nullable();
        });
    }
};
```

- [ ] **Step 6: Run them**

Run: `php artisan test --filter=AdminMaintenanceStatusTest`
Expected: FAIL — `fileAltersExistingData` does not exist (it is `private altersExistingData`).

- [ ] **Step 7: Promote the scan to a testable seam**

Rename `altersExistingData()` to `public function fileAltersExistingData(string $path): bool`. The `up()`-body extraction stays private. Testing it through a fixture file is the only way to pin that a `down()`-only drop is not flagged, and that case is the whole reason the extraction exists.

- [ ] **Step 8: Run the whole file**

Run: `php artisan test --filter=AdminMaintenanceStatusTest`
Expected: PASS, 5 tests

- [ ] **Step 9: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminMaintenanceService.php laravel-server/tests/Feature/Admin/AdminMaintenanceStatusTest.php laravel-server/tests/fixtures/migrations/
git commit -m "feat: distinguish unknown migration status from zero pending and flag destructive migrations"
```

---

### Task 3: Running migrations — literal invocation, honest failure, audit on both paths

**Files:**
- Modify: `laravel-server/app/Services/Admin/AdminMaintenanceService.php`
- Test: `laravel-server/tests/Feature/Admin/AdminMaintenanceRunTest.php`

**Interfaces:**
- Consumes: `migrationStatus()` from Tasks 1–2.
- Produces: `runPendingMigrations(string $actorId): array` returning
  `['ok' => bool, 'applied' => array<int, string>, 'output' => string, 'status_after' => array]`

- [ ] **Step 1: Write the failing test that `--seed` is never passed (spec Part 2, A-174)**

```php
/**
 * The endpoint this replaces ran `migrate --seed --force`, reseeding
 * production on every call. The invocation is asserted directly because
 * this is the defect that made automating the old endpoint unsafe.
 */
public function test_it_runs_migrate_without_seeding(): void
{
    Artisan::shouldReceive('call')->once()
        ->with('migrate', ['--force' => true])
        ->andReturn(0);
    Artisan::shouldReceive('output')->andReturn('Nothing to migrate.');

    app(AdminMaintenanceService::class)->runPendingMigrations($this->actor()->id);
}
```

- [ ] **Step 2: Run it**

Run: `php artisan test --filter=AdminMaintenanceRunTest`
Expected: FAIL — `runPendingMigrations` does not exist.

- [ ] **Step 3: Implement `runPendingMigrations()`**

```php
public function runPendingMigrations(string $actorId): array
{
    $before = array_column($this->migrationStatus()['pending'] ?? [], 'name');

    $ok = true;
    $output = '';

    try {
        Artisan::call('migrate', ['--force' => true]);
        $output = Artisan::output();
    } catch (\Throwable $e) {
        $ok = false;
        $output = $e->getMessage();
    }

    $after = $this->migrationStatus();
    $applied = array_values(array_diff($before, array_column($after['pending'] ?? [], 'name')));

    ActivityLog::create([
        'user_id' => $actorId,
        'action' => 'MIGRATIONS_RUN',
        'description' => $ok
            ? 'Applied '.count($applied).' pending migration(s)'
            : 'Migration run FAILED after applying '.count($applied).' migration(s)',
        'properties' => [
            'applied' => $applied,
            'ok' => $ok,
            'pending_after' => $after['pending_count'],
        ],
    ]);

    return [
        'ok' => $ok,
        'applied' => $applied,
        'output' => Str::limit($output, self::MAX_OUTPUT_LENGTH),
        'status_after' => $after,
    ];
}
```

Add `private const MAX_OUTPUT_LENGTH = 20000;` — migrator output on 156 migrations is unbounded otherwise, and this response goes into a JSON payload the browser holds.

- [ ] **Step 4: Run it to verify it passes**

Run: `php artisan test --filter=test_it_runs_migrate_without_seeding`
Expected: PASS

- [ ] **Step 5: Write the failing test for the audit entry on failure (Review Focus 2)**

```php
public function test_a_failed_run_still_records_what_happened(): void
{
    Artisan::shouldReceive('call')->once()->andThrow(new \RuntimeException('SQLSTATE[42S01]'));
    Artisan::shouldReceive('output')->andReturn('');

    $result = app(AdminMaintenanceService::class)->runPendingMigrations($this->actor()->id);

    $this->assertFalse($result['ok']);
    $this->assertDatabaseHas('activity_logs', ['action' => 'MIGRATIONS_RUN']);
    $this->assertStringContainsString('FAILED', ActivityLog::latest('id')->first()->description);
}
```

- [ ] **Step 6: Run it**

Run: `php artisan test --filter=test_a_failed_run_still_records`
Expected: PASS if Step 3's `catch` is correct; FAIL if the implementation drifted to logging only on success. If it passes immediately, verify by temporarily moving the `ActivityLog::create` inside the `try` and re-running — a test that cannot fail proves nothing.

- [ ] **Step 7: Write the failing test that the response re-reads state (Review Focus 3)**

```php
/**
 * A request that times out mid-migration loses its response while the
 * migration may still be applying, so the operator's source of truth has
 * to be re-read state rather than the request outcome.
 */
public function test_the_result_carries_the_freshly_read_status(): void
{
    Artisan::shouldReceive('call')->once()->andReturn(0);
    Artisan::shouldReceive('output')->andReturn('Nothing to migrate.');

    $result = app(AdminMaintenanceService::class)->runPendingMigrations($this->actor()->id);

    $this->assertArrayHasKey('status_after', $result);
    $this->assertSame('ok', $result['status_after']['status']);
    $this->assertArrayHasKey('pending_count', $result['status_after']);
}
```

- [ ] **Step 8: Run the whole file**

Run: `php artisan test --filter=AdminMaintenanceRunTest`
Expected: PASS, 3 tests

- [ ] **Step 9: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminMaintenanceService.php laravel-server/tests/Feature/Admin/AdminMaintenanceRunTest.php
git commit -m "feat: apply pending migrations with an audit trail on both success and failure"
```

---

### Task 4: Controller, routes, and retiring `GET /migrate-db`

**Files:**
- Create: `laravel-server/app/Http/Controllers/Api/Admin/AdminMaintenanceController.php`
- Modify: `laravel-server/routes/api.php`
- Modify: `laravel-server/routes/web.php` (delete the `/migrate-db` route)
- Test: `laravel-server/tests/Feature/Admin/AdminMaintenanceEndpointGateTest.php`

**Interfaces:**
- Consumes: `AdminMaintenanceService::migrationStatus()`, `runPendingMigrations(string $actorId)`.
- Produces: `GET /api/v1/admin/maintenance/migrations`, `POST /api/v1/admin/maintenance/migrations/run`.

- [ ] **Step 1: Write the failing gate test, including the A-141 shape (Review Focus 4)**

```php
public function test_only_super_admin_may_read_or_run_migrations(): void
{
    $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

    $this->actingAs($this->makeAdmin('super_admin'))
        ->getJson('/api/v1/admin/maintenance/migrations')->assertOk();

    foreach (['platform_admin', 'agent'] as $role) {
        $this->actingAs($this->makeAdmin($role))
            ->getJson('/api/v1/admin/maintenance/migrations')->assertStatus(403);
        $this->actingAs($this->makeAdmin($role))
            ->postJson('/api/v1/admin/maintenance/migrations/run')->assertStatus(403);
    }
}

/**
 * createRole() grants `manage_platform` itself, so this role clears the outer
 * admin group gate — the 403 below is `role:super_admin` answering, which the
 * assertion makes explicit rather than assuming.
 */
public function test_a_custom_platform_role_is_refused(): void
{
    $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

    $slug = app(AdminRoleService::class)
        ->createRole('Ops Watcher', ['view_platform_data'], $this->makeAdmin('super_admin')->id)->slug;

    $this->assertContains(
        'manage_platform',
        Role::where('slug', $slug)->firstOrFail()->permissions->pluck('slug')->all(),
        'the gate under test is only exercised if the caller clears the admin group gate first'
    );

    $this->actingAs($this->makeAdmin($slug))
        ->postJson('/api/v1/admin/maintenance/migrations/run')->assertStatus(403);
}

public function test_the_retired_migrate_db_route_no_longer_exists(): void
{
    $this->get('/migrate-db?key=anything')->assertNotFound();
}
```

- [ ] **Step 2: Run it**

Run: `php artisan test --filter=AdminMaintenanceEndpointGateTest`
Expected: FAIL — routes not registered (404 on the admin paths), and `/migrate-db` still resolves.

- [ ] **Step 3: Write the controller**

```php
<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Admin\AdminMaintenanceService;
use Illuminate\Support\Facades\Auth;

class AdminMaintenanceController extends AdminBaseController
{
    public function __construct(private AdminMaintenanceService $maintenance) {}

    public function migrations()
    {
        return response()->json($this->maintenance->migrationStatus());
    }

    public function runMigrations()
    {
        $result = $this->maintenance->runPendingMigrations(Auth::id());

        return response()->json($result, $result['ok'] ? 200 : 500);
    }
}
```

The non-2xx on failure is the A-174 fix and is the reason this cannot be a bare `response()->json($result)`.

- [ ] **Step 4: Register the routes**

In `routes/api.php`, inside the existing `permission:manage_platform` admin group, beside the other `role:super_admin` entries:

```php
Route::get('/maintenance/migrations', [AdminMaintenanceController::class, 'migrations'])->middleware('role:super_admin');
Route::post('/maintenance/migrations/run', [AdminMaintenanceController::class, 'runMigrations'])->middleware('role:super_admin');
```

- [ ] **Step 5: Delete the retired route**

Remove the whole `Route::get('/migrate-db', …)` closure from `routes/web.php`.

- [ ] **Step 6: Run the gate test**

Run: `php artisan test --filter=AdminMaintenanceEndpointGateTest`
Expected: PASS, 3 tests

- [ ] **Step 7: Update the docs the deletion just falsified (§2)**

Rewrite `laravel-server/AGENTS.md`'s "Running things" production paragraph: the migrate path is now `POST /api/v1/admin/maintenance/migrations/run` via the admin panel's Maintenance page, super_admin only, audited. Remove the `MIGRATE_DB_KEY` instructions. Keep and keep prominent the standing warning that **a written migration is not a live one**, plus the §7 timestamp note and the PHP-timeout hazard from spec Part 4.

- [ ] **Step 8: Commit**

```bash
git add laravel-server/app/Http/Controllers/Api/Admin/AdminMaintenanceController.php laravel-server/routes/api.php laravel-server/routes/web.php laravel-server/tests/Feature/Admin/AdminMaintenanceEndpointGateTest.php laravel-server/AGENTS.md
git commit -m "feat: expose super_admin-gated migration endpoints and retire the migrate-db route"
```

---

### Task 5: Operations card — "N pending", never a false zero

**Files:**
- Create: `web/lib/api/admin-hooks-maintenance.ts`
- Create: `web/components/admin/operations/migration-status-card.tsx`
- Modify: `web/app/admin/operations/page.tsx`
- Modify: `web/lib/types/admin.ts`
- Test: `web/__tests__/admin-migration-status-card.test.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/admin/maintenance/migrations` from Task 4.
- Produces: `useAdminMigrationStatus(enabled?: boolean)`; `MigrationStatusCardView({ data })`; types `AdminMigrationStatus`, `PendingMigration`.

- [ ] **Step 1: Add the types**

```ts
export interface PendingMigration {
  name: string;
  alters_existing_data: boolean;
}

export interface AdminMigrationStatus {
  status: "ok" | "unknown";
  pending: PendingMigration[];
  pending_count: number | null;
  last_batch: number | null;
  last_ran_at: string | null;
  error: string | null;
}
```

- [ ] **Step 2: Write the failing tests (Review Focus 1)**

```tsx
describe("MigrationStatusCardView", () => {
  it("reports how many migrations are pending", () => {
    render(<MigrationStatusCardView data={{ status: "ok", pending: [{ name: "m1", alters_existing_data: false }], pending_count: 1, last_batch: 7, last_ran_at: null, error: null }} />);

    expect(screen.getByText(/1 migration pending/i)).toBeDefined();
  });

  it("says the schema is up to date when nothing is pending", () => {
    render(<MigrationStatusCardView data={{ status: "ok", pending: [], pending_count: 0, last_batch: 7, last_ran_at: null, error: null }} />);

    expect(screen.getByText(/up to date/i)).toBeDefined();
  });

  /** Phase 1's rule, and the exact false statement A-170 consisted of. */
  it("renders unavailable rather than zero pending when the status is unknown", () => {
    render(<MigrationStatusCardView data={{ status: "unknown", pending: [], pending_count: null, last_batch: null, last_ran_at: null, error: "no such table: migrations" }} />);

    expect(screen.getByText(/unavailable/i)).toBeDefined();
    expect(screen.queryByText(/up to date/i)).toBeNull();
    expect(screen.queryByText(/0 migrations pending/i)).toBeNull();
  });

  it("does not crash before the payload arrives", () => {
    render(<MigrationStatusCardView data={undefined} />);

    expect(screen.getByText(/unavailable/i)).toBeDefined();
  });
});
```

- [ ] **Step 3: Run them**

Run: `npx vitest run __tests__/admin-migration-status-card.test.tsx`
Expected: FAIL — cannot resolve `@/components/admin/operations/migration-status-card`

- [ ] **Step 4: Write the hook**

```ts
export const useAdminMigrationStatus = (enabled = true) =>
  useQuery({
    queryKey: useScopedKey(["admin-migration-status"]),
    queryFn: () => webApiClient.request<AdminMigrationStatus>("admin/maintenance/migrations"),
    enabled,
    staleTime: 60 * 1000,
  });
```

- [ ] **Step 5: Write the card**

Three states, matching spec Part 1's table. Pending renders amber via semantic tokens (no hex), links to `/admin/maintenance`, and pluralises ("1 migration pending" / "3 migrations pending"). `status !== "ok"` or an absent payload renders "Migration status unavailable" and **never** the up-to-date or zero-pending copy.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run __tests__/admin-migration-status-card.test.tsx`
Expected: PASS, 4 tests

- [ ] **Step 7: Mount it on the operations page**

Add `<MigrationStatusCard />` alongside `<SyncHealthCard />`. The card fetches its own data; the page owns no new state.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no output

```bash
git add web/lib/api/admin-hooks-maintenance.ts web/components/admin/operations/migration-status-card.tsx web/app/admin/operations/page.tsx web/lib/types/admin.ts web/__tests__/admin-migration-status-card.test.tsx
git commit -m "feat: surface pending migrations on the admin operations page"
```

---

### Task 6: The `/admin/maintenance` page and its confirmation

**Files:**
- Create: `web/app/admin/maintenance/page.tsx`
- Create: `web/components/admin/maintenance/pending-migrations-panel.tsx`
- Create: `web/components/admin/maintenance/run-migrations-dialog.tsx`
- Modify: `web/components/admin/sidebar-items.ts`
- Modify: `web/lib/api/admin-hooks-maintenance.ts`
- Test: `web/__tests__/admin-maintenance-gate.test.tsx`, `web/__tests__/admin-run-migrations-dialog.test.tsx`

**Interfaces:**
- Consumes: `useAdminMigrationStatus`, `AdminMigrationStatus`, `PendingMigration`.
- Produces: `useRunMigrationsMutation()`; `PendingMigrationsPanel`; `RunMigrationsDialog({ open, onOpenChange, pending, isPending, onConfirm })`.

- [ ] **Step 1: Write the failing page-guard test (spec Part 3, layer 3)**

```tsx
/** web/AGENTS.md: a surface gated more narrowly than the layout needs its own
 * page guard, and a refused role must issue no request at all. */
it("renders the refusal and fetches nothing for a non-super_admin", () => {
  const requestSpy = vi.fn();
  useAdminAuthStore.setState({ user: { role: "platform_admin" } as never });

  render(<MaintenancePage />);

  expect(screen.getByText(/only available to super admins/i)).toBeDefined();
  expect(requestSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run __tests__/admin-maintenance-gate.test.tsx`
Expected: FAIL — cannot resolve `@/app/admin/maintenance/page`

- [ ] **Step 3: Write the page with the guard before any fetch**

Copy the shape of `web/app/admin/subscriptions/page.tsx` exactly: `checkIsSuperAdmin(user?.role)` returning a `NotAvailable` state with a link back to Overview, **before** rendering the content component that calls the hook. The hook must live in the child, not the page, so a refused role mounts nothing that fetches.

- [ ] **Step 4: Add the nav item gated to match (layer 2)**

```ts
{
  id: "maintenance",
  name: "Maintenance",
  icon: Wrench,
  href: "/admin/maintenance",
},
```

No `roles` key means `SUPER_ADMIN_ONLY` per `visibleSidebarItems`, which is the gate the endpoints enforce.

- [ ] **Step 5: Write the failing dialog tests (Review Focus 5, §9)**

```tsx
it("names the count and warns specifically when a migration alters existing data", () => {
  render(<RunMigrationsDialog open pending={[
    { name: "2026_01_01_000000_add_col", alters_existing_data: false },
    { name: "2026_01_01_000001_drop_col", alters_existing_data: true },
  ]} isPending={false} onOpenChange={() => {}} onConfirm={() => {}} />);

  expect(screen.getByText(/2 pending/i)).toBeDefined();
  expect(screen.getByText(/alter or remove existing data/i)).toBeDefined();
  expect(screen.getByText(/cannot be rolled back/i)).toBeDefined();
});

it("omits the destructive warning when every pending migration is additive", () => {
  render(<RunMigrationsDialog open pending={[{ name: "m1", alters_existing_data: false }]} isPending={false} onOpenChange={() => {}} onConfirm={() => {}} />);

  expect(screen.queryByText(/alter or remove existing data/i)).toBeNull();
});
```

- [ ] **Step 6: Run them**

Run: `npx vitest run __tests__/admin-run-migrations-dialog.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 7: Write the dialog**

A Shadcn `AlertDialog` (never `window.confirm`, §9). Copy states the count; when any `alters_existing_data` is true it adds the count of those and the sentence about this host being unable to roll back a half-failed migration. Confirm button is destructive-variant and disabled while `isPending`.

- [ ] **Step 8: Write the panel and the mutation**

The panel lists each pending migration by name in order, badging the destructive ones, and renders the run action. On success it invalidates the migration-status query — Review Focus 3: the post-run truth is re-read state, not the mutation's return value — and shows `applied` plus the capped `output`.

```ts
export const useRunMigrationsMutation = () => {
  const queryClient = useQueryClient();
  const key = useScopedKey(["admin-migration-status"]);

  return useMutation({
    mutationFn: () => webApiClient.request("admin/maintenance/migrations/run", { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
};
```

`onSettled`, not `onSuccess`: a failed or timed-out run is exactly when the pending list must be re-read.

- [ ] **Step 9: Run both test files and typecheck**

Run: `npx vitest run __tests__/admin-maintenance-gate.test.tsx __tests__/admin-run-migrations-dialog.test.tsx && npx tsc --noEmit`
Expected: PASS, 3 tests; no tsc output

- [ ] **Step 10: Commit**

```bash
git add web/app/admin/maintenance web/components/admin/maintenance web/components/admin/sidebar-items.ts web/lib/api/admin-hooks-maintenance.ts web/__tests__/admin-maintenance-gate.test.tsx web/__tests__/admin-run-migrations-dialog.test.tsx
git commit -m "feat: add the super_admin-gated maintenance page with a migration runner"
```

---

### Task 7: Full verification, docs, and the UI smoke test §9 requires

**Files:**
- Modify: `web/AGENTS.md`, `laravel-server/AGENTS.md`
- Modify: `docs/KNOWN_BUGS.md`, `docs/FIXED_BUGS.md`

- [ ] **Step 1: Run every suite**

```bash
cd laravel-server && php artisan test
cd ../web && npm test -- --run && npx tsc --noEmit
cd ../web && TZ=America/New_York npm test -- --run
```
Expected: all green. The EDT run matters because this phase renders timestamps.

- [ ] **Step 2: Check the line limits (§4)**

```bash
wc -l laravel-server/app/Services/Admin/AdminMaintenanceService.php laravel-server/app/Http/Controllers/Api/Admin/AdminMaintenanceController.php web/app/admin/maintenance/page.tsx web/components/admin/maintenance/*.tsx
```
Expected: every file under 350.

- [ ] **Step 3: The logged-in browser smoke test (§9)**

§9 is explicit that backend verification is not UI verification, and this phase is entirely role-gated. Against a local dev server, logged in as super_admin: the Maintenance nav item appears, the page lists pending migrations, and the dialog shows the right copy. Then as `platform_admin`: the nav item is **absent**, and navigating to `/admin/maintenance` directly shows the refusal with **no request fired** (confirm in the network panel, not by inference).

Do **not** run migrations against production as part of this. The operator runs those.

- [ ] **Step 4: Update the docs (§2)**

- `web/AGENTS.md`: a "Maintenance (Phase 5)" section — the four-layer gate, why the runner lives on its own page rather than as an action on Operations, and the rule that an unknown migration status renders unavailable and never "0 pending".
- `laravel-server/AGENTS.md`: already rewritten in Task 4 Step 7; verify it now matches what shipped.
- `docs/KNOWN_BUGS.md`: **A-174 is fixed by this phase** — move it to `docs/FIXED_BUGS.md` and remove it here outright, never marked done in place. **A-170 is not** — the mechanism is fixed but production is still behind until the operator runs them; edit it to say exactly that and keep it open.
- `docs/FEATURE_ROADMAP_SPEC.md` / `docs/SYSTEM_FEATURES_DOCUMENTATION.md`: if the migration runner appears in the roadmap, move it across per §2.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: record the phase 5 maintenance architecture and close A-174"
```
