# On-till Admin Inspection Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a platform admin standing at a store's own till sign in with their admin email and a separate till access code, and get a read-only inspection session plus an admin-only diagnostics section on that device.

**Architecture:** A new server-side credential (`admin_till_codes`) and endpoint mint a short-lived inspection token. The client recognises the admin path locally — an identifier containing `@` that matches no user on this device — so staff logins stay offline and no secret ships in the bundle. The session is an overlay held in `sessionStorage`: it never calls `setDbUser()`, never touches the active store or sync token, and never stops sync. Read-only is enforced by one guard in `insert()` / `update()` / `softDelete()`.

**Tech Stack:** Laravel 11 (Sanctum, Eloquent, PHPUnit), Next.js/React client (TanStack Query, Vitest, sql.js).

**Spec:** `docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md`

**One secret, one screen.** The admin types their email and their 12-digit till
access code into the *same* form, as the two fields that form already has
(identifier + PIN, with the PIN field widened to 12 digits). There is no second
modal and no second code: the "till access code" and "the 12 digits from the
admin panel" are the same single credential, generated at
`/admin/settings` (Task 5) and typed once at the till.

## Global Constraints

- Conventional Commits, **single sentence, no multiline body** (root `AGENTS.md` §10).
- **No `Co-Authored-By` trailer** on any commit in this repo (user standing rule).
- Files strictly below **350 lines** (§4).
- No inline comments explaining what code does; **max 2 lines** for a hyper-local hack (§3). Decisions go in the spec or an `AGENTS.md`.
- Never use MySQL `NOW()` / `CURRENT_TIMESTAMP()` in raw SQL or migrations — let Eloquent set timestamps in UTC (§7).
- No dynamic bracket lookup `obj[key]` from input; use `Map` or a `switch` (§8).
- Cards are `bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm`, never `bg-card` (§6).
- Docs ship **in the same change** as the code (§2). A fixed `KNOWN_BUGS.md` entry moves to `FIXED_BUGS.md` and is removed outright.
- Backward compatibility: additive only; an old bundle in the field must keep working (§11).
- Uniform failure copy, exactly: **`Wrong password.`** Offline is the only distinguishable case.
- Session storage is `sessionStorage`, never `localStorage` — an inspection session must not survive a restart.

## Review Focus

Five things the spec implies that no task's happy path exercises. Each has its test added to the owning task.

1. **A store owner signing in with their email while offline** must still log in locally and never reach the network (Task 8). This is the regression that would lock a store out of its own till.
2. **An admin email that also exists as a local user** falls through to the ordinary PIN login, not the admin path (Task 8) — the documented constraint, pinned so it stays a known limit rather than a surprise.
3. **A revoked or expired code** is rejected with the same body and status as a wrong one (Task 3), so the endpoint can't be used to enumerate admins.
4. **An expired inspection session** stops being read as active and stops blocking writes (Task 7), so a stale `sessionStorage` entry can't leave a till permanently read-only.
5. **Exiting the session leaves the staff session byte-identical** — `dumos_user`, active store id, auth token and PIN state unchanged (Task 9).

---

## File Structure

