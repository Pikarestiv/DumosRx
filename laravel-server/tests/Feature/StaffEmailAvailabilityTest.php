<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StaffEmailAvailabilityTest extends TestCase
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
            'first_name' => 'Staff', 'last_name' => 'Member', 'email' => 'staff@shop.test',
            'password' => bcrypt('password'), 'role' => 'sales_staff', 'store_id' => $store->id,
        ]);
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1, 'staff' => -1]]],
        ]);
        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
        $this->withoutMiddleware([\Illuminate\Routing\Middleware\ThrottleRequests::class, \App\Http\Middleware\CheckSubscription::class, \App\Http\Middleware\CheckAccountStatus::class, \App\Http\Middleware\EnsureEmailIsVerified::class]);
    }

    private function check(string $email, array $extra = [])
    {
        return $this->actingAs($this->owner)->getJson('/api/v1/app/staff/email-available?'.http_build_query(['email' => $email] + $extra));
    }

    public function test_a_free_address_is_available(): void
    {
        $this->check('new@shop.test')->assertOk()->assertJson(['available' => true]);
    }

    public function test_an_address_any_account_holds_is_taken_whatever_the_case(): void
    {
        User::create([
            'first_name' => 'Josh', 'last_name' => 'Odumodu', 'email' => 'josh@dumostech.com',
            'password' => bcrypt('password'), 'role' => 'super_admin',
        ]);

        $this->check('josh@dumostech.com')->assertOk()->assertJson(['available' => false]);
        $this->check('JOSH@Dumostech.com')->assertOk()->assertJson(['available' => false]);
    }

    public function test_the_account_being_edited_does_not_collide_with_itself(): void
    {
        $this->check('staff@shop.test')->assertOk()->assertJson(['available' => false]);
        $this->check('staff@shop.test', ['ignore_id' => $this->staff->id])->assertOk()->assertJson(['available' => true]);
    }

    public function test_an_archived_accounts_address_is_available_again(): void
    {
        $gone = User::create([
            'first_name' => 'Old', 'last_name' => 'Hand', 'email' => 'old@shop.test',
            'password' => bcrypt('password'), 'role' => 'sales_staff',
        ]);
        $gone->delete();

        $this->check('old@shop.test')->assertOk()->assertJson(['available' => true]);
    }

    public function test_a_malformed_address_is_a_validation_error(): void
    {
        $this->check('not-an-email')->assertStatus(422);
    }

    public function test_a_guest_cannot_probe_addresses(): void
    {
        $this->getJson('/api/v1/app/staff/email-available?email=a@b.co')->assertUnauthorized();
    }

    public function test_someone_without_manage_staff_cannot_probe_addresses(): void
    {
        $this->actingAs($this->staff)->getJson('/api/v1/app/staff/email-available?email=a@b.co')->assertForbidden();
    }
}
