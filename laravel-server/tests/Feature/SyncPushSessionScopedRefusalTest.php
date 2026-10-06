<?php

namespace Tests\Feature;

use App\Models\PermissionGroup;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Regression coverage for A-167: normalizePushPayload()'s explicit-store_id
 * guard must distinguish a refusal that is absolute for the whole tenant
 * (another owner's store, or a store that no longer exists) from one that is
 * only true for the narrower session doing the pushing. See docs/FIXED_BUGS.md.
 */
class SyncPushSessionScopedRefusalTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Store $storeA;
    private Store $storeB;
    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Scope',
            'last_name' => 'Owner',
            'email' => 'scope-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->storeA = $this->makeStore($this->owner, 'Scope Store A', 'scope-store-a');
        $this->storeB = $this->makeStore($this->owner, 'Scope Store B', 'scope-store-b');
        $this->owner->update(['store_id' => $this->storeA->id]);

        $this->staff = User::create([
            'first_name' => 'Scope',
            'last_name' => 'Staff',
            'email' => 'scope-staff@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'staff',
            'store_id' => $this->storeA->id,
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

        Schema::enableForeignKeyConstraints();
    }

    private function makeStore(User $owner, string $name, string $slug): Store
    {
        return Store::create([
            'user_id' => $owner->id,
            'name' => $name,
            'email' => "{$slug}@dumosrx.com",
            'phone' => '080' . substr(md5($slug), 0, 8),
            'address' => "1 {$name}",
            'slug' => $slug,
            'device_id' => strtoupper($slug),
        ]);
    }

    private function foreignStore(): Store
    {
        $foreignOwner = User::create([
            'first_name' => 'Other',
            'last_name' => 'Tenant',
            'email' => 'other-tenant@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $store = $this->makeStore($foreignOwner, 'Other Tenant Store', 'other-tenant-store');
        $foreignOwner->update(['store_id' => $store->id]);

        return $store;
    }

    private function push(User $actor, string $table, string $recordId, array $payload, string $operation = 'INSERT')
    {
        return $this->actingAs($actor)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => $table,
                    'operation' => $operation,
                    'record_id' => $recordId,
                    'payload' => $payload,
                ],
            ],
        ]);
    }

    private function paymentPayload(string $recordId, string $storeId): array
    {
        return [
            'id' => $recordId,
            '_version' => 1,
            'customer_id' => 'scope-customer-1',
            'amount' => 2500,
            'payment_method' => 'cash',
            'store_id' => $storeId,
        ];
    }

    public function test_staff_session_pushing_a_row_for_the_owners_other_store_is_refused_as_retryable_forbidden()
    {
        $recordId = 'payment-owners-other-store';

        $response = $this->push($this->staff, 'customer_payments', $recordId, $this->paymentPayload($recordId, $this->storeB->id));

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'failed');
        $this->assertSame(
            'forbidden',
            $response->json('failed.0.reason'),
            'a row the OWNER could push must not come back as the terminal, source-row-settling permission_denied just because a staff session drained the queue'
        );
        $this->assertDatabaseMissing('customer_payments', ['id' => $recordId]);
    }

    public function test_the_owner_can_push_the_very_same_payload_the_staff_session_was_refused()
    {
        $recordId = 'payment-owners-other-store-retried';

        $refused = $this->push($this->staff, 'customer_payments', $recordId, $this->paymentPayload($recordId, $this->storeB->id));
        $refused->assertJsonCount(1, 'failed');

        $accepted = $this->push($this->owner, 'customer_payments', $recordId, $this->paymentPayload($recordId, $this->storeB->id));

        $accepted->assertStatus(200);
        $accepted->assertJsonCount(0, 'failed');
        $this->assertSame(
            $this->storeB->id,
            DB::table('customer_payments')->where('id', $recordId)->value('store_id')
        );
    }

    public function test_staff_session_update_naming_the_owners_other_store_is_refused_as_retryable_forbidden()
    {
        $recordId = 'payment-update-owners-other-store';
        DB::table('customer_payments')->insert($this->paymentPayload($recordId, $this->storeB->id) + [
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->push(
            $this->staff,
            'customer_payments',
            $recordId,
            $this->paymentPayload($recordId, $this->storeB->id) + ['payment_method' => 'transfer'],
            'UPDATE'
        );

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'failed');
        $this->assertSame('forbidden', $response->json('failed.0.reason'));
        $this->assertSame(
            'cash',
            DB::table('customer_payments')->where('id', $recordId)->value('payment_method')
        );
    }

    public function test_a_genuinely_foreign_tenants_store_is_still_terminal_permission_denied()
    {
        $foreign = $this->foreignStore();
        $recordId = 'payment-foreign-tenant';

        $response = $this->push($this->staff, 'customer_payments', $recordId, $this->paymentPayload($recordId, $foreign->id));

        $response->assertStatus(200);
        $this->assertSame('permission_denied', $response->json('failed.0.reason'));
        $this->assertDatabaseMissing('customer_payments', ['id' => $recordId]);
    }

    public function test_an_owner_session_naming_a_store_it_does_not_own_is_still_terminal_permission_denied()
    {
        $foreign = $this->foreignStore();
        $recordId = 'payment-owner-foreign-tenant';

        $response = $this->push($this->owner, 'customer_payments', $recordId, $this->paymentPayload($recordId, $foreign->id));

        $response->assertStatus(200);
        $this->assertSame('permission_denied', $response->json('failed.0.reason'));
    }

    public function test_a_soft_deleted_store_of_the_same_owner_is_still_terminal_permission_denied()
    {
        $recordId = 'payment-soft-deleted-store';
        $this->storeB->delete();

        $response = $this->push($this->staff, 'customer_payments', $recordId, $this->paymentPayload($recordId, $this->storeB->id));

        $response->assertStatus(200);
        $this->assertSame(
            'permission_denied',
            $response->json('failed.0.reason'),
            'no session of this tenant can write to a store that is gone, so the refusal is absolute and the row must stay terminal (A-161 must keep working)'
        );
    }

    public function test_permission_group_privilege_refusals_stay_terminal_permission_denied()
    {
        $group = PermissionGroup::create([
            'id' => 'scope-staff-group',
            'store_id' => $this->storeA->id,
            'name' => 'Cashier',
            'based_on_role' => 'sales_staff',
            'permissions' => ['view_products'],
            'is_default' => false,
        ]);
        $this->staff->update(['permission_group_id' => $group->id]);

        $recordId = 'escalating-group';
        $response = $this->push($this->staff, 'permission_groups', $recordId, [
            'id' => $recordId,
            '_version' => 1,
            'store_id' => $this->storeA->id,
            'name' => 'Super Cashier',
            'based_on_role' => 'sales_staff',
            'permissions' => ['view_products', 'manage_roles_permissions'],
            'is_default' => false,
        ]);

        $response->assertStatus(200);
        $this->assertSame(
            'permission_denied',
            $response->json('failed.0.reason'),
            'A-167 decision lock: the permission_groups privilege checks keep their terminal reason — see docs/FIXED_BUGS.md A-167 and docs/KNOWN_BUGS.md A-168'
        );
        $this->assertDatabaseMissing('permission_groups', ['id' => $recordId]);
    }
}
