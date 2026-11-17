<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\User;
use Illuminate\Support\Str;

class SyncPushUserDuplicateConflictTest extends SyncPushTwoTenantTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $perm = Permission::firstOrCreate(['slug' => 'manage_staff'], [
            'name' => 'Manage Staff',
            'category' => 'staff',
        ]);
        $this->attackerOwner->permissions()->attach($perm->id, ['granted' => true]);
    }
    public function test_a_users_insert_with_no_email_and_no_username_is_not_matched_as_duplicate_conflict_onto_foreign_tenant(): void
    {
        $foreignOwner = User::create([
            'first_name' => 'Foreign',
            'last_name' => 'Owner',
            'email' => 'foreign-storeless@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'username' => null,
            'store_id' => null,
        ]);

        $pushedUserId = (string) Str::uuid();

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'changes' => [
                [
                    'id' => (string) Str::uuid(),
                    'table_name' => 'users',
                    'record_id' => $pushedUserId,
                    'operation' => 'INSERT',
                    'payload' => [
                        'id' => $pushedUserId,
                        'first_name' => 'Crafted',
                        'last_name' => 'Staff',
                        'role' => 'admin',
                    ],
                ],
            ],
        ]);

        $response->assertOk();

        $this->assertDatabaseMissing('users', [
            'id' => $foreignOwner->id,
            'first_name' => 'Crafted',
        ]);

        $this->assertDatabaseHas('users', [
            'id' => $pushedUserId,
            'first_name' => 'Crafted',
        ]);
    }

    public function test_a_users_insert_with_email_matching_another_tenant_does_not_remap_foreign_user_id(): void
    {
        $pushedUserId = (string) Str::uuid();

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'changes' => [
                [
                    'id' => (string) Str::uuid(),
                    'table_name' => 'users',
                    'record_id' => $pushedUserId,
                    'operation' => 'INSERT',
                    'payload' => [
                        'id' => $pushedUserId,
                        'first_name' => 'Attacker',
                        'last_name' => 'Clone',
                        'email' => $this->victimOwner->email,
                        'role' => 'admin',
                    ],
                ],
            ],
        ]);

        $response->assertOk();

        $this->assertDatabaseMissing('users', [
            'id' => $this->victimOwner->id,
            'first_name' => 'Attacker',
        ]);
    }

    public function test_a_users_insert_with_username_matching_another_tenant_does_not_remap_foreign_user_id(): void
    {
        $foreignOwner = User::create([
            'first_name' => 'Foreign',
            'last_name' => 'Owner',
            'email' => 'foreign-owner-2@dumosrx.com',
            'username' => 'victim_store_owner',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'store_id' => null,
        ]);

        $pushedUserId = (string) Str::uuid();

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'changes' => [
                [
                    'id' => (string) Str::uuid(),
                    'table_name' => 'users',
                    'record_id' => $pushedUserId,
                    'operation' => 'INSERT',
                    'payload' => [
                        'id' => $pushedUserId,
                        'first_name' => 'Attacker',
                        'last_name' => 'Clone',
                        'username' => 'victim_store_owner',
                        'role' => 'admin',
                    ],
                ],
            ],
        ]);

        $response->assertOk();

        $this->assertDatabaseMissing('users', [
            'id' => $foreignOwner->id,
            'first_name' => 'Attacker',
        ]);

        $this->assertDatabaseHas('users', [
            'id' => $pushedUserId,
            'first_name' => 'Attacker',
        ]);
    }

    public function test_a_genuine_duplicate_user_in_same_tenant_remaps_to_existing_user(): void
    {
        $existingStaff = User::create([
            'first_name' => 'Existing',
            'last_name' => 'Staff',
            'email' => 'existing-staff@dumosrx.com',
            'username' => 'existing_staff_user',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->attackerStore->id,
        ]);

        $pushedUserId = (string) Str::uuid();

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'changes' => [
                [
                    'id' => (string) Str::uuid(),
                    'table_name' => 'users',
                    'record_id' => $pushedUserId,
                    'operation' => 'INSERT',
                    'payload' => [
                        'id' => $pushedUserId,
                        'first_name' => 'Duplicate',
                        'last_name' => 'Staff',
                        'username' => 'existing_staff_user',
                        'store_id' => $this->attackerStore->id,
                        'role' => 'sales_staff',
                    ],
                ],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('processed', 1);

        $this->assertDatabaseMissing('users', [
            'id' => $pushedUserId,
        ]);
    }
}
