<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Staff are created without an email, and a till that has not updated sends
 * that as an empty string. Two empty strings collide on users.email's unique
 * index while two NULLs do not, so the second such account used to fail every
 * retry. A blank email is now stored as NULL.
 */
class SyncPushStaffBlankEmailTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner', 'email' => 'owner@shop.test',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Agidi', 'email' => 'agidi@shop.test', 'phone' => '1',
            'address' => '1 Main St', 'slug' => 'agidi', 'device_id' => 'WEB-AGIDI',
        ]);
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1, 'staff' => -1]]],
        ]);
        $this->withoutMiddleware();
        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function pushStaff(string $username, string $email): string
    {
        $id = (string) Str::uuid();
        $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'users',
                'operation' => 'INSERT',
                'record_id' => $id,
                'payload' => [
                    'id' => $id, 'first_name' => 'Staff', 'last_name' => $username, 'username' => $username,
                    'email' => $email, 'role' => 'sales_staff', 'store_id' => $this->store->id, 'pin' => '1234',
                ],
            ]],
        ])->assertOk()->assertJsonCount(0, 'failed');

        return $id;
    }

    public function test_several_staff_pushed_with_an_empty_email_are_all_saved_with_no_email(): void
    {
        $first = $this->pushStaff('amaka', '');
        $second = $this->pushStaff('chidi', '');
        $third = $this->pushStaff('obi', '   ');

        foreach ([$first, $second, $third] as $id) {
            $staff = User::find($id);
            $this->assertNotNull($staff);
            $this->assertNull($staff->email);
        }
    }

    public function test_a_real_email_is_kept(): void
    {
        $id = $this->pushStaff('amaka', 'amaka@shop.test');

        $this->assertSame('amaka@shop.test', User::find($id)->email);
    }
}
