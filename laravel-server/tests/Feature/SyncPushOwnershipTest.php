<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regression test for a real vulnerability: SyncController::push()'s
 * UPDATE/DELETE handling looked a record up by id and applied the change
 * with no check that the record actually belonged to the caller's
 * store(s) — $currentStoreId was only ever used to BACK-FILL a missing
 * store_id, never to verify one. Any authenticated user could harvest a
 * competitor's product/customer/etc. id (e.g. off the unauthenticated
 * public storefront endpoint, which exposes real ids) and push a crafted
 * UPDATE or DELETE against it, mutating or soft-deleting a stranger's row.
 * See docs/KNOWN_BUGS.md.
 */
class SyncPushOwnershipTest extends TestCase
{
    use RefreshDatabase;

    protected User $victimOwner;
    protected Store $victimStore;
    protected User $attackerOwner;
    protected Store $attackerStore;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->victimOwner = User::create([
            'first_name' => 'Victim',
            'last_name' => 'Owner',
            'email' => 'victim@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->victimStore = Store::create([
            'user_id' => $this->victimOwner->id,
            'name' => 'Victim Store',
            'email' => 'victim-store@dumosrx.com',
            'phone' => '1111111111',
            'address' => '1 Victim St',
            'slug' => 'victim-store',
            'device_id' => 'WEB-VICTIM',
        ]);
        $this->victimOwner->update(['store_id' => $this->victimStore->id]);

        $this->attackerOwner = User::create([
            'first_name' => 'Attacker',
            'last_name' => 'Owner',
            'email' => 'attacker@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->attackerStore = Store::create([
            'user_id' => $this->attackerOwner->id,
            'name' => 'Attacker Store',
            'email' => 'attacker-store@dumosrx.com',
            'phone' => '2222222222',
            'address' => '2 Attacker St',
            'slug' => 'attacker-store',
            'device_id' => 'WEB-ATTACKER',
        ]);
        $this->attackerOwner->update(['store_id' => $this->attackerStore->id]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    public function test_update_against_another_stores_product_is_rejected_not_applied()
    {
        $productId = 'victim-product-1';
        DB::table('products')->insert([
            'id' => $productId,
            'store_id' => $this->victimStore->id,
            'user_id' => $this->victimOwner->id,
            'name' => 'Victim Painkillers',
            'selling_price' => 500,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'selling_price' => 1,
                        '_version' => 1,
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'failed');
        $response->assertJsonPath('failed.0.reason', 'forbidden');

        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'selling_price' => 500,
        ]);
    }

