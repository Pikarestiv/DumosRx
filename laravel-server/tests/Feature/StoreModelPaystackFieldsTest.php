<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StoreModelPaystackFieldsTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_persists_paystack_subaccount_fields()
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Paystack',
            'email' => 'paystack-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Paystack Test Store',
            'store_slug' => 'paystack-test-store',
            'device_id' => 'WEB-PAYSTACK-TEST',
            'paystack_subaccount_code' => 'ACCT_test123',
            'paystack_subaccount_country' => 'nigeria',
            'paystack_bank_code' => '044',
            'paystack_account_number_last4' => '1234',
        ]);

        $store->refresh();

        $this->assertSame('ACCT_test123', $store->paystack_subaccount_code);
        $this->assertSame('nigeria', $store->paystack_subaccount_country);
        $this->assertSame('044', $store->paystack_bank_code);
        $this->assertSame('1234', $store->paystack_account_number_last4);
        $this->assertNull($store->paystack_fee_dirty_at);
    }

    public function test_paystack_fee_dirty_at_is_not_mass_assignable()
    {
        // Mirrors storefront_dirty_at's existing convention: server-only
        // bookkeeping, never accepted from a client sync payload.
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Dirty',
            'email' => 'dirty-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Dirty Flag Store',
            'store_slug' => 'dirty-flag-store',
            'device_id' => 'WEB-DIRTY-TEST',
            'paystack_fee_dirty_at' => now(),
        ]);

        $this->assertNull($store->paystack_fee_dirty_at);
    }
}
