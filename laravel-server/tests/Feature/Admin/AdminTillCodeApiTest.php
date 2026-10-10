<?php

namespace Tests\Feature\Admin;

use App\Models\AdminTillCode;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminTillCodeApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // platform_admin's manage_platform grant is seeded, not migrated.
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
    }

    // hasPermission() resolves manage_platform only through the role_id pivot
    // or a direct grant — the `role` string satisfies hasRole() but confers no
    // permissions. role_id is not in User::$fillable, so it needs forceFill.
    private function admin(string $role = 'platform_admin'): User
    {
        $user = User::create([
            'first_name' => 'Platform',
            'last_name' => 'Tester',
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
            'is_active' => true,
        ]);

        $user->forceFill([
            'role_id' => \App\Models\Role::where('slug', $role)->value('id'),
        ])->save();

        return $user;
    }

    public function test_an_admin_issues_a_code_for_themselves_and_sees_it_once(): void
    {
        $admin = $this->admin();

        $response = $this->actingAs($admin)
            ->postJson('/api/v1/admin/till-codes', ['label' => 'agidi']);

        $response->assertOk()->assertJsonStructure(['id', 'code']);
        $this->assertSame(12, strlen((string) $response->json('code')));
        $this->assertTrue(Hash::check(
            $response->json('code'),
            AdminTillCode::where('admin_id', $admin->id)->firstOrFail()->code_hash,
        ));

        $listed = $this->actingAs($admin)->getJson('/api/v1/admin/till-codes/mine')->assertOk();

        $this->assertSame('agidi', $listed->json('codes.0.label'));
        $this->assertArrayNotHasKey('code_hash', $listed->json('codes.0'));
        $this->assertArrayNotHasKey('code', $listed->json('codes.0'));
    }

    public function test_an_admin_cannot_mint_a_code_for_another_admin(): void
    {
        $admin = $this->admin();
        $other = $this->admin();

        $this->actingAs($admin)->postJson('/api/v1/admin/till-codes', [
            'label' => 'sneaky',
            'admin_id' => $other->id,
        ])->assertOk();

        $this->assertSame(0, AdminTillCode::where('admin_id', $other->id)->count());
        $this->assertSame(1, AdminTillCode::where('admin_id', $admin->id)->count());
    }

    public function test_listing_shows_only_the_callers_own_codes(): void
    {
        $admin = $this->admin();
        $other = $this->admin();
        AdminTillCode::create(['admin_id' => $other->id, 'code_hash' => Hash::make('111111111111')]);

        $this->actingAs($admin)->getJson('/api/v1/admin/till-codes/mine')
            ->assertOk()
            ->assertJsonCount(0, 'codes');
    }

    public function test_revoking_someone_elses_code_is_not_found(): void
    {
        $admin = $this->admin();
        $other = $this->admin();
        $theirs = AdminTillCode::create([
            'admin_id' => $other->id,
            'code_hash' => Hash::make('111111111111'),
        ]);

        $this->actingAs($admin)->deleteJson("/api/v1/admin/till-codes/{$theirs->id}")
            ->assertStatus(404);

        $this->assertNull($theirs->fresh()->revoked_at);
    }

    public function test_an_admin_revokes_their_own_code(): void
    {
        $admin = $this->admin();
        $mine = AdminTillCode::create([
            'admin_id' => $admin->id,
            'code_hash' => Hash::make('111111111111'),
        ]);

        $this->actingAs($admin)->deleteJson("/api/v1/admin/till-codes/{$mine->id}")->assertOk();

        $this->assertNotNull($mine->fresh()->revoked_at);
    }

    public function test_a_fourth_active_code_is_refused(): void
    {
        $admin = $this->admin();

        for ($i = 0; $i < 3; $i++) {
            $this->actingAs($admin)->postJson('/api/v1/admin/till-codes')->assertOk();
        }

        $this->actingAs($admin)->postJson('/api/v1/admin/till-codes')->assertStatus(422);
        $this->assertSame(3, AdminTillCode::active()->where('admin_id', $admin->id)->count());
    }

    public function test_the_cap_refusal_carries_a_message_the_panel_can_display(): void
    {
        $admin = $this->admin();

        for ($i = 0; $i < 3; $i++) {
            $this->actingAs($admin)->postJson('/api/v1/admin/till-codes')->assertOk();
        }

        $this->actingAs($admin)->postJson('/api/v1/admin/till-codes')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Revoke an existing code first; three active codes is the maximum.');
    }

    public function test_a_super_admin_reads_every_admins_code_in_clear(): void
    {
        $owner = $this->admin();
        $issued = $this->actingAs($owner)
            ->postJson('/api/v1/admin/till-codes', ['label' => 'agidi'])
            ->json('code');

        $superAdmin = $this->admin('super_admin');

        $response = $this->actingAs($superAdmin)->getJson('/api/v1/admin/till-codes/all')->assertOk();

        $row = collect($response->json('codes'))->firstWhere('label', 'agidi');

        $this->assertSame($issued, $row['code']);
        $this->assertSame($owner->email, $row['admin_email']);
    }

    public function test_a_legacy_hash_only_code_is_listed_as_unavailable(): void
    {
        $owner = $this->admin();
        AdminTillCode::create([
            'admin_id' => $owner->id,
            'code_hash' => Hash::make('111111111111'),
            'label' => 'legacy',
        ]);

        $response = $this->actingAs($this->admin('super_admin'))
            ->getJson('/api/v1/admin/till-codes/all')
            ->assertOk();

        $row = collect($response->json('codes'))->firstWhere('label', 'legacy');

        $this->assertNull($row['code']);
    }

    public function test_the_stored_copy_is_encrypted_rather_than_plaintext(): void
    {
        $admin = $this->admin();
        $code = $this->actingAs($admin)->postJson('/api/v1/admin/till-codes')->json('code');

        $stored = \DB::table('admin_till_codes')->where('admin_id', $admin->id)->value('code_encrypted');

        $this->assertNotNull($stored);
        $this->assertStringNotContainsString($code, $stored);
        $this->assertSame($code, \Illuminate\Support\Facades\Crypt::decryptString($stored));
    }

    public function test_a_super_admin_read_is_audited(): void
    {
        $owner = $this->admin();
        $this->actingAs($owner)->postJson('/api/v1/admin/till-codes')->assertOk();

        $superAdmin = $this->admin('super_admin');
        $this->actingAs($superAdmin)->getJson('/api/v1/admin/till-codes/all')->assertOk();

        $log = \App\Models\ActivityLog::where('action', 'admin_till_codes_viewed')->firstOrFail();

        $this->assertSame($superAdmin->id, $log->user_id);
        $this->assertContains($owner->id, $log->properties['admin_ids']);
    }

    public function test_a_platform_admin_cannot_read_every_code(): void
    {
        $this->actingAs($this->admin())->getJson('/api/v1/admin/till-codes/all')->assertForbidden();
    }

    public function test_a_store_owner_cannot_reach_these_routes(): void
    {
        $owner = $this->admin('store_owner');

        $this->actingAs($owner)->postJson('/api/v1/admin/till-codes')->assertForbidden();
        $this->actingAs($owner)->getJson('/api/v1/admin/till-codes/mine')->assertForbidden();
    }
}
