<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The push endpoint's intake for the per-table agreement fingerprint. A
 * bundle that never sends one must stay silent rather than be recorded as
 * agreeing — see docs/DEVICE_TABLE_AGREEMENT.md, "What an old bundle does".
 */
class SyncTableFingerprintIngestTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Till',
            'last_name' => 'Owner',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Main Store',
            'device_id' => 'DRX-LAPTOP',
            'currency' => 'NGN',
        ]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => [
                'features' => ['cloud_sync' => true],
                'limits' => ['stores' => -1],
            ]],
        ]);

        $this->withoutMiddleware();
    }

    private function push(array $body)
    {
        return $this->actingAs($this->owner)
            ->withHeader('X-Device-Id', 'DRX-TILL-1')
            ->postJson('/api/v1/app/sync/push', $body + ['setup' => true, 'changes' => []]);
    }

    public function test_a_reported_table_fingerprint_is_recorded_against_the_device(): void
    {
        DB::table('products')->insert([
            'id' => 'prod-1',
            'name' => 'Paracetamol',
            'store_id' => $this->store->id,
            'selling_price' => 500,
            '_version' => 4,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->push([
            'table_fingerprint' => ['tables' => [
                ['t' => 'products', 'r' => 1, 'v' => 4, 'p' => 0],
            ]],
        ])->assertStatus(200);

        $row = DB::table('device_table_reports')
            ->where('store_id', $this->store->id)
            ->where('device_id', 'DRX-TILL-1')
            ->first();

        $this->assertNotNull($row);
        $this->assertSame(0, (int) $row->diverged_count);
        // The verdict is stored, not recomputed on read: it depends on the
        // previous reading, so recomputing would undo the promotion rule.
        $this->assertSame(
            [['table' => 'products', 'device_rows' => 1, 'device_version_sum' => 4,
                'device_pending' => 0, 'server_rows' => 1, 'server_version_sum' => 4,
                'row_delta' => 0, 'version_delta' => 0, 'verdict' => 'agrees']],
            json_decode($row->tables, true),
        );
    }

    public function test_an_old_bundle_sending_no_fingerprint_records_nothing(): void
    {
        $this->push([
            'stock_fingerprint' => ['batch_count' => 0, 'quantity_sum' => 0],
        ])->assertStatus(200);

        $this->assertSame(0, DB::table('device_table_reports')->count());
        $this->assertFalse(
            app(\App\Services\Admin\TableAgreementService::class)
                ->forStore($this->store->id)['measured'],
        );
    }

    public function test_a_malformed_fingerprint_does_not_fail_the_push(): void
    {
        $this->push(['table_fingerprint' => 'nonsense'])->assertStatus(200);
        $this->push(['table_fingerprint' => ['tables' => 'nonsense']])->assertStatus(200);

        $this->assertSame(0, DB::table('device_table_reports')->where('diverged_count', '>', 0)->count());
    }
}
