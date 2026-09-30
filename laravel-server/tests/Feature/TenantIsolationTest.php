<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the tenant-scoping fixes to the staff endpoints:
 * a store owner must not be able to read, rewrite or reassign another
 * tenant's staff rows, or grant a role above their own privilege.
 *
 * This file also covered Category/Supplier/Product/Customer through the
 * /app CRUD endpoints; those cases were removed with the endpoints
 * themselves (A-19, docs/FIXED_BUGS.md). The trait they exercised,
 * ScopesToTenant, is still pinned by TenantScopingArchitectureTest and by
 * the sync engine's own tenant-scope tests.
 */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    protected User $ownerA;
    protected User $staffA;
    protected User $ownerB;
    protected Store $storeA;

    protected function setUp(): void
    {
        parent::setUp();

        // Needed for the role-privilege-ceiling test below, which compares
        // real Role->permissions rows (empty tables would make every role
        // vacuously "at or below" any other).
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->ownerA = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'ownerA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->storeA = Store::create([
            'user_id' => $this->ownerA->id,
            'name' => 'Store A',
            'store_slug' => 'store-a',
            'device_id' => 'WEB-A',
        ]);

        $this->staffA = User::create([
            'first_name' => 'Staff', 'last_name' => 'A',
            'email' => 'staffA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->storeA->id,
        ]);

        $this->ownerB = User::create([
            'first_name' => 'Owner', 'last_name' => 'B',
            'email' => 'ownerB@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Store::create([
            'user_id' => $this->ownerB->id,
            'name' => 'Store B',
            'store_slug' => 'store-b',
            'device_id' => 'WEB-B',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    // ---- Staff ----

    public function test_staff_update_404s_for_another_tenants_staff_member()
    {
        $foreignStaff = User::create([
            'first_name' => 'Staff', 'last_name' => 'B',
            'email' => 'staffB@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => Store::where('user_id', $this->ownerB->id)->value('id'),
        ]);

        $response = $this->actingAs($this->ownerA)
            ->putJson("/api/v1/staff/{$foreignStaff->id}", ['first_name' => 'Hijacked']);

        $response->assertStatus(404);
        $this->assertDatabaseHas('users', ['id' => $foreignStaff->id, 'first_name' => 'Staff']);
    }

    public function test_staff_destroy_404s_for_another_tenants_staff_member()
    {
        $foreignStaff = User::create([
            'first_name' => 'Staff', 'last_name' => 'B',
            'email' => 'staffB2@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => Store::where('user_id', $this->ownerB->id)->value('id'),
        ]);

        $response = $this->actingAs($this->ownerA)
            ->deleteJson("/api/v1/staff/{$foreignStaff->id}");

        $response->assertStatus(404);
        $this->assertDatabaseHas('users', ['id' => $foreignStaff->id, 'is_active' => true]);
    }

    public function test_staff_store_rejects_another_tenants_store_id()
    {
        $foreignStoreId = Store::where('user_id', $this->ownerB->id)->value('id');

        $response = $this->actingAs($this->ownerA)
            ->postJson('/api/v1/staff', [
                'first_name' => 'New',
                'last_name' => 'Hire',
                'username' => 'newhire',
                'role' => 'sales_staff',
                'store_id' => $foreignStoreId,
            ]);

        $response->assertStatus(422);
        $this->assertDatabaseMissing('users', ['username' => 'newhire']);
    }

    public function test_staff_update_rejects_reassigning_store_id_to_another_tenant()
    {
        $foreignStoreId = Store::where('user_id', $this->ownerB->id)->value('id');

        // staffA already belongs to Store A, so it's visible to ownerA
        // (unlike the 404 tests above, which cover an entirely invisible
        // row) — the bug was specifically that a caller could re-parent a
        // row they can already see into a store they don't own.
        $response = $this->actingAs($this->ownerA)
            ->putJson("/api/v1/staff/{$this->staffA->id}", [
                'store_id' => $foreignStoreId,
            ]);

        $response->assertStatus(422);
        $this->assertDatabaseHas('users', [
            'id' => $this->staffA->id,
            'store_id' => $this->storeA->id,
        ]);
    }

    public function test_staff_update_allows_keeping_own_store_id()
    {
        // Sanity check for the fix above: re-submitting the SAME store_id
        // (the normal "edit some other field" case) must still succeed.
        $response = $this->actingAs($this->ownerA)
            ->putJson("/api/v1/staff/{$this->staffA->id}", [
                'first_name' => 'Updated',
                'store_id' => $this->storeA->id,
            ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('users', [
            'id' => $this->staffA->id,
            'first_name' => 'Updated',
            'store_id' => $this->storeA->id,
        ]);
    }

    public function test_staff_update_rejects_role_grant_above_callers_own_privilege()
    {
        // Give staffA a role with strictly fewer permissions than the
        // caller (managerA), so a granted-role check has something real to
        // reject. auditor only has view_reports/view_own_sales per the
        // seeder, well below manager's full staff permission set.
        $managerA = User::create([
            'first_name' => 'Manager', 'last_name' => 'A',
            'email' => 'managerA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'auditor', 'store_id' => $this->storeA->id,
        ]);

        $response = $this->actingAs($managerA)
            ->putJson("/api/v1/staff/{$this->staffA->id}", [
                'role' => 'manager',
            ]);

        $response->assertStatus(422);
        $this->assertDatabaseHas('users', ['id' => $this->staffA->id, 'role' => 'sales_staff']);
    }

    /**
     * update()'s privilege-ceiling check (see above) was fixed alongside
     * the store_id-reassignment IDOR, but an independent review pass
     * caught that store() (creation) was left as the unfixed sibling of
     * the same asymmetry — the exact "fix on one endpoint, not mirrored to
     * a structurally identical sibling" pattern this whole review area is
     * about. This is create's equivalent of
     * test_staff_update_rejects_role_grant_above_callers_own_privilege.
     */
    public function test_staff_store_rejects_role_grant_above_callers_own_privilege()
    {
        $auditorA = User::create([
            'first_name' => 'Auditor', 'last_name' => 'A',
            'email' => 'auditorA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'auditor', 'store_id' => $this->storeA->id,
        ]);

        $response = $this->actingAs($auditorA)
            ->postJson('/api/v1/staff', [
                'first_name' => 'New',
                'last_name' => 'Hire',
                'username' => 'privesc',
                'role' => 'manager',
                'store_id' => $this->storeA->id,
            ]);

        $response->assertStatus(422);
        $this->assertDatabaseMissing('users', ['username' => 'privesc']);
    }

    /**
     * Regression coverage for a gap found in EnforcesStaffOwnership's
     * null-store_id handling (docs/KNOWN_BUGS.md L7): the early `return
     * true` for a null $storeId exists so editing the owner's own
     * null-store_id "Main Account" row keeps working, but applied
     * unconditionally it also let a caller null out an actual STAFF row's
     * store_id, silently orphaning it from every tenant-scoped query. Only
     * a genuine no-op (the row's own store_id is ALSO already null) should
     * be allowed through.
     */
    public function test_staff_update_rejects_nulling_an_existing_staff_rows_store_id()
    {
        $response = $this->actingAs($this->ownerA)
            ->putJson("/api/v1/staff/{$this->staffA->id}", [
                'store_id' => null,
            ]);

        $response->assertStatus(422);
        $this->assertDatabaseHas('users', [
            'id' => $this->staffA->id,
            'store_id' => $this->storeA->id,
        ]);
    }

    public function test_staff_update_allows_resubmitting_owners_own_already_null_store_id()
    {
        // The owner's own row legitimately has a null store_id - this must
        // keep working (e.g. editing any other field on the "Main Account"
        // row, which resubmits store_id verbatim).
        $response = $this->actingAs($this->ownerA)
            ->putJson("/api/v1/staff/{$this->ownerA->id}", [
                'first_name' => 'Updated',
                'store_id' => null,
            ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('users', [
            'id' => $this->ownerA->id,
            'first_name' => 'Updated',
            'store_id' => null,
        ]);
    }

    // ---- Sync push: INSERT into a child table scoped through a parent FK ----

    /**
     * A-77: push()'s INSERT branch never called authorizeChangeTarget(), and
     * normalizePushPayload()'s store_id check only covers tables that carry
     * their own store_id column. The six child tables that derive their scope
     * through a parent FK were therefore unchecked on INSERT entirely, so a
     * product id harvested off the unauthenticated GET /storefront/{slug}
     * could be used to plant phantom stock in a stranger's tenant.
     */
    private function pushAs(User $as, array $change): \Illuminate\Testing\TestResponse
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        return $this->actingAs($as)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [$change],
        ]);
    }

    private function victimProductId(): string
    {
        \Illuminate\Support\Facades\DB::table('products')->insert([
            'id' => 'victim-product-a',
            'store_id' => $this->storeA->id,
            'user_id' => $this->ownerA->id,
            'name' => 'Victim Painkillers',
            'selling_price' => 500,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return 'victim-product-a';
    }

    public function test_sync_push_insert_of_a_stock_batch_under_another_tenants_product_is_rejected()
    {
        $productId = $this->victimProductId();

        $response = $this->pushAs($this->ownerB, [
            'table_name' => 'stock_batches',
            'operation' => 'INSERT',
            'record_id' => 'planted-batch-1',
            'payload' => [
                'id' => 'planted-batch-1',
                'product_id' => $productId,
                'batch_number' => 'PLANTED',
                'quantity' => 9999,
                'cost_price' => 1,
                '_version' => 1,
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'failed');
        $response->assertJsonPath('failed.0.reason', 'forbidden');
        $this->assertDatabaseMissing('stock_batches', ['id' => 'planted-batch-1']);
    }

    public function test_sync_push_insert_of_a_sale_item_under_another_tenants_sale_is_rejected()
    {
        \Illuminate\Support\Facades\DB::table('sales')->insert([
            'id' => 'victim-sale-a',
            'store_id' => $this->storeA->id,
            'cashier_id' => $this->ownerA->id,
            'transaction_number' => 'TXN-VICTIM-A',
            'payment_method' => 'cash',
            'total_amount' => 500,
            'amount_paid' => 500,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->pushAs($this->ownerB, [
            'table_name' => 'sale_items',
            'operation' => 'INSERT',
            'record_id' => 'planted-sale-item-1',
            'payload' => [
                'id' => 'planted-sale-item-1',
                'sale_id' => 'victim-sale-a',
                'product_id' => $this->victimProductId(),
                'quantity' => 1,
                'unit_price' => 1,
                '_version' => 1,
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('failed.0.reason', 'forbidden');
        $this->assertDatabaseMissing('sale_items', ['id' => 'planted-sale-item-1']);
    }

    public function test_sync_push_insert_of_a_stock_batch_under_the_callers_own_product_still_succeeds()
    {
        $storeB = Store::where('user_id', $this->ownerB->id)->firstOrFail();

        \Illuminate\Support\Facades\DB::table('products')->insert([
            'id' => 'own-product-b',
            'store_id' => $storeB->id,
            'user_id' => $this->ownerB->id,
            'name' => 'Own Painkillers',
            'selling_price' => 500,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->pushAs($this->ownerB, [
            'table_name' => 'stock_batches',
            'operation' => 'INSERT',
            'record_id' => 'own-batch-1',
            'payload' => [
                'id' => 'own-batch-1',
                'product_id' => 'own-product-b',
                'batch_number' => 'OWN',
                'quantity' => 10,
                'cost_price' => 1,
                '_version' => 1,
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $this->assertDatabaseHas('stock_batches', ['id' => 'own-batch-1']);
    }

    /**
     * A-77, second gap: normalizePushPayload()'s foreign-store_id rejection
     * was gated on `&& $currentStoreId`, so a caller who owns no store at all
     * had an explicit foreign store_id accepted verbatim.
     */
    public function test_sync_push_insert_with_a_foreign_store_id_is_rejected_for_a_store_less_caller()
    {
        $storeless = User::create([
            'first_name' => 'Storeless', 'last_name' => 'Caller',
            'email' => 'storeless@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $response = $this->pushAs($storeless, [
            'table_name' => 'products',
            'operation' => 'INSERT',
            'record_id' => 'planted-product-1',
            'payload' => [
                'id' => 'planted-product-1',
                'store_id' => $this->storeA->id,
                'name' => 'Planted Product',
                'selling_price' => 1,
                '_version' => 1,
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'failed');
        $this->assertDatabaseMissing('products', ['id' => 'planted-product-1']);
    }
}