    public function test_delete_against_another_stores_customer_is_rejected_not_applied()
    {
        $customerId = 'victim-customer-1';
        DB::table('customers')->insert([
            'id' => $customerId,
            'store_id' => $this->victimStore->id,
            'user_id' => $this->victimOwner->id,
            'first_name' => 'Victim',
            'last_name' => 'Customer',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'customers',
                    'operation' => 'DELETE',
                    'record_id' => $customerId,
                    'payload' => ['id' => $customerId],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'failed');
        $response->assertJsonPath('failed.0.reason', 'forbidden');

        $this->assertDatabaseHas('customers', ['id' => $customerId]);
        $this->assertNull(DB::table('customers')->where('id', $customerId)->value('deleted_at'));
    }

    public function test_insert_with_explicit_store_id_outside_callers_stores_is_rejected()
    {
        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'INSERT',
                    'record_id' => 'planted-product-1',
                    'payload' => [
                        'id' => 'planted-product-1',
                        'store_id' => $this->victimStore->id,
                        'name' => 'Planted Product',
                        'selling_price' => 1,
                        '_version' => 1,
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'failed');
        $this->assertDatabaseMissing('products', ['id' => 'planted-product-1']);
    }

    public function test_owner_can_still_update_their_own_stores_product()
    {
        $productId = 'own-product-1';
        DB::table('products')->insert([
            'id' => $productId,
            'store_id' => $this->attackerStore->id,
            'user_id' => $this->attackerOwner->id,
            'name' => 'Own Product',
            'selling_price' => 500,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'selling_price' => 750,
                        '_version' => 1,
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'selling_price' => 750,
        ]);
    }

    /**
     * Root cause of the production "two `feedback` rows rejected as
     * forbidden" report in docs/KNOWN_BUGS.md.
     *
     * `feedback` has no store_id and isn't in pull()'s table list — it's
     * push-only, owned by user_id alone — and it was in none of
     * normalizePushPayload()'s normalization lists, so its user_id was
     * stored exactly as the client sent it. The client's crash logger
     * (client/lib/utils/error-logger.ts) sends the literal string
     * "anonymous" whenever no logged-in user is readable from localStorage.
     * push()'s INSERT branch has no ownership check, so that row was stored;
     * push() then rewrites an INSERT for an already-existing id into an
     * UPDATE, which IS ownership-checked — so every retry of that same
     * crash report was rejected 'forbidden', forever, and sat in the
     * device's _sync_queue.
     */
    public function test_feedback_insert_with_an_unresolvable_user_id_is_stamped_to_the_caller()
    {
        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'feedback',
                    'operation' => 'INSERT',
                    'record_id' => 'crash-report-1',
                    'payload' => [
                        'id' => 'crash-report-1',
                        'user_id' => 'anonymous',
                        'type' => 'bug',
                        'content' => '[CRASH] something blew up before login',
                        'status' => 'pending',
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $this->assertDatabaseHas('feedback', [
            'id' => 'crash-report-1',
            'user_id' => $this->attackerOwner->id,
        ]);
    }

    public function test_re_pushing_a_feedback_row_the_server_already_has_is_not_forbidden()
    {
        $push = fn () => $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'feedback',
                    'operation' => 'INSERT',
                    'record_id' => 'crash-report-2',
                    'payload' => [
                        'id' => 'crash-report-2',
                        'user_id' => 'anonymous',
                        'type' => 'bug',
                        'content' => '[CRASH] retried after a timed-out response',
                        'status' => 'pending',
                        '_version' => 1,
                    ],
                ],
            ],
        ]);

        $push()->assertJsonCount(0, 'failed');

        // The retry: push() turns this INSERT into an UPDATE because the id
        // already exists, which is the path that used to answer 'forbidden'.
        $retry = $push();
        $retry->assertStatus(200);
        $retry->assertJsonCount(0, 'failed');
    }

    /**
     * The pre-existing stuck rows: already stored server-side with a
     * dangling user_id, so they can't be repaired by the INSERT-time stamp
     * above. A user_id naming no `users` row at all is ownership that can't
     * be determined, not another tenant's property, so it falls open the
     * same way a NULL user_id already did.
     */
    public function test_update_of_a_feedback_row_with_a_dangling_user_id_is_allowed()
    {
        DB::table('feedback')->insert([
            'id' => 'legacy-crash-1',
            'user_id' => 'anonymous',
            'type' => 'bug',
            'content' => 'stored before the fix',
            'status' => 'pending',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'feedback',
                    'operation' => 'UPDATE',
                    'record_id' => 'legacy-crash-1',
                    'payload' => [
                        'id' => 'legacy-crash-1',
                        'status' => 'sent',
                        '_version' => 1,
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $this->assertDatabaseHas('feedback', ['id' => 'legacy-crash-1', 'status' => 'sent']);
    }

    /**
     * The leniency above must stay narrow: a feedback row owned by a REAL
     * user outside the caller's scope is still another tenant's row.
     */
    public function test_update_of_another_tenants_feedback_row_is_still_forbidden()
    {
        DB::table('feedback')->insert([
            'id' => 'victim-feedback-1',
            'user_id' => $this->victimOwner->id,
            'type' => 'bug',
            'content' => 'victim ticket',
            'status' => 'pending',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'feedback',
                    'operation' => 'UPDATE',
                    'record_id' => 'victim-feedback-1',
                    'payload' => [
                        'id' => 'victim-feedback-1',
                        'content' => 'tampered',
                        '_version' => 1,
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('failed.0.reason', 'forbidden');
        $this->assertDatabaseHas('feedback', [
            'id' => 'victim-feedback-1',
            'content' => 'victim ticket',
        ]);
    }

    /**
     * A THIRD case, distinct from both above: the row names a real user who
     * has since been soft-deleted (a removed staff member or a deactivated
     * owner). User::whereKey($id)->exists() runs through SoftDeletes' global
     * scope and returns false for them too, exactly like a truly dangling
     * id - but this is real tenant property, not nobody's row, so it must
     * stay forbidden. withTrashed() is what tells the two apart.
     */
    public function test_update_of_a_feedback_row_owned_by_a_soft_deleted_user_is_still_forbidden()
    {
        $deletedStaff = User::create([
            'first_name' => 'Former',
            'last_name' => 'Staff',
            'email' => 'former-staff@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->victimStore->id,
        ]);
        $deletedStaff->delete();

        DB::table('feedback')->insert([
            'id' => 'former-staff-feedback-1',
            'user_id' => $deletedStaff->id,
            'type' => 'bug',
            'content' => 'filed before being let go',
            'status' => 'pending',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'feedback',
                    'operation' => 'UPDATE',
                    'record_id' => 'former-staff-feedback-1',
                    'payload' => [
                        'id' => 'former-staff-feedback-1',
                        'content' => 'tampered',
                        '_version' => 1,
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('failed.0.reason', 'forbidden');
        $this->assertDatabaseHas('feedback', [
            'id' => 'former-staff-feedback-1',
            'content' => 'filed before being let go',
        ]);
    }
}
