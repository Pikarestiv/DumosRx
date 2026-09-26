<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for the stores.paystack_* sync-push guard. push() applies a
 * stores payload with forceFill(), which bypasses $fillable entirely, and
 * authorizeChangeTarget() admits any caller whose allowed stores include the
 * row - staff included. Without the strip, a staff device could push its own
 * paystack_subaccount_code onto its employer's store row and silently
 * redirect every future storefront settlement. See laravel-server/AGENTS.md.
 */
class SyncStoresPaystackFieldGuardTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected User $staff;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'paystack-guard-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Guarded Store',
            'device_id' => 'WEB-GUARD',
        ]);

        $this->store->forceFill([
            'paystack_subaccount_code' => 'ACCT_owner_real',
            'paystack_subaccount_country' => 'nigeria',
            'paystack_bank_code' => '058',
            'paystack_account_number_last4' => '1234',
        ])->save();

        $this->staff = User::create([
            'first_name' => 'Sales',
            'last_name' => 'Staff',
            'email' => 'paystack-guard-staff@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store->id,
        ]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function pushStoreChange(User $as, array $payload): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'stores',
                    'operation' => 'UPDATE',
                    'record_id' => $this->store->id,
                    'payload' => array_merge([
                        'id' => $this->store->id,
                        '_version' => 1,
                    ], $payload),
                ],
            ],
        ]);
    }

    public function test_a_staff_push_cannot_redirect_the_stores_paystack_subaccount()
    {
        $response = $this->pushStoreChange($this->staff, [
            'name' => 'Renamed By Staff',
            'paystack_subaccount_code' => 'ACCT_attacker',
            'paystack_subaccount_country' => 'ghana',
            'paystack_bank_code' => '999',
            'paystack_account_number_last4' => '9999',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);

        $this->store->refresh();
        $this->assertSame('Renamed By Staff', $this->store->name);
        $this->assertSame('ACCT_owner_real', $this->store->paystack_subaccount_code);
        $this->assertSame('nigeria', $this->store->paystack_subaccount_country);
        $this->assertSame('058', $this->store->paystack_bank_code);
        $this->assertSame('1234', $this->store->paystack_account_number_last4);
    }

    public function test_the_owners_own_push_cannot_set_the_paystack_fields_either()
    {
        $response = $this->pushStoreChange($this->owner, [
            'paystack_subaccount_code' => 'ACCT_from_owner_device',
        ]);

        $response->assertStatus(200);

        $this->store->refresh();
        $this->assertSame('ACCT_owner_real', $this->store->paystack_subaccount_code);
    }

    public function test_a_push_cannot_clear_the_fee_dirty_flag()
    {
        \Illuminate\Support\Facades\DB::table('stores')
            ->where('id', $this->store->id)
            ->update(['paystack_fee_dirty_at' => now()]);

        $this->pushStoreChange($this->staff, [
            'paystack_fee_dirty_at' => null,
        ])->assertStatus(200);

        $this->store->refresh();
        $this->assertNotNull($this->store->paystack_fee_dirty_at);
    }
}
