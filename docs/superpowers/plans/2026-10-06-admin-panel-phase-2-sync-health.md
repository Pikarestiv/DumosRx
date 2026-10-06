# Admin Panel Phase 2 — Sync Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the server record why it refuses a sync change, and surface sync health per store in the admin panel.

**Architecture:** One recording hook in `SyncController::push()`, placed after the outer commit, reading the already-assembled `$failed` array so all eight refusal paths are covered by one call site. Refusals persist to `sync_failures` (forensic, pruned at 90 days); successes accumulate in a `sync_health_daily` tally (tiny, permanent) which also becomes the real source for the Overview's currently-dead sync success rate. Read path is a separate `AdminSyncHealthService` behind super_admin-gated endpoints.

**Tech Stack:** Laravel 11 + PHPUnit 11 (`tests/Feature`, `tests/Unit`, SQLite in-memory), Next.js 16 + React 19 + TypeScript + Vitest, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-06-admin-panel-phase-2-sync-health-design.md`

## Global Constraints

- **Phase 2 is observation only.** It must not change what the server accepts, refuses, or returns. A diff that alters a reason string, a refusal condition, or a push response field is out of scope by definition.
- **Recording must never fail a push.** Every recorder call site is wrapped in `try`/`catch` and logs on error, as `sendFirstSyncAlert()` already does for its own reasons.
- **No MySQL `NOW()`/`CURDATE()`/`CURRENT_TIMESTAMP()` in raw SQL** (`.agents/AGENTS.md` §7). This host's MySQL runs ~4 hours behind UTC; the daily bucket comes from PHP's `now()->toDateString()`.
- **Every file added or modified stays strictly under 350 lines** (§4).
- **No inline comments explaining what code does**; max 2 lines for a hyper-local hack. Decisions go in `/docs` or a package `AGENTS.md` (§3). Migrate pre-existing explanatory comments out of any file you touch.
- **Pagination caps at 50** (§8).
- **No hardcoded colors**; semantic theme tokens only (§6). Dates render `DD/MM/YYYY`.
- **No `window.confirm`**; use the Shadcn `AlertDialog`/`ConfirmDialog` (§9).
- **An unmeasurable metric renders as unavailable, never as zero** (Phase 1's rule, enforced by `web/__tests__/no-fabricated-metrics.test.ts`).
- **A nav item's gate must match its page's narrowest endpoint gate** (`web/AGENTS.md`). The new endpoints are `role:super_admin`; the Operations surface already is too.
- Docs ship in the same change as the code (§2).

## Review Focus

Input classes the spec implies that a happy-path test will miss. Each has its test assigned to the owning task.

1. **A push with zero refusals must still upsert the daily tally.** If the recorder returns early when `$failed` is empty, every successful push goes uncounted and the success rate reads 0% or null forever — reintroducing the dead-metric bug this phase exists to fix. → Task 2.
2. **A refusal that happens before store resolution** (`resolvePushStoreId` returns null) must record with `store_id = null`, not throw and lose the row. → Task 2.
3. **A multi-store owner's failures must attribute to the store named by `X-Store-Id`**, not an arbitrary first store — the exact bug `resolvePushStoreId()` was introduced to fix for `last_sync_at`. → Task 3.
4. **A push whose outer transaction rolls back must leave no `sync_failures` rows**, since nothing was applied. → Task 3.
5. **The daily bucket must not shift with the database clock.** A push at 22:00 UTC on a host whose MySQL reports ~18:00 local must land on the UTC date (§7). → Task 2.

---

### Task 1: Tables and models

**Files:**
- Create: `laravel-server/database/migrations/2026_10_07_000001_create_sync_failures_table.php`
- Create: `laravel-server/database/migrations/2026_10_07_000002_create_sync_health_daily_table.php`
- Create: `laravel-server/app/Models/SyncFailure.php`
- Create: `laravel-server/app/Models/SyncHealthDaily.php`
- Test: `laravel-server/tests/Feature/SyncHealthSchemaTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `App\Models\SyncFailure` (fillable `store_id`, `user_id`, `table_name`, `record_id`, `operation`, `reason`) and `App\Models\SyncHealthDaily` (fillable `store_id`, `date`, `pushes`, `changes_accepted`, `changes_refused`). Both use `HasUuids`. Tasks 2, 4 and 5 depend on these names.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/SyncHealthSchemaTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SyncHealthSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_sync_failures_table_has_the_forensic_columns(): void
    {
        $this->assertTrue(Schema::hasTable('sync_failures'));

        foreach (['id', 'store_id', 'user_id', 'table_name', 'record_id', 'operation', 'reason', 'created_at'] as $column) {
            $this->assertTrue(
                Schema::hasColumn('sync_failures', $column),
                "sync_failures is missing {$column}"
            );
        }
    }

    public function test_sync_health_daily_table_has_the_tally_columns(): void
    {
        $this->assertTrue(Schema::hasTable('sync_health_daily'));

        foreach (['id', 'store_id', 'date', 'pushes', 'changes_accepted', 'changes_refused'] as $column) {
            $this->assertTrue(
                Schema::hasColumn('sync_health_daily', $column),
                "sync_health_daily is missing {$column}"
            );
        }
    }

    public function test_a_sync_failure_survives_its_store_being_archived(): void
    {
        $this->assertTrue(Schema::hasTable('sync_failures'));

        $failure = \App\Models\SyncFailure::create([
            'store_id' => '00000000-0000-0000-0000-00000000dead',
            'user_id' => null,
            'table_name' => 'sales',
            'record_id' => 'rec-1',
            'operation' => 'INSERT',
            'reason' => 'permission_denied',
        ]);

        $this->assertDatabaseHas('sync_failures', ['id' => $failure->id]);
    }
}
```

The third case is the one that matters: it writes a `store_id` that matches no `stores` row. It passes only if there is **no foreign key** on that column, which is the spec's deliberate choice — archiving a store must not destroy the evidence of why its data never landed.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=SyncHealthSchemaTest`
Expected: FAIL — `Failed asserting that false is true` (table missing)