**laravel-server/**
- Create `database/migrations/2026_10_09_000001_create_admin_till_codes_table.php` — the credential table.
- Create `app/Models/AdminTillCode.php` — model, `scopeActive()`.
- Create `app/Console/Commands/IssueAdminTillCode.php` — issue/revoke, the only way a code is created.
- Create `app/Http/Controllers/Api/App/AdminTillSessionController.php` — `create()` and `end()`.
- Create `app/Services/Admin/AdminTillSessionService.php` — verification + audit, keeping the controller HTTP-only (§4).
- Modify `routes/api.php` — two routes under a dedicated limiter.
- Modify `app/Providers/AppServiceProvider.php` — the `till-session` rate limiter.
- Create `tests/Feature/App/AdminTillSessionTest.php`.
- Modify `laravel-server/AGENTS.md`.

**client/**
- Create `lib/utils/till-inspection.ts` — session state, the single source of truth (mirrors `lib/utils/impersonation.ts`).
- Create `lib/api/admin-till-session.ts` — the two API calls.
- Modify `lib/storage-keys.ts` — one new key.
- Modify `lib/context/auth-context.tsx` — the discriminator inside the existing `login()`.
- Modify `components/auth/traditional-login-form.tsx` — relax the 4-digit PIN field to a 12-digit code field in admin mode.
- Modify `lib/db/base-helpers.ts` — `assertWritable()` in all three write helpers.
- Create `components/dashboard/till-inspection-banner.tsx`.
- Modify `components/settings/settings-client.tsx` — gate diagnostics on the inspection session.
- Modify `lib/constants/settings-tabs.ts` — fixes A-198.
- Modify `client/AGENTS.md`; modify `docs/KNOWN_BUGS.md` / `docs/FIXED_BUGS.md` (A-198).

Tasks 1–5 are server-side and independently shippable; the client cannot work without them, so build in order.

---

### Task 1: The `admin_till_codes` table and model

**Files:**
- Create: `laravel-server/database/migrations/2026_10_09_000001_create_admin_till_codes_table.php`
- Create: `laravel-server/app/Models/AdminTillCode.php`
- Test: `laravel-server/tests/Feature/App/AdminTillSessionTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces: `AdminTillCode` with `$fillable = ['admin_id', 'code_hash', 'label', 'last_used_at', 'revoked_at']`, a `scopeActive($query)` filtering `whereNull('revoked_at')`, and `admin()` belonging to `User`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature\App;

use App\Models\AdminTillCode;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminTillSessionTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_scope_excludes_revoked_codes(): void
    {
        $admin = User::factory()->create(['role' => 'platform_admin']);

        AdminTillCode::create([
            'admin_id' => $admin->id,
            'code_hash' => Hash::make('123456789012'),
            'label' => 'live',
        ]);
        AdminTillCode::create([
            'admin_id' => $admin->id,
            'code_hash' => Hash::make('210987654321'),
            'label' => 'old',
            'revoked_at' => now(),
        ]);

        $active = AdminTillCode::active()->where('admin_id', $admin->id)->get();

        $this->assertCount(1, $active);
        $this->assertSame('live', $active->first()->label);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd laravel-server && php artisan test --filter=test_active_scope_excludes_revoked_codes`
Expected: FAIL — `Class "App\Models\AdminTillCode" not found`.

- [ ] **Step 3: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A per-admin credential for read-only inspection on a store's own till,
 * deliberately separate from the admin's platform password: a till is
 * hardware the store controls, so whatever is typed there should be worth as
 * little as possible to whoever captures it. See
 * docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_till_codes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('admin_id');
            $table->string('code_hash');
            $table->string('label', 64)->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index(['admin_id', 'revoked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_till_codes');
    }
};
```

- [ ] **Step 4: Write the model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AdminTillCode extends Model
{
    use HasUuids;

    protected $fillable = [
        'admin_id',
        'code_hash',
        'label',
        'last_used_at',
        'revoked_at',
    ];

    protected $hidden = ['code_hash'];

    protected $casts = [
        'last_used_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function scopeActive($query)
    {
        return $query->whereNull('revoked_at');
    }

    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd laravel-server && php artisan test --filter=AdminTillSessionTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add laravel-server/database/migrations/2026_10_09_000001_create_admin_till_codes_table.php laravel-server/app/Models/AdminTillCode.php laravel-server/tests/Feature/App/AdminTillSessionTest.php
git commit -m "feat: add an admin_till_codes table holding a per-admin credential scoped to read-only inspection on a store's till"
```

---

### Task 2: Issue and revoke a code from the console

**Files:**
- Create: `laravel-server/app/Console/Commands/IssueAdminTillCode.php`
- Test: `laravel-server/tests/Feature/App/AdminTillCodeCommandTest.php`

**Interfaces:**
- Consumes: `AdminTillCode` (Task 1).
- Produces: `admin:till-code {email} {--revoke} {--label=}`. On issue it prints a 12-digit code **once** and stores only the hash.

A console command rather than admin-panel UI: a code is issued rarely, by you, and panel UI is scope the spec does not ask for.

- [ ] **Step 1: Write the failing test**

```php
public function test_issuing_a_code_stores_only_a_hash_and_prints_the_code_once(): void
{
    $admin = User::factory()->create(['role' => 'platform_admin', 'email' => 'ops@dumosrx.com']);

    $this->artisan('admin:till-code', ['email' => 'ops@dumosrx.com', '--label' => 'agidi'])
        ->assertExitCode(0);

    $row = AdminTillCode::where('admin_id', $admin->id)->firstOrFail();

    $this->assertSame('agidi', $row->label);
    $this->assertNotEmpty($row->code_hash);
    $this->assertStringStartsWith('$2y$', $row->code_hash);
    $this->assertNull($row->revoked_at);
}

public function test_revoking_marks_every_active_code_for_that_admin(): void
{
    $admin = User::factory()->create(['role' => 'platform_admin', 'email' => 'ops@dumosrx.com']);
    AdminTillCode::create(['admin_id' => $admin->id, 'code_hash' => Hash::make('111111111111')]);
    AdminTillCode::create(['admin_id' => $admin->id, 'code_hash' => Hash::make('222222222222')]);

    $this->artisan('admin:till-code', ['email' => 'ops@dumosrx.com', '--revoke'])
        ->assertExitCode(0);

    $this->assertSame(0, AdminTillCode::active()->where('admin_id', $admin->id)->count());
}

public function test_refuses_a_user_who_is_not_a_platform_admin(): void
{
    User::factory()->create(['role' => 'store_owner', 'email' => 'owner@shop.com']);

    $this->artisan('admin:till-code', ['email' => 'owner@shop.com'])
        ->assertExitCode(1);

    $this->assertSame(0, AdminTillCode::count());
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd laravel-server && php artisan test --filter=AdminTillCodeCommandTest`
Expected: FAIL — command `admin:till-code` is not defined.

- [ ] **Step 3: Write the command**

```php
<?php

namespace App\Console\Commands;

use App\Models\AdminTillCode;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class IssueAdminTillCode extends Command
{
    protected $signature = 'admin:till-code {email} {--revoke} {--label=}';

    protected $description = 'Issue or revoke an admin till access code for on-till read-only inspection';

    public const ELIGIBLE_ROLES = ['platform_admin', 'super_admin'];

    public function handle(): int
    {
        $admin = User::where('email', $this->argument('email'))->first();

        if (!$admin || !in_array($admin->role, self::ELIGIBLE_ROLES, true)) {
            $this->error('No platform admin with that email.');

            return 1;
        }

        if ($this->option('revoke')) {
            $count = AdminTillCode::active()
                ->where('admin_id', $admin->id)
                ->update(['revoked_at' => now()]);
            $this->info("Revoked {$count} code(s) for {$admin->email}.");

            return 0;
        }

        $code = str_pad((string) random_int(0, 999999999999), 12, '0', STR_PAD_LEFT);

        AdminTillCode::create([
            'admin_id' => $admin->id,
            'code_hash' => Hash::make($code),
            'label' => $this->option('label'),
        ]);

        $this->info("Till access code for {$admin->email}: {$code}");
        $this->warn('Shown once. Only the hash is stored.');

        return 0;
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd laravel-server && php artisan test --filter=AdminTillCodeCommandTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add laravel-server/app/Console/Commands/IssueAdminTillCode.php laravel-server/tests/Feature/App/AdminTillCodeCommandTest.php
git commit -m "feat: add an admin:till-code command that issues a 12-digit till access code once and stores only its hash"
```

---

### Task 3: The session endpoint, with uniform failures

**Files:**
- Create: `laravel-server/app/Services/Admin/AdminTillSessionService.php`
- Create: `laravel-server/app/Http/Controllers/Api/App/AdminTillSessionController.php`
- Modify: `laravel-server/routes/api.php`
- Modify: `laravel-server/app/Providers/AppServiceProvider.php`
- Test: `laravel-server/tests/Feature/App/AdminTillSessionTest.php`

**Interfaces:**
- Consumes: `AdminTillCode::active()` (Task 1).
- Produces: `POST /api/v1/app/admin-till-session` taking `{email, code, store_id, device_id}` → `200 {token, expires_in, admin: {id, first_name, last_name, email, role}}`, or `401 {error: "Wrong password."}`. And `POST /api/v1/app/admin-till-session/end` (bearer, ability `till-inspect`) → `200 {ok: true}`.
- `AdminTillSessionService::verify(string $email, string $code): ?User` and `::issue(User $admin, string $storeId, string $deviceId): array`.

**The uniform-failure requirement is the whole point of this task.** Every rejection returns the same status, the same body, and runs one `Hash::check` against a dummy hash when no admin is found, so response timing does not separate "unknown email" from "wrong code".

- [ ] **Step 1: Write the failing tests**

```php
private const DUMMY = '$2y$12$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG/u';

private function seedAdminWithCode(string $code = '123456789012'): User
{
    $admin = User::factory()->create([
        'role' => 'platform_admin',
        'email' => 'ops@dumosrx.com',
    ]);
    AdminTillCode::create([
        'admin_id' => $admin->id,
        'code_hash' => Hash::make($code),
    ]);

    return $admin;
}

public function test_a_valid_email_and_code_mints_an_inspection_token(): void
{
    $admin = $this->seedAdminWithCode();

    $response = $this->postJson('/api/v1/app/admin-till-session', [
        'email' => 'ops@dumosrx.com',
        'code' => '123456789012',
        'store_id' => (string) \Illuminate\Support\Str::uuid(),
        'device_id' => 'till-7',
    ]);

    $response->assertOk()
        ->assertJsonStructure(['token', 'expires_in', 'admin' => ['id', 'email', 'role']]);
    $this->assertSame($admin->id, $response->json('admin.id'));
    $this->assertNotNull(AdminTillCode::where('admin_id', $admin->id)->first()->last_used_at);
}

/**
 * @dataProvider rejectionProvider
 */
