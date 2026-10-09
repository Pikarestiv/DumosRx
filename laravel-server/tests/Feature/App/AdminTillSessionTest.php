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
}
