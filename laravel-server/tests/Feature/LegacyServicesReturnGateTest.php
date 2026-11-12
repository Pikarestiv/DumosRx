<?php

namespace Tests\Feature;

use App\Models\Sale;
use App\Models\SaleService;
use App\Models\Service;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class LegacyServicesReturnGateTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1, 'staff' => -1]]],
        ]);
        $this->withoutMiddleware();
        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Legacy',
            'email' => 'owner-gate-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Service Gate Store',
            'email' => 'store-gate-'.uniqid().'@dumosrx.com',
            'phone' => '1234567890',
            'address' => '1 Gate St',
            'store_slug' => 'store-gate-'.uniqid(),
            'device_id' => 'WEB-GATE-'.uniqid(),
        ]);
        $this->owner->update(['store_id' => $this->store->id]);
    }

    public function test_pushing_refunded_status_on_sale_with_unrefunded_services_clamps_to_partially_refunded(): void
    {
        $sale = Sale::create([
            'store_id' => $this->store->id,
            'cashier_id' => $this->owner->id,
            'transaction_number' => 'TXN-SERVICE-001',
            'total_amount' => 33000,
            'amount_paid' => 33000,
            'payment_status' => 'completed',
            'payment_method' => 'cash',
            'transaction_date' => now()->toIso8601String(),
        ]);
        $saleId = $sale->id;

        $serviceId = (string) Str::uuid();
        Service::create([
            'id' => $serviceId,
            'store_id' => $this->store->id,
            'name' => 'Facial Treatment',
            'price' => 25000,
            'is_active' => true,
        ]);

        $saleServiceId = (string) Str::uuid();
        SaleService::create([
            'id' => $saleServiceId,
            'sale_id' => $saleId,
            'service_id' => $serviceId,
            'service_name' => 'Facial Treatment',
            'quantity' => 1,
            'unit_price' => 25000,
            'total_price' => 25000,
        ]);

        // Push an update to sales attempting to mark it fully refunded (as an older client would)
        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'changes' => [
                [
                    'table_name' => 'sales',
                    'operation' => 'UPDATE',
                    'record_id' => $saleId,
                    'payload' => [
                        'id' => $saleId,
                        'payment_status' => 'refunded',
                    ],
                ],
            ],
        ], [
            'X-Store-Id' => $this->store->id,
            'X-Device-Id' => 'POS-TERMINAL-OLD',
            'X-App-Version' => '0.0.41',
        ]);

        $response->assertStatus(200);

        $sale = Sale::find($saleId);
        $this->assertSame('partially_refunded', $sale->payment_status);
    }

    public function test_pushing_refunded_status_with_return_services_allows_full_refund(): void
    {
        $sale = Sale::create([
            'store_id' => $this->store->id,
            'cashier_id' => $this->owner->id,
            'transaction_number' => 'TXN-SERVICE-002',
            'total_amount' => 25000,
            'amount_paid' => 25000,
            'payment_status' => 'completed',
            'payment_method' => 'cash',
            'transaction_date' => now()->toIso8601String(),
        ]);
        $saleId = $sale->id;

        $serviceId = (string) Str::uuid();
        Service::create([
            'id' => $serviceId,
            'store_id' => $this->store->id,
            'name' => 'Body Massage',
            'price' => 25000,
            'is_active' => true,
        ]);

        $saleServiceId = (string) Str::uuid();
        SaleService::create([
            'id' => $saleServiceId,
            'sale_id' => $saleId,
            'service_id' => $serviceId,
            'service_name' => 'Body Massage',
            'quantity' => 1,
            'unit_price' => 25000,
            'total_price' => 25000,
        ]);

        $returnId = (string) Str::uuid();
        $returnServiceId = (string) Str::uuid();

        // Push return_services and sale update together (as a new v0.0.42 client would)
        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'changes' => [
                [
                    'table_name' => 'returns',
                    'operation' => 'INSERT',
                    'record_id' => $returnId,
                    'payload' => [
                        'id' => $returnId,
                        'store_id' => $this->store->id,
                        'sale_id' => $saleId,
                        'total_amount' => 25000,
                        'reason' => 'Customer unsatisfied',
                    ],
                ],
                [
                    'table_name' => 'return_services',
                    'operation' => 'INSERT',
                    'record_id' => $returnServiceId,
                    'payload' => [
                        'id' => $returnServiceId,
                        'return_id' => $returnId,
                        'sale_service_id' => $saleServiceId,
                        'quantity' => 1,
                        'refund_amount' => 25000,
                    ],
                ],
                [
                    'table_name' => 'sales',
                    'operation' => 'UPDATE',
                    'record_id' => $saleId,
                    'payload' => [
                        'id' => $saleId,
                        'payment_status' => 'refunded',
                    ],
                ],
            ],
        ], [
            'X-Store-Id' => $this->store->id,
            'X-Device-Id' => 'POS-TERMINAL-NEW',
            'X-App-Version' => '0.0.42',
        ]);

        $response->assertStatus(200);

        $sale = Sale::find($saleId);
        $this->assertSame('refunded', $sale->payment_status);
    }
}
