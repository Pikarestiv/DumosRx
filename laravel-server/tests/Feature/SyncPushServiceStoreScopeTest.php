<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** A `services` row is owned by its own store_id: backfilled on INSERT, and guarded on UPDATE/DELETE. */
class SyncPushServiceStoreScopeTest extends SyncPushTwoTenantTestCase
{
    private function seedService(string $storeId): string
    {
        $id = (string) Str::uuid();
        DB::table('services')->insert([
            'id' => $id, 'store_id' => $storeId, 'name' => 'Consultation', 'price' => 1500,
            '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    public function test_a_service_insert_without_store_id_is_backfilled_from_the_callers_store(): void
    {
        $id = (string) Str::uuid();

        $response = $this->pushUpdate($this->attackerOwner, 'services', $id, [
            'name' => 'Consultation', 'price' => 1500, 'is_active' => 1, 'created_at' => now()->toDateTimeString(),
        ], 'INSERT');

        $response->assertStatus(200);
        $this->assertSame([], $response->json('failed') ?? []);
        $this->assertSame($this->attackerStore->id, DB::table('services')->where('id', $id)->value('store_id'));
    }

    public function test_a_service_update_against_another_tenants_service_is_refused(): void
    {
        $victimService = $this->seedService($this->victimStore->id);

        $response = $this->pushUpdate($this->attackerOwner, 'services', $victimService, ['name' => 'Hijacked', 'price' => 1]);

        $this->assertRefusedAsForbidden($response, 'services', $victimService);
        $row = DB::table('services')->where('id', $victimService)->first();
        $this->assertSame('Consultation', $row->name);
        $this->assertSame($this->victimStore->id, $row->store_id);
    }

    public function test_a_service_delete_against_another_tenants_service_is_refused(): void
    {
        $victimService = $this->seedService($this->victimStore->id);

        $response = $this->pushUpdate($this->attackerOwner, 'services', $victimService, [], 'DELETE');

        $this->assertRefusedAsForbidden($response, 'services', $victimService);
        $this->assertNull(DB::table('services')->where('id', $victimService)->value('deleted_at'));
    }

    public function test_a_storeless_service_cannot_be_updated_or_deleted_by_any_tenant(): void
    {
        $orphan = $this->seedService($this->victimStore->id);
        DB::table('services')->where('id', $orphan)->update(['store_id' => null]);

        $update = $this->pushUpdate($this->attackerOwner, 'services', $orphan, ['name' => 'Hijacked']);
        $this->assertRefusedAsForbidden($update, 'services', $orphan);

        $delete = $this->pushUpdate($this->attackerOwner, 'services', $orphan, [], 'DELETE');
        $this->assertRefusedAsForbidden($delete, 'services', $orphan);

        $row = DB::table('services')->where('id', $orphan)->first();
        $this->assertSame('Consultation', $row->name);
        $this->assertNull($row->deleted_at);
    }

    public function test_a_service_update_against_the_tenants_own_service_is_accepted(): void
    {
        $ownService = $this->seedService($this->attackerStore->id);

        $response = $this->pushUpdate($this->attackerOwner, 'services', $ownService, ['name' => 'Renamed', 'price' => 2000, '_version' => 2]);

        $response->assertStatus(200);
        $this->assertSame([], $response->json('failed') ?? []);
        $this->assertSame('Renamed', DB::table('services')->where('id', $ownService)->value('name'));
    }
}