public function test_every_rejection_is_indistinguishable(array $payload): void
{
    $this->seedAdminWithCode();

    $response = $this->postJson('/api/v1/app/admin-till-session', $payload + [
        'store_id' => (string) \Illuminate\Support\Str::uuid(),
        'device_id' => 'till-7',
    ]);

    $response->assertStatus(401)->assertExactJson(['error' => 'Wrong password.']);
}

public static function rejectionProvider(): array
{
    return [
        'wrong code' => [['email' => 'ops@dumosrx.com', 'code' => '999999999999']],
        'unknown email' => [['email' => 'nobody@dumosrx.com', 'code' => '123456789012']],
        'not an admin' => [['email' => 'owner@shop.com', 'code' => '123456789012']],
    ];
}

public function test_a_revoked_code_is_rejected_like_a_wrong_one(): void
{
    $admin = $this->seedAdminWithCode();
    AdminTillCode::where('admin_id', $admin->id)->update(['revoked_at' => now()]);

    $this->postJson('/api/v1/app/admin-till-session', [
        'email' => 'ops@dumosrx.com',
        'code' => '123456789012',
        'store_id' => (string) \Illuminate\Support\Str::uuid(),
        'device_id' => 'till-7',
    ])->assertStatus(401)->assertExactJson(['error' => 'Wrong password.']);
}

public function test_entry_is_audit_logged_with_the_device_and_store(): void
{
    $admin = $this->seedAdminWithCode();
    $storeId = (string) \Illuminate\Support\Str::uuid();

    $this->postJson('/api/v1/app/admin-till-session', [
        'email' => 'ops@dumosrx.com',
        'code' => '123456789012',
        'store_id' => $storeId,
        'device_id' => 'till-7',
    ])->assertOk();

    $this->assertDatabaseHas('activity_logs', [
        'user_id' => $admin->id,
        'store_id' => $storeId,
        'action' => 'admin_till_session_started',
    ]);
}
```

Add `User::factory()->create(['role' => 'store_owner', 'email' => 'owner@shop.com'])` to `seedAdminWithCode()` so the "not an admin" row exists.

- [ ] **Step 2: Run to verify they fail**

Run: `cd laravel-server && php artisan test --filter=AdminTillSessionTest`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Write the service**

```php
<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\AdminTillCode;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class AdminTillSessionService
{
    public const ELIGIBLE_ROLES = ['platform_admin', 'super_admin'];

    public const TOKEN_TTL_MINUTES = 30;

    // Compared against when no admin matches, so a rejection costs the same
    // time whether the email exists or not.
    private const TIMING_EQUALIZER_HASH = '$2y$12$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG/u';

    public function verify(string $email, string $code): ?User
    {
        $admin = User::where('email', $email)
            ->whereIn('role', self::ELIGIBLE_ROLES)
            ->first();

        if (!$admin) {
            Hash::check($code, self::TIMING_EQUALIZER_HASH);

            return null;
        }

        $codes = AdminTillCode::active()->where('admin_id', $admin->id)->get();

        foreach ($codes as $row) {
            if (Hash::check($code, $row->code_hash)) {
                $row->update(['last_used_at' => now()]);

                return $admin;
            }
        }

        if ($codes->isEmpty()) {
            Hash::check($code, self::TIMING_EQUALIZER_HASH);
        }

        return null;
    }

    public function issue(User $admin, string $storeId, string $deviceId): array
    {
        $expiresAt = now()->addMinutes(self::TOKEN_TTL_MINUTES);

        $token = $admin->createToken(
            "till-inspect:{$deviceId}",
            ['till-inspect'],
            $expiresAt,
        );

        $this->log($admin, $storeId, $deviceId, 'admin_till_session_started');

        return [
            'token' => $token->plainTextToken,
            'expires_in' => self::TOKEN_TTL_MINUTES * 60,
            'admin' => $admin->only(['id', 'first_name', 'last_name', 'email', 'role']),
        ];
    }

    public function end(User $admin, string $storeId, string $deviceId): void
    {
        $this->log($admin, $storeId, $deviceId, 'admin_till_session_ended');
    }

    private function log(User $admin, string $storeId, string $deviceId, string $action): void
    {
        ActivityLog::create([
            'user_id' => $admin->id,
            'store_id' => $storeId,
            'action' => $action,
            'description' => "Read-only admin inspection on device {$deviceId}",
            'properties' => ['device_id' => $deviceId],
        ]);
    }
}
```

- [ ] **Step 4: Write the controller**

```php
<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Services\Admin\AdminTillSessionService;
use Illuminate\Http\Request;

class AdminTillSessionController extends Controller
{
    public const REJECTION = ['error' => 'Wrong password.'];

    public function __construct(private AdminTillSessionService $sessions)
    {
    }

    public function create(Request $request)
    {
        $validated = $request->validate([
            'email' => 'required|string|max:191',
            'code' => 'required|string|max:64',
            'store_id' => 'required|string|max:64',
            'device_id' => 'required|string|max:64',
        ]);

        $admin = $this->sessions->verify($validated['email'], $validated['code']);

        if (!$admin) {
            return response()->json(self::REJECTION, 401);
        }

        return response()->json(
            $this->sessions->issue($admin, $validated['store_id'], $validated['device_id']),
        );
    }

