<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** A service line is owned through its sale/return, not its own claimed store_id. Rules: laravel-server/AGENTS.md, "Service POS & Sync Engine Scoping". */
class SyncPushServiceLineParentScopeTest extends SyncPushTwoTenantTestCase
{
    private function seedReturn(string $storeId, string $saleId, string $userId): string
    {
        $id = (string) Str::uuid();
        DB::table('returns')->insert([
            'id' => $id, 'store_id' => $storeId, 'sale_id' => $saleId, 'user_id' => $userId, 'total_refunded' => 100,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    public function test_a_sale_service_inserted_under_another_tenants_sale_is_refused(): void
    {
        $victimSale = $this->seedSale($this->victimStore, $this->victimOwner);
        $line = (string) Str::uuid();

        $response = $this->pushUpdate($this->attackerOwner, 'sale_services', $line, [
            'sale_id' => $victimSale, 'store_id' => $this->attackerStore->id, 'service_name' => 'Consultation',
            'quantity' => 1, 'unit_price' => 100, 'total_price' => 100, 'created_at' => now()->toDateTimeString(),
        ], 'INSERT');

        $this->assertRefusedAsForbidden($response, 'sale_services', $line);
        $this->assertFalse(DB::table('sale_services')->where('id', $line)->exists());
    }

    public function test_a_return_service_inserted_under_another_tenants_return_is_refused(): void
    {
        $victimReturn = $this->seedReturn($this->victimStore->id, $this->seedSale($this->victimStore, $this->victimOwner), $this->victimOwner->id);
        $line = (string) Str::uuid();

        $response = $this->pushUpdate($this->attackerOwner, 'return_services', $line, [
            'return_id' => $victimReturn, 'store_id' => $this->attackerStore->id,
            'quantity' => 1, 'refund_amount' => 100, 'created_at' => now()->toDateTimeString(),
        ], 'INSERT');

        $this->assertRefusedAsForbidden($response, 'return_services', $line);
        $this->assertFalse(DB::table('return_services')->where('id', $line)->exists());
    }

    public function test_a_sale_service_inserted_under_the_tenants_own_sale_is_accepted(): void
    {
        $ownSale = $this->seedSale($this->attackerStore, $this->attackerOwner);
        $line = (string) Str::uuid();

        $response = $this->pushUpdate($this->attackerOwner, 'sale_services', $line, [
            'sale_id' => $ownSale, 'store_id' => $this->attackerStore->id, 'service_name' => 'Consultation',
            'quantity' => 1, 'unit_price' => 100, 'total_price' => 100, 'created_at' => now()->toDateTimeString(),
        ], 'INSERT');

        $response->assertStatus(200);
        $this->assertSame([], $response->json('failed') ?? []);
        $this->assertSame($ownSale, DB::table('sale_services')->where('id', $line)->value('sale_id'));
    }
}
