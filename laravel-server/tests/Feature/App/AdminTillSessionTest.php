<?php

namespace Tests\Feature\App;

use App\Models\AdminTillCode;
use App\Models\AdminTillSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminTillSessionTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $role = 'platform_admin', ?string $email = null): User
    {
        return User::create([
            'first_name' => 'Platform',
            'last_name' => 'Tester',
            'email' => $email ?? $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    public function test_active_scope_excludes_revoked_codes(): void
    {
        $admin = $this->admin();

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

    public function test_a_code_never_serialises_its_hash(): void
    {
        $admin = $this->admin();
        $code = AdminTillCode::create([
            'admin_id' => $admin->id,
            'code_hash' => Hash::make('123456789012'),
        ]);

        $this->assertArrayNotHasKey('code_hash', $code->fresh()->toArray());
    }

    public function test_a_session_records_the_device_and_opens_live(): void
    {
        $admin = $this->admin();

        $session = AdminTillSession::create([
            'admin_id' => $admin->id,
            'store_id' => null,
            'device_id' => 'till-7',
            'started_at' => now(),
            'expires_at' => now()->addHours(4),
        ]);

        $fresh = $session->fresh();

        $this->assertSame('till-7', $fresh->device_id);
        $this->assertNotNull($fresh->started_at);
        $this->assertSame($admin->id, $fresh->admin->id);
        $this->assertTrue(AdminTillSession::live()->where('id', $session->id)->exists());
    }

    public function test_live_scope_matches_on_ended_at_only_so_an_expired_session_can_still_be_closed(): void
    {
        $admin = $this->admin();

        $expired = AdminTillSession::create([
            'admin_id' => $admin->id,
            'device_id' => 'till-7',
            'started_at' => now()->subHours(9),
            'expires_at' => now()->subHours(5),
        ]);

        // Including `expires_at > now()` here would make a session that hit the
        // 4h cap impossible to close, losing its audit duration for good.
        $this->assertTrue(AdminTillSession::live()->where('id', $expired->id)->exists());

        $expired->update(['ended_at' => now(), 'end_reason' => 'expired']);

        $this->assertFalse(AdminTillSession::live()->where('id', $expired->id)->exists());
    }

    private function seedAdminWithCode(string $code = '123456789012'): User
    {
        if (!User::where('email', 'owner@shop.com')->exists()) {
            $this->admin('store_owner', 'owner@shop.com');
        }

        $admin = $this->admin('platform_admin', 'ops@dumosrx.com');

        AdminTillCode::create([
            'admin_id' => $admin->id,
            'code_hash' => Hash::make($code),
        ]);

        return $admin;
    }

    private function open(array $payload = [])
    {
        return $this->postJson('/api/v1/app/admin-till-session', $payload + [
            'email' => 'ops@dumosrx.com',
            'code' => '123456789012',
            'store_id' => (string) \Illuminate\Support\Str::uuid(),
            'device_id' => 'till-7',
        ]);
    }

    public function test_a_valid_email_and_code_opens_an_inspection_session(): void
    {
        $admin = $this->seedAdminWithCode();

        $response = $this->open();

        $response->assertOk()->assertJsonStructure([
            'session_id', 'expires_in', 'expires_at',
            'admin' => ['id', 'first_name', 'last_name', 'email', 'role'],
        ]);
        $this->assertSame($admin->id, $response->json('admin.id'));
        $this->assertSame(4 * 3600, $response->json('expires_in'));
        $this->assertDatabaseHas('admin_till_sessions', [
            'id' => $response->json('session_id'),
            'admin_id' => $admin->id,
            'device_id' => 'till-7',
            'ended_at' => null,
        ]);
        $this->assertNotNull(
            AdminTillCode::where('admin_id', $admin->id)->first()->last_used_at,
        );
    }

    public function test_the_response_never_carries_a_token_or_a_hash(): void
    {
        $this->seedAdminWithCode();

        $body = $this->open()->assertOk()->json();

        $this->assertArrayNotHasKey('token', $body);
        $this->assertArrayNotHasKey('code_hash', $body['admin']);
        $this->assertArrayNotHasKey('password', $body['admin']);
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
        $this->assertSame(0, AdminTillSession::count());
    }

    public static function rejectionProvider(): array
    {
        return [
            'wrong code' => [['email' => 'ops@dumosrx.com', 'code' => '999999999999']],
            'unknown email' => [['email' => 'nobody@dumosrx.com', 'code' => '123456789012']],
            'not an admin' => [['email' => 'owner@shop.com', 'code' => '123456789012']],
            // Each of these would be a 422 under $request->validate(), which is
            // itself a distinguishing signal.
            'missing code' => [['email' => 'ops@dumosrx.com']],
            'missing email' => [['code' => '123456789012']],
            'empty email' => [['email' => '', 'code' => '123456789012']],
            'over-long code' => [['email' => 'ops@dumosrx.com', 'code' => '999999999999999999999999999999999999999999999999999999999999999999999']],
            'array email' => [['email' => ['x'], 'code' => '123456789012']],
            'array code' => [['email' => 'ops@dumosrx.com', 'code' => ['x']]],
            'numeric code' => [['email' => 'ops@dumosrx.com', 'code' => 123456789012]],
        ];
    }

    public function test_a_revoked_code_is_rejected_like_a_wrong_one(): void
    {
        $admin = $this->seedAdminWithCode();
        AdminTillCode::where('admin_id', $admin->id)->update(['revoked_at' => now()]);

        $this->open()->assertStatus(401)->assertExactJson(['error' => 'Wrong password.']);
    }

    public function test_a_non_uuid_store_id_is_stored_as_null_rather_than_failing(): void
    {
        $this->seedAdminWithCode();

        $response = $this->open(['store_id' => 'not-a-uuid'])->assertOk();

        $this->assertDatabaseHas('admin_till_sessions', [
            'id' => $response->json('session_id'),
            'store_id' => null,
        ]);
    }

    public function test_entry_is_audit_logged_with_the_device_and_store(): void
    {
        $admin = $this->seedAdminWithCode();
        $storeId = (string) \Illuminate\Support\Str::uuid();

        $this->open(['store_id' => $storeId])->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $admin->id,
            'store_id' => $storeId,
            'action' => 'admin_till_session_started',
        ]);
    }

    public function test_ending_a_session_records_its_duration_and_is_idempotent(): void
    {
        $this->seedAdminWithCode();

        $sessionId = $this->open()->assertOk()->json('session_id');

        $this->postJson('/api/v1/app/admin-till-session/end', [
            'session_id' => $sessionId,
            'reason' => 'idle',
        ])->assertOk();

        $row = AdminTillSession::findOrFail($sessionId);
        $this->assertNotNull($row->ended_at);
        $this->assertSame('idle', $row->end_reason);

        $log = \App\Models\ActivityLog::where('action', 'admin_till_session_ended')->firstOrFail();
        $this->assertArrayHasKey('duration_seconds', $log->properties);

        // Replaying it, or sending junk, is a 200 that changes nothing.
        $this->postJson('/api/v1/app/admin-till-session/end', ['session_id' => $sessionId])->assertOk();
        $this->postJson('/api/v1/app/admin-till-session/end', ['session_id' => 'not-a-session'])->assertOk();
        $this->postJson('/api/v1/app/admin-till-session/end', [])->assertOk();

        $this->assertSame(
            1,
            \App\Models\ActivityLog::where('action', 'admin_till_session_ended')->count(),
        );
    }

    public function test_an_unrecognised_end_reason_falls_back_rather_than_being_stored(): void
    {
        $this->seedAdminWithCode();
        $sessionId = $this->open()->assertOk()->json('session_id');

        $this->postJson('/api/v1/app/admin-till-session/end', [
            'session_id' => $sessionId,
            'reason' => 'something-invented',
        ])->assertOk();

        $this->assertSame('signed_out', AdminTillSession::findOrFail($sessionId)->end_reason);
    }

    public function test_a_session_past_its_hard_cap_can_still_be_closed(): void
    {
        $this->seedAdminWithCode();
        $sessionId = $this->open()->assertOk()->json('session_id');

        AdminTillSession::where('id', $sessionId)->update(['expires_at' => now()->subHour()]);

        $this->postJson('/api/v1/app/admin-till-session/end', ['session_id' => $sessionId])->assertOk();

        $this->assertNotNull(AdminTillSession::findOrFail($sessionId)->ended_at);
    }

    public function test_all_three_permitted_codes_work_and_cost_the_same(): void
    {
        $admin = $this->seedAdminWithCode();

        // Three active codes is the enforced maximum (the issue paths refuse a
        // fourth), precisely so EQUALIZED_CHECKS can check every one of them.
        foreach (['222222222222', '333333333333'] as $code) {
            AdminTillCode::create([
                'admin_id' => $admin->id,
                'code_hash' => Hash::make($code),
            ]);
        }

        foreach (['123456789012', '222222222222', '333333333333'] as $code) {
            $this->open(['code' => $code])->assertOk();
        }

        $this->open(['code' => '999999999999'])->assertStatus(401);
    }

    public function test_the_console_refuses_a_fourth_active_code(): void
    {
        $this->seedAdminWithCode();

        foreach (['222222222222', '333333333333'] as $code) {
            AdminTillCode::create([
                'admin_id' => User::where('email', 'ops@dumosrx.com')->first()->id,
                'code_hash' => Hash::make($code),
            ]);
        }

        $this->artisan('admin:till-code', ['email' => 'ops@dumosrx.com'])
            ->assertExitCode(1);

        $this->assertSame(3, AdminTillCode::active()->count());
    }

    public function test_an_admin_whose_role_is_held_only_on_the_pivot_still_verifies(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        // The `role` column says something harmless; the real grant is role_id.
        // A bare column comparison in verify() would reject this admin.
        $admin = User::create([
            'first_name' => 'Pivot',
            'last_name' => 'Admin',
            'email' => 'pivot@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'pharmacist',
        ]);
        // role_id is not in User::$fillable, so create() drops it silently —
        // a test that "grants" a role that way is really granting it via the
        // string column and proves nothing about the pivot.
        $admin->forceFill([
            'role_id' => \App\Models\Role::where('slug', 'platform_admin')->value('id'),
        ])->save();
        AdminTillCode::create([
            'admin_id' => $admin->id,
            'code_hash' => Hash::make('123456789012'),
        ]);

        $this->postJson('/api/v1/app/admin-till-session', [
            'email' => 'pivot@dumosrx.com',
            'code' => '123456789012',
            'device_id' => 'till-7',
        ])->assertOk();
    }
}