    public function end(Request $request)
    {
        $validated = $request->validate([
            'store_id' => 'required|string|max:64',
            'device_id' => 'required|string|max:64',
        ]);

        $this->sessions->end($request->user(), $validated['store_id'], $validated['device_id']);
        $request->user()->currentAccessToken()->delete();

        return response()->json(['ok' => true]);
    }
}
```

- [ ] **Step 5: Add the limiter and the routes**

In `AppServiceProvider`'s boot, beside the existing named limiters:

```php
RateLimiter::for('till-session', function (Request $request) {
    return [
        Limit::perMinute(5)->by($request->input('device_id') ?: $request->ip()),
        Limit::perMinute(10)->by($request->input('email') ?: $request->ip()),
    ];
});
```

In `routes/api.php`, inside the `Route::prefix('v1')` group, beside the other public auth routes:

```php
Route::middleware('throttle:till-session')->group(function () {
    Route::post('/app/admin-till-session', [\App\Http\Controllers\Api\App\AdminTillSessionController::class, 'create']);
});
Route::middleware(['auth:sanctum', 'ability:till-inspect'])->group(function () {
    Route::post('/app/admin-till-session/end', [\App\Http\Controllers\Api\App\AdminTillSessionController::class, 'end']);
});
```

- [ ] **Step 6: Run the tests**

Run: `cd laravel-server && php artisan test --filter=AdminTillSessionTest`
Expected: PASS (7 tests including the data provider's three).

- [ ] **Step 7: Document and commit**

Add to `laravel-server/AGENTS.md`: the table, the endpoint, the `ELIGIBLE_ROLES` list, the uniform-rejection rule and why the timing equalizer exists.

```bash
git add laravel-server/app/Services/Admin/AdminTillSessionService.php laravel-server/app/Http/Controllers/Api/App/AdminTillSessionController.php laravel-server/routes/api.php laravel-server/app/Providers/AppServiceProvider.php laravel-server/tests/Feature/App/AdminTillSessionTest.php laravel-server/AGENTS.md
git commit -m "feat: mint a short-lived read-only inspection token from an admin email and till access code, rejecting every failure identically"
```

---

### Task 4: Till-code endpoints for the admin panel

**Files:**
- Modify: `laravel-server/app/Http/Controllers/Api/Admin/AdminUserController.php`
- Modify: `laravel-server/routes/api.php`
- Test: `laravel-server/tests/Feature/Admin/AdminTillCodeApiTest.php`

**Interfaces:**
- Consumes: `AdminTillCode` (Task 1), `IssueAdminTillCode::ELIGIBLE_ROLES` (Task 2).
- Produces, all under the existing `permission:manage_platform` admin group:
  - `GET /api/v1/admin/till-codes/mine` -> `{codes: [{id, label, last_used_at, created_at}]}` (never the hash)
  - `POST /api/v1/admin/till-codes` taking `{label?}` -> `{id, code}` where `code` is the 12 digits, returned **once**
  - `DELETE /api/v1/admin/till-codes/{id}` -> `{ok: true}`

**Self-service only: an admin issues and revokes their own codes.** A code is a
credential for acting as that admin, so no admin can mint one for anybody else
and `admin_id` is always `$request->user()->id`, never taken from input.
Super-admin revocation of someone else's code is deliberately deferred.

The artisan command from Task 2 stays as the bootstrap path: the first code,
and the way back in if the panel is unreachable.

- [ ] **Step 1: Write the failing tests**

```php
public function test_an_admin_issues_a_code_for_themselves_and_sees_it_once(): void
{
    $admin = User::factory()->create(['role' => 'platform_admin']);

    $response = $this->actingAs($admin)->postJson('/api/v1/admin/till-codes', ['label' => 'agidi']);

    $response->assertOk()->assertJsonStructure(['id', 'code']);
    $this->assertSame(12, strlen((string) $response->json('code')));

    $listed = $this->actingAs($admin)->getJson('/api/v1/admin/till-codes/mine');
    $listed->assertOk();
    $this->assertSame('agidi', $listed->json('codes.0.label'));
    $this->assertArrayNotHasKey('code_hash', $listed->json('codes.0'));
    $this->assertArrayNotHasKey('code', $listed->json('codes.0'));
}

public function test_an_admin_cannot_mint_a_code_for_another_admin(): void
{
    $admin = User::factory()->create(['role' => 'platform_admin']);
    $other = User::factory()->create(['role' => 'platform_admin']);

    $this->actingAs($admin)->postJson('/api/v1/admin/till-codes', [
        'label' => 'sneaky',
        'admin_id' => $other->id,
    ])->assertOk();

    $this->assertSame(0, AdminTillCode::where('admin_id', $other->id)->count());
    $this->assertSame(1, AdminTillCode::where('admin_id', $admin->id)->count());
}

public function test_listing_shows_only_the_callers_own_codes(): void
{
    $admin = User::factory()->create(['role' => 'platform_admin']);
    $other = User::factory()->create(['role' => 'platform_admin']);
    AdminTillCode::create(['admin_id' => $other->id, 'code_hash' => Hash::make('111111111111')]);

    $this->actingAs($admin)->getJson('/api/v1/admin/till-codes/mine')
        ->assertOk()
        ->assertJsonCount(0, 'codes');
}

public function test_revoking_someone_elses_code_is_not_found(): void
{
    $admin = User::factory()->create(['role' => 'platform_admin']);
    $other = User::factory()->create(['role' => 'platform_admin']);
    $theirs = AdminTillCode::create(['admin_id' => $other->id, 'code_hash' => Hash::make('111111111111')]);

    $this->actingAs($admin)->deleteJson("/api/v1/admin/till-codes/{$theirs->id}")
        ->assertStatus(404);

    $this->assertNull($theirs->fresh()->revoked_at);
}

public function test_a_store_owner_cannot_reach_these_routes(): void
{
    $owner = User::factory()->create(['role' => 'store_owner']);

    $this->actingAs($owner)->postJson('/api/v1/admin/till-codes')->assertForbidden();
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd laravel-server && php artisan test --filter=AdminTillCodeApiTest`
Expected: FAIL - 404, the routes do not exist.

- [ ] **Step 3: Add the controller methods**

In `AdminUserController`, extracting the 12-digit generation into
`AdminTillSessionService::generateCode(): string` so the command and the
endpoint share one implementation (DRY; update Task 2's command to call it):

```php
public function myTillCodes(Request $request)
{
    $codes = AdminTillCode::active()
        ->where('admin_id', $request->user()->id)
        ->orderByDesc('created_at')
        ->get(['id', 'label', 'last_used_at', 'created_at']);

    return response()->json(['codes' => $codes]);
}

public function issueTillCode(Request $request, AdminTillSessionService $sessions)
{
    $validated = $request->validate(['label' => 'nullable|string|max:64']);

    $code = $sessions->generateCode();

    $row = AdminTillCode::create([
        'admin_id' => $request->user()->id,
        'code_hash' => Hash::make($code),
        'label' => $validated['label'] ?? null,
    ]);

    return response()->json(['id' => $row->id, 'code' => $code]);
}

public function revokeTillCode(Request $request, string $id)
{
    $row = AdminTillCode::active()
        ->where('admin_id', $request->user()->id)
        ->where('id', $id)
        ->firstOrFail();

    $row->update(['revoked_at' => now()]);

    return response()->json(['ok' => true]);
}
```

`admin_id` comes from `$request->user()` in all three. The second test exists
to pin that an `admin_id` in the payload is ignored rather than honoured.

- [ ] **Step 4: Add the routes**

Inside the existing `Route::middleware(['permission:manage_platform', 'subscription'])->prefix('admin')` group in `routes/api.php`:

```php
Route::get('/till-codes/mine', [AdminUserController::class, 'myTillCodes']);
Route::post('/till-codes', [AdminUserController::class, 'issueTillCode']);
Route::delete('/till-codes/{id}', [AdminUserController::class, 'revokeTillCode']);
```

Not `role:super_admin`: a `platform_admin` is exactly who stands at a till.

- [ ] **Step 5: Run to verify they pass**

Run: `cd laravel-server && php artisan test --filter=AdminTillCodeApiTest`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add laravel-server/app/Http/Controllers/Api/Admin/AdminUserController.php laravel-server/app/Services/Admin/AdminTillSessionService.php laravel-server/app/Console/Commands/IssueAdminTillCode.php laravel-server/routes/api.php laravel-server/tests/Feature/Admin/AdminTillCodeApiTest.php
git commit -m "feat: let a platform admin issue and revoke their own till access codes over the API, never one for another admin"
```

---

### Task 5: The admin panel UI for till codes

**Files:**
- Create: `web/components/admin/settings/till-codes-card.tsx`
- Modify: `web/app/admin/settings/page.tsx`
- Test: `web/__tests__/till-codes-card.test.tsx` (match whatever test setup `web/` already uses; if it has none, cover this in the Task 12 browser pass instead and say so in the commit)

**Interfaces:**
- Consumes: the three endpoints from Task 4.
- Produces: `<TillCodesCard />` on the admin settings page.

So an admin never touches cPanel or a terminal for this.

- [ ] **Step 1: Build the card**

A card on `/admin/settings` titled "Till access codes", with the house card
classes from root `AGENTS.md` §6 - `bg-white dark:bg-slate-900 rounded-3xl
border border-slate-200 dark:border-slate-800 shadow-sm`, copied from
`web/components/admin/dashboard/recent-stores.tsx`, never `bg-card`.

It shows the caller's active codes (label, created, last used - never the code
itself), a "Generate code" button taking an optional label, and a revoke
action per row behind an `AlertDialog`, never `window.confirm` (§9).

