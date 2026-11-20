<?php

namespace Tests\Feature;

use App\Models\PermissionGroup;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** A-421: a stock_batches UPDATE may only change a batch's cost, expiry, lot or manufacture
 * date for a session that holds the matching right; quantity-only UPDATEs stay open to every till. */
class StockBatchWritePermissionTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private const BATCH_ID = 'batch-a421';

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

        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A421',
            'email' => 'owner-a421-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $owner->id, 'name' => 'Store A421', 'email' => 'store-a421-'.uniqid().'@dumosrx.com',
            'phone' => '1234567890', 'address' => '123 Test St', 'store_slug' => 'store-a421-'.uniqid(),
            'device_id' => 'WEB-A421-'.uniqid(),
        ]);
        $owner->update(['store_id' => $this->store->id]);

        DB::table('products')->insert([
            'id' => 'prod-a421', 'user_id' => $owner->id, 'store_id' => $this->store->id, 'name' => 'Amoxil',
            '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('stock_batches')->insert([
            'id' => self::BATCH_ID, 'user_id' => $owner->id, 'product_id' => 'prod-a421', 'quantity' => 20,
            'cost_price' => 1200, 'batch_number' => 'LOT-7', 'expiry_date' => '2027-03-01', 'manufacture_date' => '2026-01-15',
            '_version' => 2, 'created_at' => now()->subDay(), 'updated_at' => now()->subDay(),
        ]);
    }

    private function staff(string $role, array $permissions): User
    {
        $group = PermissionGroup::create([
            'store_id' => $this->store->id, 'name' => 'G '.uniqid(), 'based_on_role' => $role,
            'is_default' => false, 'permissions' => $permissions,
        ]);

        return User::create([
            'first_name' => 'Staff', 'last_name' => 'A421',
            'email' => 'staff-a421-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => $role, 'store_id' => $this->store->id, 'permission_group_id' => $group->id,
        ]);
    }

    private function push(User $user, array $fields)
    {
        return $this->actingAs($user)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'stock_batches', 'operation' => 'UPDATE', 'record_id' => self::BATCH_ID,
                'payload' => array_merge(['id' => self::BATCH_ID, '_version' => (int) $this->batch()->_version, '_synced' => 0, 'updated_at' => now()->toDateTimeString()], $fields),
            ]],
        ]);
    }

    private function batch(): object
    {
        return DB::table('stock_batches')->where('id', self::BATCH_ID)->first();
    }

    public function test_a_session_without_batch_rights_cannot_rewrite_a_cost_and_is_told_so_terminally(): void
    {
        $cashier = $this->staff('sales_staff', ['process_sales']);

        $response = $this->push($cashier, ['cost_price' => 1]);

        $response->assertStatus(200);
        $this->assertSame('permission_denied', $response->json('failed.0.reason'));
        $this->assertEquals('1200.00', $this->batch()->cost_price);
        $this->assertEquals(2, $this->batch()->_version);
    }

    public function test_a_session_without_batch_rights_cannot_change_expiry_lot_or_manufacture_date(): void
    {
        $cashier = $this->staff('sales_staff', ['process_sales']);

        foreach ([['expiry_date' => '2030-01-01'], ['batch_number' => 'HIJACK'], ['manufacture_date' => '2025-01-01']] as $fields) {
            $response = $this->push($cashier, $fields);
            $this->assertSame('permission_denied', $response->json('failed.0.reason'), json_encode($fields));
        }

        $row = $this->batch();
        $this->assertSame('LOT-7', $row->batch_number);
        $this->assertSame('2027-03-01', substr((string) $row->expiry_date, 0, 10));
        $this->assertSame('2026-01-15', substr((string) $row->manufacture_date, 0, 10));
    }

    public function test_every_till_may_still_push_a_quantity_only_update_and_an_unchanged_full_row(): void
    {
        $cashier = $this->staff('sales_staff', ['process_sales']);

        $response = $this->push($cashier, ['quantity' => 18]);
        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $unchangedFullRow = $this->push($cashier, [
            'quantity' => 17, 'cost_price' => 1200, 'batch_number' => ' LOT-7 ', 'expiry_date' => '2027-03-01T00:00:00.000Z', 'manufacture_date' => '2026-01-15',
        ]);
        $unchangedFullRow->assertJsonCount(0, 'failed');
    }

    public function test_edit_batch_details_covers_cost_expiry_lot_and_manufacture_date(): void
    {
        $editor = $this->staff('specialist', ['edit_batch_details']);

        $response = $this->push($editor, ['cost_price' => 1100, 'expiry_date' => '2027-06-30', 'batch_number' => 'LOT-8', 'manufacture_date' => '2026-02-01']);

        $response->assertJsonCount(0, 'failed');
        $row = $this->batch();
        $this->assertEquals('1100.00', $row->cost_price);
        $this->assertSame('LOT-8', $row->batch_number);
        $this->assertSame('2027-06-30', substr((string) $row->expiry_date, 0, 10));
    }

    public function test_the_stock_audit_and_import_rights_still_change_a_cost_but_not_the_details(): void
    {
        foreach (['edit_product_cost', 'manage_products'] as $permission) {
            $user = $this->staff('specialist', [$permission]);

            $this->push($user, ['cost_price' => 1111])->assertJsonCount(0, 'failed');
            $this->assertEquals('1111.00', $this->batch()->cost_price);

            $this->assertSame('permission_denied', $this->push($user, ['expiry_date' => '2031-01-01'])->json('failed.0.reason'));
        }
    }

    public function test_the_store_owner_and_admin_are_unrestricted(): void
    {
        $owner = User::where('role', 'store_owner')->first();

        $this->push($owner, ['cost_price' => 900, 'expiry_date' => '2028-01-01'])->assertJsonCount(0, 'failed');

        $this->assertEquals('900.00', $this->batch()->cost_price);
    }

    public function test_a_session_that_cannot_edit_batches_cannot_reach_another_stores_batch_either(): void
    {
        $other = User::create([
            'first_name' => 'Other', 'last_name' => 'Store',
            'email' => 'other-a421-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'sales_staff',
        ]);

        $response = $this->push($other, ['cost_price' => 1]);

        $response->assertStatus(200);
        $this->assertNotEmpty($response->json('failed'));
        $this->assertEquals('1200.00', $this->batch()->cost_price);
    }
}
