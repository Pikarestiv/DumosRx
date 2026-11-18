<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A-397. A staff email edit that names an address another account already
 * holds used to fail on the unique index at every retry, returning raw SQL as
 * the reason. It is now refused up front with the stable reason `email_in_use`.
 */
class SyncPushUserEmailCollisionTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner', 'email' => 'owner@shop.test',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Main', 'email' => 'main@shop.test', 'phone' => '1',
            'address' => '1 Main St', 'slug' => 'main', 'device_id' => 'WEB-MAIN',
        ]);
        $this->owner->update(['store_id' => $store->id]);
        $this->staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'Member', 'email' => 'staff@local.dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'sales_staff', 'store_id' => $store->id,
        ]);
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1, 'staff' => -1]]],
        ]);
        $this->withoutMiddleware();
        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function pushEmail(string $email)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'id' => 1,
                'table_name' => 'users',
                'operation' => 'UPDATE',
                'record_id' => $this->staff->id,
                'payload' => ['id' => $this->staff->id, 'email' => $email, '_version' => 2],
            ]],
        ]);
    }

    private function holder(string $email, bool $trashed = false): User
    {
        $holder = User::create([
            'first_name' => 'Holder', 'last_name' => 'X', 'email' => $email,
            'password' => bcrypt('password'), 'role' => 'super_admin',
        ]);
        if ($trashed) {
            $holder->delete();
        }

        return $holder;
    }

    public function test_an_email_another_account_holds_is_refused_with_a_stable_reason_and_no_sql(): void
    {
        $this->holder('josh@dumostech.com');

        $response = $this->pushEmail('josh@dumostech.com')->assertOk();

        $this->assertSame('email_in_use', $response->json('failed.0.reason'));
        $this->assertSame($this->staff->id, $response->json('failed.0.record_id'));
        $this->assertStringNotContainsStringIgnoringCase('SQLSTATE', $response->getContent());
        $this->assertSame('staff@local.dumosrx.com', $this->staff->fresh()->email);
    }

    public function test_an_archived_accounts_address_is_free_to_reuse(): void
    {
        $this->holder('old@shop.test', trashed: true);

        $response = $this->pushEmail('old@shop.test')->assertOk();

        $this->assertSame([], $response->json('failed'));
        $this->assertSame('old@shop.test', $this->staff->fresh()->email);
    }

    public function test_the_collision_is_caught_whatever_the_letter_case(): void
    {
        $this->holder('josh@dumostech.com');

        $this->assertSame('email_in_use', $this->pushEmail('JOSH@dumostech.com')->assertOk()->json('failed.0.reason'));
    }

    public function test_a_free_email_is_saved(): void
    {
        $response = $this->pushEmail('josh+staff@dumostech.com')->assertOk();

        $this->assertSame([], $response->json('failed'));
        $this->assertSame('josh+staff@dumostech.com', $this->staff->fresh()->email);
    }

    public function test_pushing_the_email_the_account_already_has_is_not_a_collision(): void
    {
        $response = $this->pushEmail('staff@local.dumosrx.com')->assertOk();

        $this->assertSame([], $response->json('failed'));
    }
}