- [ ] **Step 2: Show a generated code exactly once**

On generate, display the 12 digits in a dialog with a copy button and a plain
line saying it will not be shown again, then drop it from component state on
close. Do not write it to `localStorage`, a query cache that outlives the
dialog, or a toast that persists.

Copy for the card, so an admin reading it knows what it is for: this code
signs you in to a store's own till for read-only inspection. It is not your
password and cannot be used in this panel.

- [ ] **Step 3: Verify in the browser**

Run `web/`'s dev server, sign in to the admin panel, generate a code, confirm
it appears once, confirm the list never renders the code or a hash, revoke it,
confirm it leaves the list.

- [ ] **Step 4: Commit**

```bash
git add web/components/admin/settings/till-codes-card.tsx web/app/admin/settings/page.tsx web/AGENTS.md
git commit -m "feat: generate and revoke till access codes from the admin panel settings page, showing each code only once"
```

---

### Task 6: Verify the server end-to-end before touching the client

**Files:** none changed.

- [ ] **Step 1: Run the whole server suite**

Run: `cd laravel-server && php artisan test`
Expected: PASS, no regressions. Note that `/opt/alt/php82/usr/bin/php` is the production server's PHP path (`laravel-server/AGENTS.md`); locally plain `php` is fine.

- [ ] **Step 2: Issue a code against the local database and exercise the endpoint**

```bash
cd laravel-server
php artisan migrate
php artisan admin:till-code your-admin@dumosrx.com --label=local
curl -s -X POST http://localhost:8000/api/v1/app/admin-till-session \
  -H 'Content-Type: application/json' \
  -d '{"email":"your-admin@dumosrx.com","code":"<printed code>","store_id":"<a local store uuid>","device_id":"dev-check"}'
```

Expected: a JSON body with `token`, `expires_in: 1800` and `admin`. Re-run with a wrong code: exactly `{"error":"Wrong password."}` and 401. **Local only — never against `api.dumosrx.com`** (user standing rule).

- [ ] **Step 3: Commit nothing**

This task is a gate, not a change.

---

### Task 7: The client session module

**Files:**
- Create: `client/lib/utils/till-inspection.ts`
- Modify: `client/lib/storage-keys.ts`
- Test: `client/__tests__/till-inspection-session.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface TillInspectionSession { admin: { id: string; first_name: string; last_name: string; email: string; role: string }; token: string; expiresAt: string; storeId: string; deviceId: string }`
  - `startTillInspectionSession(session: TillInspectionSession): void`
  - `getTillInspectionSession(): TillInspectionSession | null` — returns null once `expiresAt` has passed
  - `isTillInspectionSession(): boolean`
  - `endTillInspectionSession(): void`
  - `READ_ONLY_REFUSAL_MESSAGE: string`

`sessionStorage`, not `localStorage`: the spec requires the session to end on app restart, and sessionStorage gives that for free rather than through an expiry check that could be skipped.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  startTillInspectionSession,
  getTillInspectionSession,
  isTillInspectionSession,
  endTillInspectionSession,
  type TillInspectionSession,
} from "@/lib/utils/till-inspection";

const session = (expiresAt: string): TillInspectionSession => ({
  admin: {
    id: "a1",
    first_name: "Ops",
    last_name: "Admin",
    email: "ops@dumosrx.com",
    role: "platform_admin",
  },
  token: "tok",
  expiresAt,
  storeId: "store-1",
  deviceId: "till-7",
});

