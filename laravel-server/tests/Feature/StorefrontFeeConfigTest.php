<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StorefrontFeeConfigTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_can_set_the_platform_fee_percentage()
    {
        $admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super-admin@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $response = $this->actingAs($admin)
            ->putJson('/api/v1/admin/system-configs/storefront_platform_fee_percentage', ['value' => 3.5]);

        $response->assertStatus(200);
        $this->assertEquals(3.5, SystemConfig::getVal('storefront_platform_fee_percentage'));
    }

    public function test_setting_the_fee_rejects_a_value_outside_zero_to_fifty()
    {
        $admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin2',
            'email' => 'super-admin-2@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $response = $this->actingAs($admin)
            ->putJson('/api/v1/admin/system-configs/storefront_platform_fee_percentage', ['value' => 75]);

        $response->assertStatus(422);
    }

    public function test_changing_the_fee_marks_every_subaccount_having_store_dirty()
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Fee',
            'email' => 'fee-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $withSubaccount = Store::create([
            'user_id' => $owner->id, 'name' => 'Has Subaccount',
            'store_slug' => 'has-subaccount', 'device_id' => 'WEB-FEE-1',
            'paystack_subaccount_code' => 'ACCT_1',
        ]);
        $withoutSubaccount = Store::create([
            'user_id' => $owner->id, 'name' => 'No Subaccount',
            'store_slug' => 'no-subaccount', 'device_id' => 'WEB-FEE-2',
        ]);

        $admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin3',
            'email' => 'super-admin-3@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->actingAs($admin)
            ->putJson('/api/v1/admin/system-configs/storefront_platform_fee_percentage', ['value' => 4]);

        $this->assertNotNull($withSubaccount->refresh()->paystack_fee_dirty_at);
        $this->assertNull($withoutSubaccount->refresh()->paystack_fee_dirty_at);
    }

    public function test_updating_an_unrelated_config_key_does_not_dirty_any_store()
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Unrelated',
            'email' => 'unrelated-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $store = Store::create([
            'user_id' => $owner->id, 'name' => 'Unrelated Store',
            'store_slug' => 'unrelated-store', 'device_id' => 'WEB-UNRELATED',
            'paystack_subaccount_code' => 'ACCT_2',
        ]);

        $admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin4',
            'email' => 'super-admin-4@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->actingAs($admin)
            ->putJson('/api/v1/admin/system-configs/social_links', ['value' => ['twitter' => 'https://x.com/dumosrx']]);

        $this->assertNull($store->refresh()->paystack_fee_dirty_at);
    }
}
