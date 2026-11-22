<?php

namespace Tests\Feature\Concerns;

use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Facades\DB;

trait PurchaseOrderLockFixture
{
    protected User $owner;

    protected Store $store;

    protected function setUpLockFixture(): void
    {

        $this->owner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Main Branch',
            'email' => 'main@dumosrx.com',
            'phone' => '1111111111',
            'address' => '1 Main St',
            'slug' => 'main-branch',
            'device_id' => 'WEB-MAIN',
        ]);
        $this->owner->update(['store_id' => $this->store->id]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        DB::table('products')->insert([
            'id' => 'prod-1',
            'store_id' => $this->store->id,
            'user_id' => $this->owner->id,
            'name' => 'Zyrtec',
            'selling_price' => 150,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('purchase_orders')->insert([
            'id' => 'po-1',
            'store_id' => $this->store->id,
            'order_number' => 'PO-0001',
            'supplier_id' => null,
            'ordered_by' => $this->owner->id,
            'status' => 'pending',
            'total_amount' => 100000,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('purchase_order_items')->insert([
            'id' => 'poi-1',
            'purchase_order_id' => 'po-1',
            'product_id' => 'prod-1',
            'quantity_ordered' => 1000,
            'quantity_received' => 0,
            'unit_cost' => 100,
            'total_cost' => 100000,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    protected function lockBy(?string $deviceId, $at = null): void
    {
        DB::table('purchase_orders')->where('id', 'po-1')->update([
            'editing_device_id' => $deviceId,
            'editing_user_id' => $deviceId ? $this->owner->id : null,
            'editing_at' => $deviceId ? ($at ?? now())->utc()->format('Y-m-d\TH:i:s.v\Z') : null,
            'updated_at' => $at ?? now(),
        ]);
    }

    protected function pushFrom(?string $deviceId, array $changes)
    {
        $headers = $deviceId ? ['X-Device-Id' => $deviceId] : [];

        return $this->actingAs($this->owner)->withHeaders($headers)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => $changes,
        ]);
    }

    protected function lineEdit(int $quantity): array
    {
        return [[
            'id' => 1,
            'table_name' => 'purchase_order_items',
            'operation' => 'UPDATE',
            'record_id' => 'poi-1',
            'payload' => ['id' => 'poi-1', 'bulk_quantity' => $quantity, 'units_per_bulk' => 10, 'unit_cost' => 100, '_version' => 1],
        ]];
    }

    protected function failedReasons($response): array
    {
        return collect($response->json('failed') ?? [])->pluck('reason')->all();
    }
}