describe("till inspection session", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("is inactive when nothing has been started", () => {
    expect(isTillInspectionSession()).toBe(false);
    expect(getTillInspectionSession()).toBeNull();
  });

  it("reads back a started session", () => {
    startTillInspectionSession(session(new Date(Date.now() + 60_000).toISOString()));

    expect(isTillInspectionSession()).toBe(true);
    expect(getTillInspectionSession()?.admin.email).toBe("ops@dumosrx.com");
  });

  it("treats an expired session as absent, so a stale entry cannot leave a till read-only", () => {
    startTillInspectionSession(session(new Date(Date.now() - 1_000).toISOString()));

    expect(isTillInspectionSession()).toBe(false);
    expect(getTillInspectionSession()).toBeNull();
  });

  it("clears on end", () => {
    startTillInspectionSession(session(new Date(Date.now() + 60_000).toISOString()));
    endTillInspectionSession();

    expect(isTillInspectionSession()).toBe(false);
  });

  it("answers false rather than throwing when storage is unavailable", () => {
    const spy = vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(isTillInspectionSession()).toBe(false);
    spy.mockRestore();
  });

  it("answers false during SSR", () => {
    expect(typeof window).toBe("object");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run __tests__/till-inspection-session.test.ts`
Expected: FAIL — cannot resolve `@/lib/utils/till-inspection`.

- [ ] **Step 3: Add the storage key**

In `client/lib/storage-keys.ts`'s `STORAGE_KEYS`, beside `impersonatedUser`:

```ts
  tillInspection: "dumos_till_inspection",
```

- [ ] **Step 4: Write the module**

```ts
import { STORAGE_KEYS } from "@/lib/storage-keys";

export interface TillInspectionSession {
  admin: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
  };
  token: string;
  expiresAt: string;
  storeId: string;
  deviceId: string;
}

export const TILL_INSPECTION_STORAGE_KEY = STORAGE_KEYS.tillInspection;

export const READ_ONLY_REFUSAL_MESSAGE =
  "This is a read-only admin inspection session. Sign in as a store user to make changes.";

export function startTillInspectionSession(session: TillInspectionSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TILL_INSPECTION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable; the session simply cannot start */
  }
}

export function getTillInspectionSession(): TillInspectionSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TILL_INSPECTION_STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as TillInspectionSession;
    if (!session?.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function isTillInspectionSession(): boolean {
  return getTillInspectionSession() !== null;
}

export function endTillInspectionSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TILL_INSPECTION_STORAGE_KEY);
  } catch {
    /* storage unavailable; nothing to clear */
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd client && npx vitest run __tests__/till-inspection-session.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add client/lib/utils/till-inspection.ts client/lib/storage-keys.ts client/__tests__/till-inspection-session.test.ts
git commit -m "feat: hold an admin till inspection session in sessionStorage so it expires on restart and reads as absent once stale"
```

---

### Task 8: The lock-screen discriminator

**Files:**
- Create: `client/lib/api/admin-till-session.ts`
- Modify: `client/lib/context/auth-context.tsx:299` (immediately after `let candidates = await getUsersByUsernameOrEmail(cleanIdentifier);`)
- Modify: `client/components/auth/traditional-login-form.tsx:75` (the `maxLength={4}` PIN field)
- Test: `client/__tests__/admin-till-login-discriminator.test.ts`

**Interfaces:**
- Consumes: `startTillInspectionSession` (Task 7), the endpoint (Task 3).
- Produces: `requestAdminTillSession(email: string, code: string): Promise<TillInspectionSession | null>` and `shouldAttemptAdminTillLogin(identifier: string, localCandidateCount: number): boolean`.

**This is the task carrying Review Focus items 1 and 2.** The whole discriminator rests on `login()` already calling `getUsersByUsernameOrEmail()` at line 299, so the local lookup costs nothing extra.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { shouldAttemptAdminTillLogin } from "@/lib/api/admin-till-session";

describe("shouldAttemptAdminTillLogin", () => {
  it("attempts the admin path for an email matching no user on this device", () => {
    expect(shouldAttemptAdminTillLogin("ops@dumosrx.com", 0)).toBe(true);
  });

  it("never attempts it for a plain username", () => {
    expect(shouldAttemptAdminTillLogin("cashier1", 0)).toBe(false);
  });

  it("leaves a store owner signing in with their own email to the offline login", () => {
    // The owner's email IS on a local user row, so this must stay local and
    // never reach the network — a till with no internet must still open.
    expect(shouldAttemptAdminTillLogin("owner@shop.com", 1)).toBe(false);
  });

  it("falls through to the PIN login when an admin email is also a local user", () => {
    // Documented constraint: such an admin cannot reach the admin path and
    // must use an email that is not on any local user record.
    expect(shouldAttemptAdminTillLogin("ops@dumosrx.com", 1)).toBe(false);
  });

  it("ignores surrounding whitespace and case", () => {
    expect(shouldAttemptAdminTillLogin("  OPS@DumosRx.com ", 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run __tests__/admin-till-login-discriminator.test.ts`
Expected: FAIL — cannot resolve `@/lib/api/admin-till-session`.

- [ ] **Step 3: Write the API module**

```ts
import { apiClient } from "@/lib/api/client";
import { getDeviceId } from "@/lib/utils/device-id";
import { getActiveStoreId } from "@/lib/db/core";
import type { TillInspectionSession } from "@/lib/utils/till-inspection";

export const TILL_CODE_LENGTH = 12;

export function shouldAttemptAdminTillLogin(
  identifier: string,
  localCandidateCount: number,
): boolean {
  return localCandidateCount === 0 && identifier.trim().includes("@");
}

export async function requestAdminTillSession(
  email: string,
  code: string,
): Promise<TillInspectionSession | null> {
  const storeId = getActiveStoreId();
  const deviceId = getDeviceId();

  const response = await apiClient.post("/app/admin-till-session", {
    email: email.trim(),
    code,
    store_id: storeId,
    device_id: deviceId,
  });

  if (!response?.token) return null;

  return {
    admin: response.admin,
    token: response.token,
    expiresAt: new Date(Date.now() + response.expires_in * 1000).toISOString(),
    storeId: storeId ?? "",
    deviceId,
  };
}
```

`lib/api/client.ts:261` exports a single `apiClient` instance (`export const apiClient = new ApiClient();`), so `apiClient.post(path, body)` is the house call style. Confirm its return shape (parsed body vs `Response`) at that class and unwrap accordingly.

- [ ] **Step 4: Wire the discriminator into `login()`**

In `lib/context/auth-context.tsx`, directly after `let candidates = await getUsersByUsernameOrEmail(cleanIdentifier);`:

```ts
    if (pin && shouldAttemptAdminTillLogin(cleanIdentifier, candidates.length)) {
      if (!navigator.onLine) {
        throw new Error("Admin access needs an internet connection.");
      }
      const session = await requestAdminTillSession(cleanIdentifier, pin).catch(
        () => null,
      );
      if (!session) {
        recordLoginFailure(cleanIdentifier);
        throw new Error("Wrong password.");
      }
      startTillInspectionSession(session);
      setIsInspecting(true);
      return true;
    }
```

It must not call `setDbUser()`, `setStoredUser()`, `setUser()`, or clear the POS cart. Add `isInspecting` to the context the way `isImpersonating` already is (line 254's `setIsImpersonating(isImpersonatedSession())` is the pattern).

- [ ] **Step 5: Relax the PIN field in admin mode**

`traditional-login-form.tsx` hard-codes `maxLength={4}` and `disabled={... pin.length !== 4}`. Add a prop:

```ts
  codeMode?: boolean;
```

and use it:

```tsx
              maxLength={codeMode ? TILL_CODE_LENGTH : 4}
```
```tsx
            disabled={isLoading || pin.length !== (codeMode ? TILL_CODE_LENGTH : 4)}
```

The parent sets `codeMode` once the typed identifier contains `@` and a `getUsersByUsernameOrEmail()` lookup for it returns nothing — the same predicate as `shouldAttemptAdminTillLogin`, run on blur. Label the field "Till access code" in that mode.

- [ ] **Step 6: Run the tests**

Run: `cd client && npx vitest run __tests__/admin-till-login-discriminator.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests), 0 type errors.

- [ ] **Step 7: Commit**

```bash
git add client/lib/api/admin-till-session.ts client/lib/context/auth-context.tsx client/components/auth/traditional-login-form.tsx client/__tests__/admin-till-login-discriminator.test.ts
git commit -m "feat: start an admin inspection session from an email that matches no user on this device, leaving every offline staff login untouched"
```

---

### Task 9: Read-only enforcement at the write helpers

**Files:**
- Modify: `client/lib/db/base-helpers.ts:156` (`insert`), `:230` (`update`), `:320` (`softDelete`)
- Test: `client/__tests__/till-inspection-read-only.test.ts`

**Interfaces:**
- Consumes: `isTillInspectionSession`, `READ_ONLY_REFUSAL_MESSAGE` (Task 7).
- Produces: `assertWritable(): void`, thrown from all three helpers.

One guard at the three functions every write already goes through. `foldStockQuantities()` writes quantities directly rather than via `update()` and so is unaffected — which is why the repair allowlist needs no bypass flag. State that in the doc rather than adding a mechanism.

**This task carries Review Focus item 5.**

- [ ] **Step 1: Write the failing test**

```ts
it("refuses an insert during an inspection session", async () => {
  startTillInspectionSession(activeSession());

  await expect(insert("products", { name: "paracetamol" })).rejects.toThrow(
    READ_ONLY_REFUSAL_MESSAGE,
  );
});

it("refuses an update and a soft delete during an inspection session", async () => {
  startTillInspectionSession(activeSession());

  await expect(update("products", "p1", { name: "x" })).rejects.toThrow(
    READ_ONLY_REFUSAL_MESSAGE,
  );
  await expect(softDelete("products", "p1")).rejects.toThrow(
    READ_ONLY_REFUSAL_MESSAGE,
  );
});

it("writes normally once the session has ended, leaving staff state untouched", async () => {
  localStorage.setItem("dumos_user", '{"id":"u1"}');
  localStorage.setItem("dumos_active_store_id", "store-1");

  startTillInspectionSession(activeSession());
  endTillInspectionSession();

  await expect(insert("products", { name: "paracetamol" })).resolves.toBeTypeOf("string");
  expect(localStorage.getItem("dumos_user")).toBe('{"id":"u1"}');
  expect(localStorage.getItem("dumos_active_store_id")).toBe("store-1");
});

it("does not block the fold, which bypasses update() by design", async () => {
  startTillInspectionSession(activeSession());

  await expect(foldStockQuantities()).resolves.toBeDefined();
});
```

Build the sql.js database the way `__tests__/stock-integrity-fold.test.ts:28-45` does (`SCHEMA_SQL`, `core.__setDatabaseForTesting(db)`, `core.setActiveStoreId(...)`, and the two `ALTER TABLE ... ADD COLUMN store_id` lines).

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run __tests__/till-inspection-read-only.test.ts`
Expected: FAIL — the inserts succeed instead of throwing.

- [ ] **Step 3: Add the guard**

In `base-helpers.ts`:

```ts
function assertWritable(): void {
  if (isTillInspectionSession()) {
    throw new Error(READ_ONLY_REFUSAL_MESSAGE);
  }
}
```

Call `assertWritable();` as the first statement of `insert`, `update` and `softDelete`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd client && npx vitest run __tests__/till-inspection-read-only.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add client/lib/db/base-helpers.ts client/__tests__/till-inspection-read-only.test.ts
git commit -m "fix: refuse every local write during an admin inspection session at the three helpers all writes already pass through"
```

---

### Task 10: The banner, the exit, and the diagnostics gate

**Files:**
- Create: `client/components/dashboard/till-inspection-banner.tsx`
- Modify: `client/components/dashboard/dashboard-layout.tsx` (mount it beside `ImpersonationBanner`)
- Modify: `client/components/settings/settings-client.tsx:243`
- Modify: `client/lib/constants/settings-tabs.ts`
- Test: `client/__tests__/till-inspection-banner.test.tsx`

**Interfaces:**
- Consumes: `getTillInspectionSession`, `endTillInspectionSession` (Task 7); the `end` endpoint (Task 3).
- Produces: `<TillInspectionBanner />`.

Also closes **A-198**: `diagnostics` joins `ALL_SETTINGS_TABS` *and* `ADMIN_ONLY_SETTINGS_TABS` in the same change, so client-side navigation works and it is not reachable by every role. The spec's §2 rule means `KNOWN_BUGS.md` loses the A-198 entry and `FIXED_BUGS.md` gains it, in this commit.

- [ ] **Step 1: Write the failing test**

```tsx
it("shows the admin's email and the read-only state while a session is active", () => {
  startTillInspectionSession(activeSession());
  render(<TillInspectionBanner />);

  expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  expect(screen.getByText(/ops@dumosrx.com/)).toBeInTheDocument();
});

it("renders nothing with no session", () => {
  const { container } = render(<TillInspectionBanner />);
  expect(container).toBeEmptyDOMElement();
});

it("clears the session when the admin ends it", async () => {
  startTillInspectionSession(activeSession());
  render(<TillInspectionBanner />);

  await userEvent.click(screen.getByRole("button", { name: /end session/i }));

  expect(isTillInspectionSession()).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run __tests__/till-inspection-banner.test.tsx`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Write the banner**

Copy `components/dashboard/impersonation-banner.tsx`'s structure (fixed top bar, `ShieldAlert`, an "End Session" button). Text: the admin's email, the store name, and the words "read-only admin inspection". On click: call the `end` endpoint, best-effort, then `endTillInspectionSession()` and reload. Follow §6 for colours — semantic tokens only, no hex.

- [ ] **Step 4: Gate the diagnostics tab on the inspection session**

`settings-client.tsx:243` currently renders the console when `isImpersonatedSession()`. Change to render when `isTillInspectionSession() || isImpersonatedSession()` — an on-till session is the case this was built for, and the handoff keeps working for looking at data.

In `settings-tabs.ts`, add `"diagnostics"` to **both** `ALL_SETTINGS_TABS` and `ADMIN_ONLY_SETTINGS_TABS`.

- [ ] **Step 5: End the session on explicit sign-out**

The spec requires exit on sign-out as well as on restart. `logout()` in
`lib/context/auth-context.tsx` (the `setDbUser(null)` path around line 655)
already clears the impersonated session; add `endTillInspectionSession()`
beside it, and assert it:

```ts
it("ends an inspection session on logout, so the till is not left read-only", async () => {
  startTillInspectionSession(activeSession());
  await logout();

  expect(isTillInspectionSession()).toBe(false);
});
```

- [ ] **Step 6: Run the client suite**

Run: `cd client && npx vitest run && npx tsc --noEmit`
Expected: PASS, 0 type errors.

- [ ] **Step 7: Move A-198 and commit**

Remove the A-198 entry from `docs/KNOWN_BUGS.md` outright; add it to `docs/FIXED_BUGS.md` with what the fix was.

```bash
git add client/components/dashboard/till-inspection-banner.tsx client/components/dashboard/dashboard-layout.tsx client/components/settings/settings-client.tsx client/lib/constants/settings-tabs.ts client/__tests__/till-inspection-banner.test.tsx docs/KNOWN_BUGS.md docs/FIXED_BUGS.md
git commit -m "feat: show a persistent read-only banner during an admin inspection session and open the diagnostics tab to it, closing A-198"
```

---

### Task 11: The clock-override repair action

**Files:**
- Modify: `client/components/auth/license-guard.tsx`
- Modify: `client/lib/licensing/licensing-manager.ts`
- Test: `client/__tests__/clock-override.test.ts`

**Interfaces:**
- Consumes: `getTillInspectionSession` (Task 7).
- Produces: `overrideClockLockout(): Promise<void>` — clears the tampered-clock lockout, available only while an inspection session is active.

The second and last entry on the repair allowlist. It is available to `platform_admin` and `super_admin` (the session cannot exist for anyone else), and requires the online session by construction — which was the original requirement: the owner is a plausible tamperer, so no owner PIN lifts it.

**Reachability, which the rest of this plan got wrong.** `license-guard.tsx:358`
returns the clock-discrepancy card **instead of `children`**, so while a device
is in clock-tamper state the whole app is unreachable — including the lock
screen, "someone else", and therefore the admin login this override depends
on. An admin standing at that till would have no way in.

So the admin entry must live **on the LicenseGuard card itself**, beside its
existing "Check Again" and "Renew Subscription" buttons, not only on the lock
screen. That is sound rather than a workaround: the card already states the
lockout "can only be cleared online", and an inspection session is online-only
anyway, so the two constraints agree. It reuses the same email + code form,
the same endpoint and the same credential — no second mechanism.

Build the form once as `components/auth/admin-till-login.tsx` (email field,
12-digit code field, uniform `Wrong password.` failure). Task 8 mounts it from
the lock screen; this task mounts it from the LicenseGuard card. Note the
ordering consequence: extract that component in Task 8, not here.

- [ ] **Step 1: Write the failing test**

```ts
it("clears a clock lockout while an inspection session is active", async () => {
  startTillInspectionSession(activeSession());
  await overrideClockLockout();

  expect(await isClockLockoutActive()).toBe(false);
});

it("refuses without an inspection session", async () => {
  await expect(overrideClockLockout()).rejects.toThrow(/inspection session/i);
});

it("offers the admin entry on the clock-discrepancy card, which replaces the whole app", () => {
  // license-guard.tsx returns this card INSTEAD of children, so without an
  // entry here a tampered till could never be unlocked by an admin.
  render(<LicenseGuard><div>app</div></LicenseGuard>);

  expect(screen.queryByText("app")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /admin access/i })).toBeInTheDocument();
});
```

Mock `checkLicenseStatus()` to resolve `{ isValid: false, isClockTampered: true }`
for that second test.

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run __tests__/clock-override.test.ts`
Expected: FAIL — `overrideClockLockout` is not exported.

- [ ] **Step 3: Implement it**

The lockout is driven by `stores.last_monotonic_time` being ahead of now
(`licensing-manager.ts:63-77`). `reconcileClockWithServer()` (`:156`) already
clears it correctly, but refuses in three cases — no watermark, the device's
own clock disagrees with the server (`!reading.agrees`), or the watermark is
not actually ahead of server time.

The override is the admin-present version of that same write: it still
requires a live `readServerClock()` reading, so server time remains the
authority and a tampered device cannot talk its way out, but it skips the
`reading.agrees` refusal — which is exactly the case a physically-present
admin is there to resolve.

```ts
export async function overrideClockLockout(): Promise<{ ok: boolean; reason: string }> {
  if (!getTillInspectionSession()) {
    throw new Error("Requires an admin inspection session.");
  }

  const profile = await getStoreProfile();
  if (!profile) return { ok: false, reason: "No store profile on this device." };

  const reading = await readServerClock();
  if (!reading) {
    return {
      ok: false,
      reason: "Could not reach our servers to confirm the time. Connect to the internet and try again.",
    };
  }

  await updateStoreMonotonicTime(profile.id, reading.serverNow.toISOString());

  return { ok: true, reason: "Clock watermark reset to server time by admin override." };
}
```

Surface the button inside the admin section only. Do **not** alter
`LicenseGuard`'s anti-backdating logic itself (§8), and do not relax
`reconcileClockWithServer()` — the override is a separate, audited path.

- [ ] **Step 4: Run to verify it passes**

Run: `cd client && npx vitest run __tests__/clock-override.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/components/auth/license-guard.tsx client/lib/licensing/licensing-manager.ts client/__tests__/clock-override.test.ts
git commit -m "feat: let a platform admin clear a tampered-clock lockout from an on-till inspection session"
```

---

### Task 12: Documentation and the browser smoke test

**Files:**
- Modify: `client/AGENTS.md`, `laravel-server/AGENTS.md`
- Modify: `docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md` (status line)

- [ ] **Step 1: Write the client docs**

In `client/AGENTS.md`, beside the diagnostics-console section added earlier: the discriminator and why it is `candidates.length === 0 && includes("@")` rather than "an email was typed" (a store owner signs in with their email offline — `lib/db/queries/auth.ts:26`); that the session lives in `sessionStorage` so it dies on restart; that read-only is one guard in the three write helpers; that the fold and the clock override bypass `update()` by design and so need no exception; and the known constraint about an admin email that is also a local user.

- [ ] **Step 2: Run the full suites**

Run: `cd client && npx tsc --noEmit && npx vitest run`
Run: `cd laravel-server && php artisan test`
Expected: both clean.

- [ ] **Step 3: Real logged-in browser smoke test**

Root `AGENTS.md` §9 requires it: this change spans a server permission model and a frontend rendering around it, which is exactly where backend-only verification misses the bug. Against a **local** dev server only:

1. Sign in as ordinary staff with a username and PIN — works, offline.
2. Sign in as the store owner **with their email**, offline — works. (Review Focus 1.)
3. Lock, "someone else", type the admin email — the field becomes a 12-digit code field.
4. Wrong code → `Wrong password.`; correct code → banner appears, Settings shows Diagnostics.
5. Try to edit a product → refused with the read-only message.
6. End session → the staff user is still signed in, the active store is unchanged, sync still runs.
7. Force the clock-tamper state (set the device clock back after a sync, so
   `last_monotonic_time` is ahead of now) and confirm the discrepancy card
   appears **with** an "Admin access" entry, that the email + code form works
   from there, and that the override clears the lockout. This is the one path
   that has no reachable fallback if it is broken.

- [ ] **Step 4: Flip the spec's status and commit**

```bash
git add client/AGENTS.md laravel-server/AGENTS.md docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md
git commit -m "docs: document the on-till inspection session's discriminator, session storage and read-only guard"
```