- [ ] **Step 3: Write the migrations**

Create `2026_10_07_000001_create_sync_failures_table.php`, following the shape of `2026_10_02_000005_create_user_devices_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_failures', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id')->nullable();
            $table->uuid('user_id')->nullable();
            $table->string('table_name');
            $table->string('record_id')->nullable();
            $table->string('operation', 16)->nullable();
            $table->string('reason');
            $table->timestamp('created_at')->nullable();

            $table->index(['store_id', 'created_at']);
            $table->index(['reason', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_failures');
    }
};
```

No `foreign()` calls — deliberate, per the test above. No `timestamps()`; only `created_at` is meaningful for an append-only log.

Create `2026_10_07_000002_create_sync_health_daily_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_health_daily', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('store_id')->nullable();
            $table->date('date');
            $table->unsignedInteger('pushes')->default(0);
            $table->unsignedInteger('changes_accepted')->default(0);
            $table->unsignedInteger('changes_refused')->default(0);
            $table->timestamps();

            $table->unique(['store_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_health_daily');
    }
};
```

- [ ] **Step 4: Write the models**

`app/Models/SyncFailure.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class SyncFailure extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $fillable = [
        'store_id', 'user_id', 'table_name', 'record_id', 'operation', 'reason', 'created_at',
    ];

    protected $casts = ['created_at' => 'datetime'];

    public function store()
    {
        return $this->belongsTo(Store::class);
    }
}
```

