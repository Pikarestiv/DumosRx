<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class SyncSubaccountFeeRatesTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        config(['payment.paystack.secret_key' => 'sk_test_fake']);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Sync',
            'email' => 'sync-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
    }

    private function makeDirtyStore(string $slug, string $subaccountCode): Store
    {
        $store = Store::create([
            'user_id' => $this->owner->id, 'name' => "Store {$slug}",
            'store_slug' => $slug, 'device_id' => "WEB-{$slug}",
            'paystack_subaccount_code' => $subaccountCode,
        ]);

        // paystack_fee_dirty_at is intentionally not mass-assignable (same
        // reasoning as storefront_dirty_at) - stamp it the way
        // SystemConfigController does, via a raw update.
        DB::table('stores')->where('id', $store->id)->update(['paystack_fee_dirty_at' => now()]);

        return $store->refresh();
    }

    public function test_a_dirty_store_gets_its_fee_updated_and_flag_cleared()
    {
        Http::fake(['api.paystack.co/subaccount/*' => Http::response(['status' => true], 200)]);
        \App\Models\SystemConfig::setVal('storefront_platform_fee_percentage', 3.0);
        $store = $this->makeDirtyStore('sync-a', 'ACCT_a');

        $this->artisan('storefront:sync-subaccount-fees')->assertExitCode(0);

        $this->assertNull($store->refresh()->paystack_fee_dirty_at);
        Http::assertSent(fn ($request) => $request['percentage_charge'] === 3.0);
    }

    public function test_a_failure_on_one_store_does_not_abort_the_batch_or_affect_other_stores()
    {
        \App\Models\SystemConfig::setVal('storefront_platform_fee_percentage', 3.0);
        $failing = $this->makeDirtyStore('sync-fail', 'ACCT_fail');
        $succeeding = $this->makeDirtyStore('sync-ok', 'ACCT_ok');

        Http::fake([
            'api.paystack.co/subaccount/ACCT_fail' => Http::response(['message' => 'Subaccount not found'], 404),
            'api.paystack.co/subaccount/ACCT_ok' => Http::response(['status' => true], 200),
        ]);

        $this->artisan('storefront:sync-subaccount-fees')->assertExitCode(0);

        $this->assertNotNull($failing->refresh()->paystack_fee_dirty_at, 'Failed store should remain dirty for retry.');
        $this->assertNull($succeeding->refresh()->paystack_fee_dirty_at, 'A sibling failure must not block a working store.');
    }

    public function test_a_store_with_no_subaccount_is_never_touched()
    {
        \App\Models\SystemConfig::setVal('storefront_platform_fee_percentage', 3.0);
        $store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'No Subaccount',
            'store_slug' => 'sync-none', 'device_id' => 'WEB-SYNC-NONE',
        ]);

        Http::fake();

        $this->artisan('storefront:sync-subaccount-fees')->assertExitCode(0);

        Http::assertNothingSent();
    }
}
