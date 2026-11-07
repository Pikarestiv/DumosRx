<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SaleWithoutStockVersionGateTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Schema::disableForeignKeyConstraints();
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]],
        ]);
        $this->withoutMiddleware();
        Schema::enableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Yard',
            'email' => 'owner-yard-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create(['user_id' => $this->owner->id, 'name' => 'Yard Store', 'device_id' => 'WEB-YARD']);
    }

    private function pushToggle(bool $on, ?string $appVersion)
    {
        $request = $this->actingAs($this->owner);
        if ($appVersion !== null) {
            $request = $request->withHeader('X-App-Version', $appVersion);
        }

        return $request->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'stores', 'operation' => 'UPDATE', 'record_id' => $this->store->id,
                'payload' => ['id' => $this->store->id, '_version' => $this->store->fresh()->_version ?? 1, 'name' => 'Renamed', 'allow_sale_without_stock' => $on ? 1 : 0],
            ]],
        ]);
    }

    public function test_the_column_exists_and_defaults_off()
    {
        $this->assertTrue(Schema::hasColumn('stores', 'allow_sale_without_stock'));
        $this->assertFalse($this->store->fresh()->allow_sale_without_stock);
    }

    public function test_a_current_bundle_can_turn_it_on_and_off()
    {
        $this->pushToggle(true, '0.0.41')->assertOk();
        $this->assertTrue($this->store->fresh()->allow_sale_without_stock);

        $this->pushToggle(false, '0.0.41')->assertOk();
        $this->assertFalse($this->store->fresh()->allow_sale_without_stock);
    }

    public function test_an_old_or_unversioned_bundle_cannot_turn_it_on_but_the_rest_of_the_row_applies()
    {
        foreach (['0.0.40', null] as $version) {
            $this->pushToggle(true, $version)->assertOk();
            $store = $this->store->fresh();
            $this->assertFalse($store->allow_sale_without_stock);
            $this->assertSame('Renamed', $store->name);
        }
    }

    public function test_an_old_bundle_can_still_turn_it_off()
    {
        $this->store->forceFill(['allow_sale_without_stock' => true])->save();

        $this->pushToggle(false, '0.0.40')->assertOk();
        $this->assertFalse($this->store->fresh()->allow_sale_without_stock);
    }
}