`app/Models/SyncHealthDaily.php`:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class SyncHealthDaily extends Model
{
    use HasUuids;

    protected $table = 'sync_health_daily';

    protected $fillable = ['store_id', 'date', 'pushes', 'changes_accepted', 'changes_refused'];

    protected $casts = ['date' => 'date'];
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=SyncHealthSchemaTest`
Expected: PASS, 3 tests

- [ ] **Step 6: Confirm the tables stay out of client sync**

These are server-only telemetry and must never sync to the client. `client/scripts/verify-schema-sync.ts` iterates `SYNC_CONFIG` rather than every MySQL table, so a table absent from `SYNC_CONFIG` is ignored and reports no drift — the property is enforced by simply not adding them.

Run: `cd client && npm run test:schema`
Expected: PASS, unchanged from before this task. Do **not** add either table to `SYNC_CONFIG` or `client/lib/db/schema.ts`.

- [ ] **Step 7: Commit**

```bash
git add laravel-server/database/migrations/2026_10_07_00000*.php laravel-server/app/Models/Sync*.php laravel-server/tests/Feature/SyncHealthSchemaTest.php
git commit -m "feat: add sync_failures and sync_health_daily tables for sync observability"
```

---

### Task 2: `SyncFailureRecorder` (the write path)

Separated from `SyncController` so the recording logic is testable without driving a full push, and so the controller gains one call rather than a block.

**Files:**
- Create: `laravel-server/app/Services/Sync/SyncFailureRecorder.php`
- Test: `laravel-server/tests/Feature/SyncFailureRecorderTest.php`

**Interfaces:**
- Consumes: `SyncFailure`, `SyncHealthDaily` from Task 1.
- Produces: `SyncFailureRecorder::recordPushOutcome(array $failed, array $changes, ?string $storeId, ?string $userId, int $accepted): void`. `$failed` entries are the shape `push()` builds (`id`, `table_name`, `record_id`, `reason`); `$changes` is the raw request array, used only to recover each change's `operation` by `id`. Task 3 calls this exact signature.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/SyncFailureRecorderTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;
use App\Services\Sync\SyncFailureRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class SyncFailureRecorderTest extends TestCase
{
    use RefreshDatabase;

    private const STORE = '11111111-1111-1111-1111-111111111111';

    private function recorder(): SyncFailureRecorder
    {
        return app(SyncFailureRecorder::class);
    }

    public function test_it_records_one_row_per_refused_change_with_its_operation(): void
    {
        $changes = [
            ['table_name' => 'sales', 'record_id' => 'sale-1', 'operation' => 'INSERT'],
            ['table_name' => 'customers', 'record_id' => 'cust-1', 'operation' => 'UPDATE'],
        ];
        $failed = [
            ['id' => null, 'table_name' => 'sales', 'record_id' => 'sale-1', 'reason' => 'permission_denied'],
            ['id' => null, 'table_name' => 'customers', 'record_id' => 'cust-1', 'reason' => 'forbidden'],
        ];

        $this->recorder()->recordPushOutcome($failed, $changes, self::STORE, null, 5);

        $this->assertSame(2, SyncFailure::count());
        $this->assertDatabaseHas('sync_failures', [
            'record_id' => 'sale-1',
            'reason' => 'permission_denied',
            'operation' => 'INSERT',
            'table_name' => 'sales',
        ]);
        $this->assertDatabaseHas('sync_failures', [
            'record_id' => 'cust-1',
            'reason' => 'forbidden',
            'operation' => 'UPDATE',
        ]);
    }

    /**
     * If the recorder returns early on an empty $failed, every successful push
     * goes uncounted and the success rate is dead on arrival -- the exact bug
     * this phase exists to fix.
     */
    public function test_a_push_with_no_refusals_still_counts_toward_the_daily_tally(): void
    {
        $this->recorder()->recordPushOutcome([], [], self::STORE, null, 12);

        $row = SyncHealthDaily::first();

        $this->assertNotNull($row);
        $this->assertSame(1, $row->pushes);
        $this->assertSame(12, $row->changes_accepted);
        $this->assertSame(0, $row->changes_refused);
    }

    public function test_it_accumulates_across_pushes_on_the_same_date(): void
    {
        $this->recorder()->recordPushOutcome([], [], self::STORE, null, 3);
        $this->recorder()->recordPushOutcome(
            [['id' => 1, 'table_name' => 'sales', 'record_id' => 'r1', 'reason' => 'forbidden']],
            [['id' => 1, 'table_name' => 'sales', 'operation' => 'INSERT']],
            self::STORE,
            null,
            2
        );

        $this->assertSame(1, SyncHealthDaily::count());

        $row = SyncHealthDaily::first();
        $this->assertSame(2, $row->pushes);
        $this->assertSame(5, $row->changes_accepted);
        $this->assertSame(1, $row->changes_refused);
    }

    public function test_it_starts_a_new_row_on_the_next_date(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-07 10:00:00'));
        $this->recorder()->recordPushOutcome([], [], self::STORE, null, 1);

        Carbon::setTestNow(Carbon::parse('2026-10-08 10:00:00'));
        $this->recorder()->recordPushOutcome([], [], self::STORE, null, 1);

        Carbon::setTestNow();

        $this->assertSame(2, SyncHealthDaily::count());
    }

    /**
     * §7: this host's MySQL clock runs ~4 hours behind UTC, so a bucket taken
     * from the database would misfile the last four hours of every UTC day.
     */
    public function test_the_daily_bucket_comes_from_the_application_clock_not_the_database(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-07 22:30:00'));

        $this->recorder()->recordPushOutcome([], [], self::STORE, null, 1);

        Carbon::setTestNow();

        $this->assertSame('2026-10-07', SyncHealthDaily::first()->date->toDateString());
    }

    public function test_it_records_a_refusal_that_happened_before_the_store_could_be_resolved(): void
    {
        $this->recorder()->recordPushOutcome(
            [['id' => 1, 'table_name' => 'sales', 'record_id' => 'r1', 'reason' => 'forbidden']],
            [['id' => 1, 'table_name' => 'sales', 'operation' => 'INSERT']],
            null,
            null,
            0
        );

        $this->assertDatabaseHas('sync_failures', ['record_id' => 'r1', 'store_id' => null]);
    }

    public function test_it_tolerates_a_failed_entry_with_no_matching_change(): void
    {
        $this->recorder()->recordPushOutcome(
            [['id' => null, 'table_name' => 'sales', 'record_id' => 'r1', 'reason' => 'forbidden']],
            [],
            self::STORE,
            null,
            0
        );

        $this->assertDatabaseHas('sync_failures', ['record_id' => 'r1', 'operation' => null]);
    }

    /**
     * Change entries carry no `id` in real client pushes (see
     * SyncPushSessionScopedRefusalTest), so correlating the operation on `id`
     * would record null for virtually every refusal in production.
     */
    public function test_it_resolves_the_operation_without_relying_on_a_change_id(): void
    {
        $this->recorder()->recordPushOutcome(
            [['table_name' => 'stock_batches', 'record_id' => 'batch-7', 'reason' => 'forbidden']],
            [['table_name' => 'stock_batches', 'record_id' => 'batch-7', 'operation' => 'DELETE', 'payload' => []]],
            self::STORE,
            null,
            0
        );

        $this->assertDatabaseHas('sync_failures', [
            'record_id' => 'batch-7',
            'operation' => 'DELETE',
        ]);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=SyncFailureRecorderTest`
Expected: FAIL — `Class "App\Services\Sync\SyncFailureRecorder" not found`

- [ ] **Step 3: Write the implementation**

Create `laravel-server/app/Services/Sync/SyncFailureRecorder.php`:

```php
<?php

namespace App\Services\Sync;

use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;
use Illuminate\Support\Facades\DB;

class SyncFailureRecorder
{
    public function recordPushOutcome(
        array $failed,
        array $changes,
        ?string $storeId,
        ?string $userId,
        int $accepted
    ): void {
        $this->recordFailures($failed, $changes, $storeId, $userId);
        $this->tally($storeId, $accepted, count($failed));
    }

    private function recordFailures(array $failed, array $changes, ?string $storeId, ?string $userId): void
    {
        if ($failed === []) {
            return;
        }

        $operations = [];
        foreach ($changes as $change) {
            $key = ($change['table_name'] ?? '').'|'.($change['record_id'] ?? '');
            $operations[$key] = $change['operation'] ?? null;
        }

        $now = now();

        foreach ($failed as $entry) {
            $key = ($entry['table_name'] ?? '').'|'.($entry['record_id'] ?? '');

            SyncFailure::create([
                'store_id' => $storeId,
                'user_id' => $userId,
                'table_name' => $entry['table_name'] ?? 'unknown',
                'record_id' => $entry['record_id'] ?? null,
                'operation' => $operations[$key] ?? null,
                'reason' => $entry['reason'] ?? 'unknown',
                'created_at' => $now,
            ]);
        }
    }

    private function tally(?string $storeId, int $accepted, int $refused): void
    {
        $row = SyncHealthDaily::firstOrCreate(
            ['store_id' => $storeId, 'date' => now()->toDateString()],
            ['pushes' => 0, 'changes_accepted' => 0, 'changes_refused' => 0]
        );

        $row->increment('pushes');
        if ($accepted > 0) {
            $row->increment('changes_accepted', $accepted);
        }
        if ($refused > 0) {
            $row->increment('changes_refused', $refused);
        }
    }
}
```

`now()->toDateString()` is the §7-mandated application clock. Never replace it with a database-side date expression.

**The operation lookup is keyed by `table_name|record_id`, not by `id`.** A change entry's `id` is optional — `tests/Feature/SyncPushSessionScopedRefusalTest.php` pushes `['table_name', 'operation', 'record_id', 'payload']` with no `id` at all, and `push()` itself writes `'id' => $change['id'] ?? null` into `$failed`. Correlating on `id` would therefore record `operation = null` for most real client pushes. `table_name` + `record_id` is present on both sides of every refusal path.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=SyncFailureRecorderTest`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add laravel-server/app/Services/Sync/SyncFailureRecorder.php laravel-server/tests/Feature/SyncFailureRecorderTest.php
git commit -m "feat: add SyncFailureRecorder for persisting push refusals and daily tallies"
```

---

### Task 3: Wire the recorder into `push()`

The single hook. This is the task the whole design rests on, so its tests drive a **real push** per refusal reason rather than calling the recorder directly.

**Files:**
- Modify: `laravel-server/app/Http/Controllers/Api/App/SyncController.php`
- Test: `laravel-server/tests/Feature/SyncPushFailureRecordingTest.php`

**Interfaces:**
- Consumes: `SyncFailureRecorder::recordPushOutcome()` from Task 2; the existing `resolvePushStoreId($request, $user)`.
- Produces: no new public surface. `push()`'s JSON response is **unchanged** — assert this.

- [ ] **Step 1: Write the failing test**

Create `laravel-server/tests/Feature/SyncPushFailureRecordingTest.php`.

**Copy the `setUp()` and helpers from `tests/Feature/SyncPushSessionScopedRefusalTest.php` verbatim** — it already builds exactly the fixture this task needs (an owner with `storeA`/`storeB`, a `staff` user scoped to `storeA`, the `cloud_sync` system config, and `Schema::disableForeignKeyConstraints()`), and it already proves which payloads trigger which reason. Its push helper is:

```php
private function push(User $actor, string $table, string $operation, string $recordId, array $payload)
{
    return $this->actingAs($actor)->postJson('/api/v1/app/sync/push', [
        'setup' => true,
        'changes' => [
            [
                'table_name' => $table,
                'operation' => $operation,
                'record_id' => $recordId,
                'payload' => $payload,
            ],
        ],
    ]);
}
```

Note there is **no `id` key** — this is the shape Task 2's operation lookup must handle.

The reason-triggering cases, each reusing a payload builder from that file rather than inventing one:

```php
public function test_a_permission_denied_refusal_is_recorded(): void
{
    $foreignStore = $this->makeStore(
        User::create([
            'first_name' => 'Other', 'last_name' => 'Tenant',
            'email' => 'other-tenant@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]),
        'Other Tenant Store',
        'other-tenant-store'
    );

    $this->push($this->staff, 'customer_payments', 'INSERT', 'pay-denied',
        $this->paymentPayload('pay-denied', $foreignStore->id))->assertOk();

    $this->assertDatabaseHas('sync_failures', [
        'record_id' => 'pay-denied',
        'table_name' => 'customer_payments',
        'operation' => 'INSERT',
        'reason' => 'permission_denied',
    ]);
}

public function test_a_forbidden_refusal_is_recorded(): void
{
    $this->push($this->staff, 'customer_payments', 'INSERT', 'pay-forbidden',
        $this->paymentPayload('pay-forbidden', $this->storeB->id))->assertOk();

    $this->assertDatabaseHas('sync_failures', [
        'record_id' => 'pay-forbidden',
        'reason' => 'forbidden',
    ]);
}

public function test_an_unsupported_operation_refusal_is_recorded(): void
{
    $this->push($this->owner, 'customer_payments', 'UPSERT', 'pay-bad-op', [])
        ->assertStatus(422);

    $this->assertDatabaseMissing('sync_failures', ['record_id' => 'pay-bad-op']);
}
```

The third case is deliberately an **assert-nothing-recorded**: `changes.*.operation` is validated `in:INSERT,UPDATE,DELETE` at the top of `push()`, so an unknown operation never reaches the loop and must not produce a row. Confirm that validation is still in place when writing it; if a path does reach the `unsupported_operation` append at line 611, invert this into a positive assertion instead.

For the conflict reason and the stock-delta path (line 1212), read `tests/Feature/SyncPushStoreIdBackfillTransactionalTest.php` and `tests/Feature/` for the existing tests that already trigger them, and reuse their payloads. If no existing test triggers a given append site, say so in the ledger rather than inventing a payload — an untriggerable path is itself a finding.

Plus these four:

```php
public function test_failures_attribute_to_the_store_named_by_the_header(): void
{
    // owner with two stores pushes a refused change with X-Store-Id = storeB
    // assert the sync_failures row carries storeB->id, not storeA->id
}

public function test_the_push_response_shape_is_unchanged(): void
{
    $response = $this->actingAs($this->owner)
        ->withHeader('X-Store-Id', $this->storeA->id)
        ->postJson('/api/v1/app/sync/push', ['changes' => [$this->validChange()]]);

    $response->assertOk()
        ->assertJsonStructure(['success', 'processed', 'failed', 'id_map', 'versions']);
}

public function test_a_recorder_failure_does_not_fail_the_push(): void
{
    $this->app->instance(SyncFailureRecorder::class, new class extends SyncFailureRecorder {
        public function recordPushOutcome(array $failed, array $changes, ?string $storeId, ?string $userId, int $accepted): void
        {
            throw new \RuntimeException('telemetry is down');
        }
    });

    $this->actingAs($this->owner)
        ->withHeader('X-Store-Id', $this->storeA->id)
        ->postJson('/api/v1/app/sync/push', ['changes' => [$this->validChange()]])
        ->assertOk()
        ->assertJsonPath('success', true);
}

public function test_a_successful_push_increments_the_daily_tally(): void
{
    $this->actingAs($this->owner)
        ->withHeader('X-Store-Id', $this->storeA->id)
        ->postJson('/api/v1/app/sync/push', ['changes' => [$this->validChange()]])
        ->assertOk();

    $this->assertDatabaseHas('sync_health_daily', [
        'store_id' => $this->storeA->id,
        'pushes' => 1,
    ]);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd laravel-server && php artisan test --filter=SyncPushFailureRecordingTest`
Expected: FAIL — no `sync_failures` rows written. (`test_the_push_response_shape_is_unchanged` should PASS from the start; it is a regression guard, not a target.)

- [ ] **Step 3: Write the implementation**

Inject the recorder into `SyncController`'s constructor (add one if the class has none), then add the hook immediately after the existing `sendFirstSyncAlert(...)` call in `push()`, before the `return response()->json([...])`:

```php
try {
    $this->syncFailureRecorder->recordPushOutcome(
        $failed,
        $changes,
        $request->user() ? $this->resolvePushStoreId($request, $request->user()) : null,
        $request->user()?->id,
        $processed
    );
} catch (\Throwable $e) {
    Log::warning('Sync failure recording skipped: '.$e->getMessage());
}
```

Placement is load-bearing in two ways. **After the outer `DB::commit()`**: a push whose outer transaction rolls back applied nothing, and must not leave failure rows describing changes never committed. **Inside a `try`/`catch`**: a sync that succeeded must never be reported as failed because telemetry could not be written — the same rule `sendFirstSyncAlert()` follows for its own reasons.

Do not touch any of the eight `$failed[]` appends, any reason string, or any refusal condition.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=SyncPushFailureRecordingTest`
Expected: PASS

- [ ] **Step 5: Verify no sync behaviour changed**

Run: `cd laravel-server && php artisan test --filter="Sync"`
Expected: PASS, with the **same test count** as before this task. Any sync test that changes behaviour means the hook altered what the server does — revert and re-approach rather than updating the assertion.

- [ ] **Step 6: Check the line limit**

Run: `cd laravel-server && wc -l app/Http/Controllers/Api/App/SyncController.php`
Expected: the file is already ~2,700 lines and logged as a deliberate exception in `docs/KNOWN_BUGS.md`. This task adds ~12 lines; it must not add more. If the hook grows past that, move its body into the recorder rather than the controller.

- [ ] **Step 7: Commit**

```bash
git add laravel-server/app/Http/Controllers/Api/App/SyncController.php laravel-server/tests/Feature/SyncPushFailureRecordingTest.php
git commit -m "feat: record every sync push refusal from push()'s assembled failure list"
```

---

### Task 4: Retention

**Files:**
- Create: `laravel-server/app/Console/Commands/PruneSyncFailures.php`
- Modify: `laravel-server/routes/console.php`
- Test: `laravel-server/tests/Feature/PruneSyncFailuresCommandTest.php`

**Interfaces:**
- Consumes: `SyncFailure` from Task 1.
- Produces: the `sync:prune-failures` artisan command.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Models\SyncFailure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PruneSyncFailuresCommandTest extends TestCase
{
    use RefreshDatabase;

    private function failureAgedDays(int $days): SyncFailure
    {
        $failure = SyncFailure::create([
            'table_name' => 'sales',
            'record_id' => 'r-'.uniqid(),
            'operation' => 'INSERT',
            'reason' => 'forbidden',
            'created_at' => now(),
        ]);

        DB::table('sync_failures')->where('id', $failure->id)
            ->update(['created_at' => now()->subDays($days)]);

        return $failure;
    }

    public function test_it_deletes_failures_older_than_the_retention_window(): void
    {
        $old = $this->failureAgedDays(91);

        $this->artisan('sync:prune-failures')->assertSuccessful();

        $this->assertDatabaseMissing('sync_failures', ['id' => $old->id]);
    }

    public function test_it_keeps_failures_inside_the_retention_window(): void
    {
        $recent = $this->failureAgedDays(89);

        $this->artisan('sync:prune-failures')->assertSuccessful();

        $this->assertDatabaseHas('sync_failures', ['id' => $recent->id]);
    }

    public function test_it_never_touches_the_daily_tally(): void
    {
        \App\Models\SyncHealthDaily::create([
            'store_id' => null,
            'date' => now()->subYears(2)->toDateString(),
            'pushes' => 1,
            'changes_accepted' => 1,
            'changes_refused' => 0,
        ]);

        $this->artisan('sync:prune-failures')->assertSuccessful();

        $this->assertSame(1, \App\Models\SyncHealthDaily::count());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=PruneSyncFailuresCommandTest`
Expected: FAIL — `The command "sync:prune-failures" does not exist.`

- [ ] **Step 3: Write the command**

Create `laravel-server/app/Console/Commands/PruneSyncFailures.php`, modelled on `PruneBackups`:

```php
<?php

namespace App\Console\Commands;

use App\Models\SyncFailure;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class PruneSyncFailures extends Command
{
    private const RETENTION_DAYS = 90;

    protected $signature = 'sync:prune-failures';

    protected $description = 'Delete recorded sync push failures older than the retention window.';

    public function handle(): int
    {
        $deleted = SyncFailure::where('created_at', '<', now()->subDays(self::RETENTION_DAYS))->delete();

        if ($deleted > 0) {
            Log::info("sync:prune-failures deleted {$deleted} recorded failure(s).");
        }

        $this->info("Deleted {$deleted} sync failure record(s) older than ".self::RETENTION_DAYS.' days.');

        return self::SUCCESS;
    }
}
```

The window is a constant, not config: a setting nobody tunes is a setting that rots.

- [ ] **Step 4: Schedule it**

In `laravel-server/routes/console.php`, after the existing entries:

```php
Schedule::command('sync:prune-failures')->dailyAt('03:30');
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=PruneSyncFailuresCommandTest`
Expected: PASS, 3 tests

- [ ] **Step 6: Commit**

```bash
git add laravel-server/app/Console/Commands/PruneSyncFailures.php laravel-server/routes/console.php laravel-server/tests/Feature/PruneSyncFailuresCommandTest.php
git commit -m "feat: prune recorded sync failures beyond the retention window"
```

---

### Task 5: `AdminSyncHealthService` and endpoints

**Files:**
- Create: `laravel-server/app/Services/Admin/AdminSyncHealthService.php`
- Create: `laravel-server/app/Http/Controllers/Api/Admin/AdminSyncHealthController.php`
- Modify: `laravel-server/routes/api.php`
- Test: `laravel-server/tests/Feature/Admin/AdminSyncHealthTest.php`

**Interfaces:**
- Consumes: `SyncFailure`, `SyncHealthDaily`.
- Produces: `AdminSyncHealthService::platformSummary(int $days = 7): array` returning `['success_rate_24h' => ?string, 'success_rate_7d' => ?string, 'failures_by_reason' => array<string,int>, 'worst_stores' => list<array{store_id, store_name, refused}>]`, and `storeHealth(string $storeId, int $page = 1): array` returning `['last_sync_at' => ?string, 'daily' => list<array{date, accepted, refused}>, 'failures' => ['data' => ..., 'meta' => ...]]`. Task 7 consumes both.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Admin/AdminSyncHealthTest.php`. Reuse the super_admin + `withoutMiddleware` setup from `tests/Feature/Admin/AdminDataAccuracyTest.php`.

```php
public function test_the_summary_reports_a_success_rate_from_the_daily_tally(): void
{
    SyncHealthDaily::create([
        'store_id' => $this->store->id,
        'date' => now()->toDateString(),
        'pushes' => 2,
        'changes_accepted' => 9,
        'changes_refused' => 1,
    ]);

    $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/sync/health');

    $response->assertOk();
    $this->assertSame('90%', $response->json('success_rate_24h'));
}

public function test_the_summary_reports_null_when_nothing_has_synced(): void
{
    $response = $this->actingAs($this->superAdmin)->getJson('/api/v1/admin/sync/health');

    $response->assertOk();
    $this->assertNull($response->json('success_rate_24h'));
}

public function test_it_groups_failures_by_reason(): void
{
    // two permission_denied, one forbidden -> ['permission_denied' => 2, 'forbidden' => 1]
}

public function test_a_store_drilldown_returns_its_recent_failures_paginated_at_fifty(): void
{
    // 60 failures for one store -> meta.per_page === 50
}

public function test_a_store_that_has_never_synced_reports_null_rather_than_zero(): void
{
    // no daily rows, no last_sync_at -> last_sync_at null, daily []
}

public function test_the_endpoints_are_refused_to_a_non_super_admin(): void
{
    $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

    $this->actingAs($this->makeAdmin('platform_admin'))
        ->getJson('/api/v1/admin/sync/health')
        ->assertStatus(403);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd laravel-server && php artisan test --filter=AdminSyncHealthTest`
Expected: FAIL — 404, route not defined.

- [ ] **Step 3: Write the service and controller**

`AdminSyncHealthService` computes the rate as `accepted / (accepted + refused)` over the window, returning **`null`** when the denominator is zero — never `'0%'` and never `'100%'`. This is Phase 1's rule and the specific trap this phase exists to avoid.

`AdminSyncHealthController` is a thin delegator per §4, following `AdminPlatformController`'s shape.

- [ ] **Step 4: Register the routes**

In `routes/api.php`, inside the existing `permission:manage_platform` admin group:

```php
Route::get('/sync/health', [AdminSyncHealthController::class, 'summary'])->middleware('role:super_admin');
Route::get('/sync/stores/{id}', [AdminSyncHealthController::class, 'store'])->middleware('role:super_admin');
```

`role:super_admin` matches `/admin/health` and `/admin/errors`, and matches the Operations nav item's gate. Per `web/AGENTS.md`, a nav item's gate must match its page's narrowest endpoint gate — PG-14 and PG-15 are open findings against exactly this mismatch, so do not introduce a third.

- [ ] **Step 5: Run tests and check the line limit**

Run: `cd laravel-server && php artisan test --filter=AdminSyncHealthTest`
Expected: PASS

Run: `cd laravel-server && wc -l app/Services/Admin/AdminSyncHealthService.php app/Http/Controllers/Api/Admin/AdminSyncHealthController.php`
Expected: both under 350.

- [ ] **Step 6: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminSyncHealthService.php laravel-server/app/Http/Controllers/Api/Admin/AdminSyncHealthController.php laravel-server/routes/api.php laravel-server/tests/Feature/Admin/AdminSyncHealthTest.php
git commit -m "feat: expose platform and per-store sync health to the admin panel"
```

---

### Task 6: Give the Overview's sync rate a real source

**Files:**
- Modify: `laravel-server/app/Services/Admin/AdminSummaryService.php`
- Modify: `laravel-server/tests/Feature/Admin/AdminSummaryMetricHonestyTest.php`

**Interfaces:**
- Consumes: `SyncHealthDaily`.
- Produces: `live_operations.sync_success_rate_24h` unchanged in shape (`?string`), changed in source.

- [ ] **Step 1: Write the failing test**

Add to `AdminSummaryMetricHonestyTest`:

```php
public function test_the_sync_success_rate_reads_recorded_sync_health(): void
{
    \App\Models\SyncHealthDaily::create([
        'store_id' => null,
        'date' => now()->toDateString(),
        'pushes' => 1,
        'changes_accepted' => 3,
        'changes_refused' => 1,
    ]);

    $this->assertSame('75%', $this->summary()['live_operations']['sync_success_rate_24h']);
}
```

The existing `test_sync_success_rate_is_null_when_there_is_no_sync_activity_in_the_window` must keep passing unchanged; `test_sync_success_rate_only_counts_the_last_24_hours` asserts against `ActivityLog` and will need rewriting against `sync_health_daily` — update it rather than deleting it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminSummaryMetricHonestyTest`
Expected: FAIL — rate is null; the service still queries the `SYNC_SUCCESS` activity action that nothing writes.

- [ ] **Step 3: Repoint the read**

Replace the `ActivityLog`-based `$syncLogs` block in `AdminSummaryService::getGlobalSummary()` with a `SyncHealthDaily` aggregate over the last day, keeping the `null`-when-no-data behaviour exactly as it is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd laravel-server && php artisan test --filter=AdminSummaryMetricHonestyTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add laravel-server/app/Services/Admin/AdminSummaryService.php laravel-server/tests/Feature/Admin/AdminSummaryMetricHonestyTest.php
git commit -m "fix: read the admin sync success rate from recorded sync health, not a dead activity action"
```

---

### Task 7: Operations Sync section

**Files:**
- Create: `web/components/admin/operations/sync-health-card.tsx`
- Create: `web/lib/api/admin-hooks-sync.ts`
- Modify: `web/lib/types/admin.ts`
- Modify: `web/app/admin/operations/page.tsx`
- Test: `web/__tests__/admin-sync-health-card.test.tsx`

**Interfaces:**
- Consumes: `GET /admin/sync/health` from Task 5.
- Produces: `useAdminSyncHealth()` and `SyncHealthCard`; `SYNC_REASON_LABELS` (a `Record<string, string>` gloss) exported from `admin-hooks-sync.ts` for reuse by Task 8.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncHealthCard } from "@/components/admin/operations/sync-health-card";

const base = { success_rate_24h: "90%", success_rate_7d: "95%", failures_by_reason: {}, worst_stores: [] };

describe("SyncHealthCard", () => {
  it("shows the recorded success rate", () => {
    render(<SyncHealthCard data={base} isLoading={false} />);
    expect(screen.getByText("90%")).toBeDefined();
  });

  it("reports no sync activity rather than zero when nothing has synced", () => {
    render(<SyncHealthCard data={{ ...base, success_rate_24h: null }} isLoading={false} />);
    expect(screen.getByText(/no sync activity/i)).toBeDefined();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("glosses a raw reason string in plain English and keeps the raw string visible", () => {
    render(
      <SyncHealthCard
        data={{ ...base, failures_by_reason: { permission_denied: 3 } }}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/no access to that store/i)).toBeDefined();
    expect(screen.getByText(/permission_denied/)).toBeDefined();
  });

  it("does not crash when the payload is missing entirely", () => {
    render(<SyncHealthCard data={undefined} isLoading={false} />);
    expect(screen.getByText(/no sync activity/i)).toBeDefined();
  });
});
```

The third case encodes the spec's rule: the gloss is for the operator, the raw string stays so a support conversation can quote it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/admin-sync-health-card.test.tsx`
Expected: FAIL — cannot resolve `sync-health-card`.

- [ ] **Step 3: Write the hook, the gloss and the card**

`SYNC_REASON_LABELS` maps each reason the server can emit to a sentence: `permission_denied` → "Refused: the pushing session had no access to that store"; `forbidden` → "Refused: not permitted for this session, will retry"; `unsupported_operation` → "Refused: the server does not sync this table"; `quantity_received_exceeds_ordered` → "Rejected: received more stock than the order allows". Unknown reasons fall back to the raw string. Use `Object.hasOwn` rather than a bare bracket lookup (§8).

Card uses semantic tokens only, and renders `null` rates as "No sync activity".

- [ ] **Step 4: Mount it on the Operations page**

Add `<SyncHealthCard …/>` below the existing probes/resources grid, above the Sentry card.

- [ ] **Step 5: Verify**

Run: `cd web && npx vitest run __tests__/admin-sync-health-card.test.tsx && npx tsc --noEmit && npm test`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/components/admin/operations/sync-health-card.tsx web/lib/api/admin-hooks-sync.ts web/lib/types/admin.ts web/app/admin/operations/page.tsx web/__tests__/admin-sync-health-card.test.tsx
git commit -m "feat: surface platform sync health on the admin operations page"
```

---

### Task 8: Per-store drill-down

**Files:**
- Create: `web/components/admin/stores/details/store-sync-health-section.tsx`
- Modify: `web/components/admin/stores/details/store-detail-sections.tsx`
- Modify: `web/lib/api/admin-hooks-sync.ts`

**Interfaces:**
- Consumes: `GET /admin/sync/stores/{id}` from Task 5; `SYNC_REASON_LABELS` from Task 7.
- Produces: `useAdminStoreSyncHealth(storeId)` and `StoreSyncHealthSection`.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/admin-store-sync-health-section.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreSyncHealthSection } from "@/components/admin/stores/details/store-sync-health-section";

const empty = { last_sync_at: null, daily: [], failures: { data: [], meta: undefined } };

describe("StoreSyncHealthSection", () => {
  it("reads Never synced for a store with no sync history", () => {
    render(<StoreSyncHealthSection data={empty} isLoading={false} />);

    expect(screen.getByText(/never synced/i)).toBeDefined();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("renders a recorded failure with its glossed reason and raw string", () => {
    render(
      <StoreSyncHealthSection
        isLoading={false}
        data={{
          ...empty,
          failures: {
            data: [
              {
                id: "f1",
                table_name: "customer_payments",
                record_id: "pay-1",
                operation: "INSERT",
                reason: "permission_denied",
                created_at: "2026-10-07T09:00:00Z",
              },
            ],
            meta: undefined,
          },
        }}
      />,
    );

    expect(screen.getByText(/no access to that store/i)).toBeDefined();
    expect(screen.getByText(/permission_denied/)).toBeDefined();
    expect(screen.getByText("pay-1")).toBeDefined();
  });

  it("renders the last sync date in DD/MM/YYYY order", () => {
    render(
      <StoreSyncHealthSection
        isLoading={false}
        data={{ ...empty, last_sync_at: "2026-10-07T09:00:00Z" }}
      />,
    );

    expect(screen.getByText(/07\/10\/2026/)).toBeDefined();
  });
});
```

The third case pins §6's `DD/MM/YYYY` rule, which a default `toLocaleDateString()` would silently break.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/admin-store-sync-health-section.test.tsx`
Expected: FAIL — cannot resolve `store-sync-health-section`.

- [ ] **Step 3: Add the hook and section**

Mount into the existing store detail page rather than adding a route — that page is where the operator already is when a customer calls. Render: last sync (`DD/MM/YYYY HH:mm` per §6), the accepted/refused daily series, and the paginated failure list showing table, record id, operation, glossed reason and timestamp.

A store that has never synced renders "Never synced", not "0% success".

- [ ] **Step 4: Verify**

Run: `cd web && npx vitest run __tests__/admin-store-sync-health-section.test.tsx && npx tsc --noEmit && npm test && wc -l components/admin/stores/details/store-detail-sections.tsx`
Expected: tests pass, no type errors, the modified file under 350 lines (it is 281 today — if the addition pushes it past, extract the new section rather than inlining).

- [ ] **Step 5: Commit**

```bash
git add web/components/admin/stores/details/ web/lib/api/admin-hooks-sync.ts web/__tests__/admin-store-sync-health-section.test.tsx
git commit -m "feat: add a per-store sync health drill-down to the store detail page"
```

---

### Task 9: Docs and browser smoke test

**Files:**
- Modify: `laravel-server/AGENTS.md`, `web/AGENTS.md`, `docs/SYSTEM_FEATURES_DOCUMENTATION.md` (only if it gains an admin section; it is customer-facing today — see note), `docs/KNOWN_BUGS.md`

- [ ] **Step 1: Document the recording contract**

`laravel-server/AGENTS.md`: that `push()` records refusals **once, from the assembled `$failed` array, after the outer commit**, and that the contract for any new refusal path is "append to `$failed`" rather than "remember to log"; that recording is wrapped so it can never fail a push; that the daily bucket comes from the application clock per §7; and that `sync_failures.store_id` carries no foreign key on purpose, so `AdminStoreDeletionService` must decide about these rows explicitly rather than inheriting a cascade.

`web/AGENTS.md`: the Operations Sync section and the per-store drill-down; that reason strings are glossed for the operator with the raw string kept visible.

- [ ] **Step 2: Close the dead-metric finding**

The Overview sync-rate metric was dead on arrival in Phase 1 (`SYNC_SUCCESS` written nowhere). Task 6 fixes it — record that in `docs/FIXED_BUGS.md` with a fresh ID. **Grep `docs/*.md` for the highest `PG-`/`A-` id in use and take the next free one**; PG-5 collided once already because this step was skipped.

- [ ] **Step 3: Log what Phase 2 deliberately does not cover**

Add a `KNOWN_BUGS.md` entry for the remaining blind spot: client-side `_sync_queue` depth and backlog age are invisible to the server, so a device whose rows never reach the server is still undetectable — the A-162 class. Name it as Phase 2b and state that it needs a `client/` change on the desktop release cycle.

- [ ] **Step 4: Browser smoke test — required, not optional**

§9: backend verification is not UI verification. Sign in as super_admin against a local API (never production — `.agents/AGENTS.md` and the standing rule) and confirm: the Operations page shows the Sync section with a real recorded rate; a store with recorded failures shows them in its drill-down with glossed reasons; a store with no sync history reads "Never synced" rather than "0%". Record what you observed in the commit body.

- [ ] **Step 5: Full verification**

Run: `cd laravel-server && php artisan test`
Run: `cd web && npm test && npx tsc --noEmit`
Run: `cd client && npm run test:schema`
Expected: all pass. `vitest` has a known flaky teardown false-failure in this repo — if a failure is a teardown error rather than an assertion, re-run before treating it as real.

- [ ] **Step 6: Commit**

```bash
git add laravel-server/AGENTS.md web/AGENTS.md docs/
git commit -m "docs: record the sync-health recording contract and phase 2 boundaries"
```

---

## Verification

Against the spec's success criteria:

1. Every refusal path leaves a row naming store/table/record/reason → Task 3's per-reason tests.
2. The Overview's sync rate reads real data → Task 6.
3. An operator can open one store and see its sync state → Tasks 5, 8, verified in a browser in Task 9.
4. Recording cannot fail a sync, and cannot change what a sync does → Task 3 Steps 3 and 5.
5. No file added or modified exceeds 350 lines → checked in Tasks 3, 5, 8.
6. Endpoint gate matches nav gate → Task 5 Step 4.
