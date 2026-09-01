<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SyncEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->user = User::create([
            'first_name' => 'Admin',
            'last_name' => 'User',
            'email' => 'admin@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);

        $this->store = Store::create([
            'user_id' => $this->user->id,
            'name' => 'Test Store',
            'email' => 'store@dumosrx.com',
            'phone' => '1234567890',
            'address' => '123 Test St',
            'slug' => 'test-store',
            'device_id' => 'WEB-TEST',
        ]);

        $this->user->update(['store_id' => $this->store->id]);
        
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1]
                ]
            ]
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    public function test_push_sync_handles_inserts()
    {
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'INSERT',
                    'record_id' => 'prod_123',
                    'payload' => [
                        'id' => 'prod_123',
                        'name' => 'Paracetamol',
                        'is_active' => true,
                        '_synced' => 0,
                    ]
                ]
            ]
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        if ($response->status() !== 200) {
            dump($response->json());
        }
        $response->assertStatus(200);
        $response->assertJson(['success' => true]);

        $this->assertDatabaseHas('products', [
            'id' => 'prod_123',
            'name' => 'Paracetamol',
            'user_id' => $this->user->id,
        ]);
    }

    public function test_push_sync_handles_updates()
    {
        // First create a product
        $productId = 'prod_456';
        DB::table('products')->insert([
            'id' => $productId,
            'user_id' => $this->user->id,
            'name' => 'Aspirin',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now()
        ]);

        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'name' => 'Aspirin Forte', // Changed
                        '_version' => 2,
                        '_synced' => 0,
                    ]
                ]
            ]
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);

        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'name' => 'Aspirin Forte',
            'user_id' => $this->user->id,
        ]);

        // Assert _version was incremented
        $product = DB::table('products')->where('id', $productId)->first();
        $this->assertGreaterThan(1, $product->_version);
    }

    public function test_push_sync_handles_conflict_resolution()
    {
        // Double edit scenario: Online has newer data than incoming offline sync
        $productId = 'prod_conflict';
        DB::table('products')->insert([
            'id' => $productId,
            'user_id' => $this->user->id,
            'name' => 'Online Newer Aspirin',
            '_version' => 3,
            'created_at' => now()->subDays(2),
            'updated_at' => now() // Just updated online
        ]);

        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'name' => 'Offline Older Aspirin',
                        '_version' => 2,
                        '_synced' => 0,
                        'updated_at' => now()->subDay()->toDateTimeString() // Older update timestamp
                    ]
                ]
            ]
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        $response->assertStatus(200);

        // Assert the online name was NOT overwritten by the older offline sync
        $this->assertDatabaseHas('products', [
            'id' => $productId,
            'name' => 'Online Newer Aspirin',
        ]);
    }

    public function test_push_sync_handles_soft_deletes()
    {
        $productId = 'prod_delete_me';
        DB::table('products')->insert([
            'id' => $productId,
            'user_id' => $this->user->id,
            'name' => 'To Be Deleted',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now()
        ]);

        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'name' => 'To Be Deleted',
                        '_deleted' => 1, // Soft delete flag
                        '_synced' => 0,
                        'updated_at' => now()->toDateTimeString()
                    ]
                ]
            ]
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);
        $response->assertStatus(200);

        // Assert the record exists but is soft deleted (deleted_at is not null)
        $product = \App\Models\Product::withTrashed()->find($productId);
        $this->assertNotNull($product->deleted_at);
    }

    public function test_push_sync_reconciles_inventory_deductions()
    {
        DB::table('products')->insert([
            'id' => 'prod_123',
            'user_id' => $this->user->id,
            'name' => 'Paracetamol',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now()
        ]);

        // Start with 100 on the server
        $batchId = 'batch_123';
        DB::table('stock_batches')->insert([
            'id' => $batchId,
            'user_id' => $this->user->id,
            'product_id' => 'prod_123',
            'quantity' => 80, // Someone sold 20 online!
            'cost_price' => 50.00,
            'expiry_date' => now()->addYear()->toDateString(),
            'batch_number' => 'B001',
            '_version' => 2,
            'created_at' => now()->subDay(),
            'updated_at' => now()
        ]);

        // The offline device started with 100. It sold 10 offline, so it sends 90.
        // It should NOT overwrite the 80 to 90. It should reconcile it: 
        // Delta = 90 (client) - 100 (client's assumed previous stock) = -10.
        // Or if the backend correctly processes it, it should result in 70 (80 online - 10 offline).
        
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'stock_movements',
                    'operation' => 'INSERT',
                    'record_id' => 'mov_123',
                    'payload' => [
                        'id' => 'mov_123',
                        'stock_batch_id' => $batchId,
                        'product_id' => 'prod_123',
                        'movement_type' => 'sale',
                        'quantity' => -10, // The delta!
                        'performed_by' => $this->user->id,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString()
                    ]
                ],
                [
                    'table_name' => 'stock_batches',
                    'operation' => 'UPDATE',
                    'record_id' => $batchId,
                    'payload' => [
                        'id' => $batchId,
                        'quantity' => 90, // Offline device sold 10 from 100
                        '_version' => 1, // Client thinks it's still version 1 before this edit
                        'updated_at' => now()->toDateTimeString()
                    ]
                ]
            ]
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);
        $response->assertStatus(200);

        // Assert the stock was correctly reconciled to 70
        $this->assertDatabaseHas('stock_batches', [
            'id' => $batchId,
            'quantity' => 70, // 80 - 10 = 70
        ]);
    }

    /**
     * A batch created and immediately partially sold before its first-ever
     * sync (e.g. procurement receiving + a POS sale, both offline) pushes a
     * stock_batches INSERT with an already-net quantity AND the matching
     * sale movement in the same payload. The server must not trust the
     * INSERT's quantity (it would already reflect the sale) while also
     * applying the movement's delta on top — that's the exact double-count
     * the original bug caused, just triggered by first-sync instead of by
     * a version conflict.
     */
    public function test_push_sync_reconciles_new_batch_created_and_sold_in_same_push()
    {
        DB::table('products')->insert([
            'id' => 'prod_456',
            'user_id' => $this->user->id,
            'name' => 'Amoxicillin',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $batchId = 'batch_456';
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'stock_batches',
                    'operation' => 'INSERT',
                    'record_id' => $batchId,
                    'payload' => [
                        'id' => $batchId,
                        'product_id' => 'prod_456',
                        // Client's local value already nets out the 10 sold below —
                        // received 100, sold 10, so it pushes 90.
                        'quantity' => 90,
                        'cost_price' => 20.00,
                        'batch_number' => 'B002',
                        'expiry_date' => now()->addYear()->toDateString(),
                        '_version' => 1,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
                [
                    // The opening receipt — establishes the true starting quantity.
                    'table_name' => 'stock_movements',
                    'operation' => 'INSERT',
                    'record_id' => 'mov_456_a',
                    'payload' => [
                        'id' => 'mov_456_a',
                        'stock_batch_id' => $batchId,
                        'product_id' => 'prod_456',
                        'movement_type' => 'purchase',
                        'quantity' => 100,
                        'performed_by' => $this->user->id,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
                [
                    // The offline sale against that same batch.
                    'table_name' => 'stock_movements',
                    'operation' => 'INSERT',
                    'record_id' => 'mov_456_b',
                    'payload' => [
                        'id' => 'mov_456_b',
                        'stock_batch_id' => $batchId,
                        'product_id' => 'prod_456',
                        'movement_type' => 'sale',
                        'quantity' => -10,
                        'performed_by' => $this->user->id,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
            ],
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);
        $response->assertStatus(200);

        // 0 (new batch default) + 100 (opening) - 10 (sale) = 90 — matches what
        // the client expected, but derived from movements, not trusted directly.
        $this->assertDatabaseHas('stock_batches', [
            'id' => $batchId,
            'quantity' => 90,
        ]);
    }

    /**
     * Offline clients retry pushes after network failures without knowing
     * whether the server already applied them. A retried movement must not
     * apply its delta a second time — the existing "convert INSERT to
     * UPDATE when the record already exists" logic should make this safe
     * for free, since the delta is only accumulated in the INSERT branch.
     */
    public function test_push_sync_does_not_double_apply_delta_on_retried_movement()
    {
        DB::table('products')->insert([
            'id' => 'prod_999',
            'user_id' => $this->user->id,
            'name' => 'Vitamin C',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $batchId = 'batch_999';
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'stock_batches',
                    'operation' => 'INSERT',
                    'record_id' => $batchId,
                    'payload' => [
                        'id' => $batchId,
                        'product_id' => 'prod_999',
                        'quantity' => 100,
                        'cost_price' => 5.00,
                        'batch_number' => 'B004',
                        'expiry_date' => now()->addYear()->toDateString(),
                        '_version' => 1,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
                [
                    'table_name' => 'stock_movements',
                    'operation' => 'INSERT',
                    'record_id' => 'mov_999',
                    'payload' => [
                        'id' => 'mov_999',
                        'stock_batch_id' => $batchId,
                        'product_id' => 'prod_999',
                        'movement_type' => 'purchase',
                        'quantity' => 100,
                        'performed_by' => $this->user->id,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
            ],
        ];

        // First push: the network call succeeds server-side...
        $first = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);
        $first->assertStatus(200);

        // ...but the client never got the response (e.g. connection dropped)
        // and retries the exact same payload.
        $second = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);
        $second->assertStatus(200);

        $this->assertDatabaseHas('stock_batches', [
            'id' => $batchId,
            'quantity' => 100, // NOT 200
        ]);
    }

    /**
     * Clients are not guaranteed to order a new batch's INSERT before its
     * movement in the same payload. Applying deltas in a deferred pass after
     * the whole payload is processed (rather than inline, as changes are
     * seen) must make this order-independent.
     */
    public function test_push_sync_reconciles_new_batch_when_movement_precedes_batch_insert()
    {
        DB::table('products')->insert([
            'id' => 'prod_789',
            'user_id' => $this->user->id,
            'name' => 'Ibuprofen',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $batchId = 'batch_789';
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    // Movement arrives BEFORE the batch it references even exists.
                    'table_name' => 'stock_movements',
                    'operation' => 'INSERT',
                    'record_id' => 'mov_789_a',
                    'payload' => [
                        'id' => 'mov_789_a',
                        'stock_batch_id' => $batchId,
                        'product_id' => 'prod_789',
                        'movement_type' => 'purchase',
                        'quantity' => 50,
                        'performed_by' => $this->user->id,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
                [
                    'table_name' => 'stock_batches',
                    'operation' => 'INSERT',
                    'record_id' => $batchId,
                    'payload' => [
                        'id' => $batchId,
                        'product_id' => 'prod_789',
                        'quantity' => 50,
                        'cost_price' => 15.00,
                        'batch_number' => 'B003',
                        'expiry_date' => now()->addYear()->toDateString(),
                        '_version' => 1,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
            ],
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);
        $response->assertStatus(200);

        $this->assertDatabaseHas('stock_batches', [
            'id' => $batchId,
            'quantity' => 50,
        ]);
    }

    public function test_push_sync_handles_expense_inserts_with_notes()
    {
        $expenseId = 'exp_123';
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'expenses',
                    'operation' => 'INSERT',
                    'record_id' => $expenseId,
                    'payload' => [
                        'id' => $expenseId,
                        'user_id' => $this->user->id,
                        'category' => 'Marketing',
                        'description' => 'Facebook Ads',
                        'amount' => 5000.00,
                        'date' => now()->toDateString(),
                        'payment_method' => 'Card',
                        'notes' => 'Campaign Q3',
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ]
                ]
            ]
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        if ($response->status() !== 200) {
            dump($response->json());
        }
        $response->assertStatus(200);
        $response->assertJson(['success' => true]);

        $this->assertDatabaseHas('expenses', [
            'id' => $expenseId,
            'user_id' => $this->user->id,
            'category' => 'Marketing',
            'amount' => 5000.00,
            'notes' => 'Campaign Q3'
        ]);
    }

    /**
     * Regression test: createSale() on the client never set performed_by on
     * the stock_movements row it inserts (harmless locally — that column is
     * nullable there — but a required FK with no default on the cloud DB),
     * so every sale's movement silently failed this INSERT and sat stuck in
     * _sync_queue forever. Every other stock_movements fixture in this file
     * hand-includes performed_by, which is exactly why this never got
     * caught — none of them matched what the client actually sends. This
     * one deliberately omits it, matching real createSale() output, to
     * assert the server's fallback (inject from the authenticated user)
     * actually works. Asserting only `success: true` at the top level
     * (as the other tests here do) would NOT have caught the original bug —
     * per-item failures land in the `failed` array while `success` stays
     * true, so this also asserts that array is empty.
     */
    public function test_push_sync_backfills_performed_by_on_stock_movements_when_missing()
    {
        DB::table('products')->insert([
            'id' => 'prod_perf',
            'user_id' => $this->user->id,
            'name' => 'Paracetamol',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('stock_batches')->insert([
            'id' => 'batch_perf',
            'user_id' => $this->user->id,
            'product_id' => 'prod_perf',
            'quantity' => 100,
            'cost_price' => 50.00,
            'expiry_date' => now()->addYear()->toDateString(),
            'batch_number' => 'B001',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $movementId = 'mov_perf';
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'stock_movements',
                    'operation' => 'INSERT',
                    'record_id' => $movementId,
                    'payload' => [
                        'id' => $movementId,
                        'stock_batch_id' => 'batch_perf',
                        'product_id' => 'prod_perf',
                        'movement_type' => 'sale',
                        'quantity' => -1,
                        // Deliberately no 'performed_by' — this is the bug.
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
            ],
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);
        $response->assertJsonCount(0, 'failed');

        $this->assertDatabaseHas('stock_movements', [
            'id' => $movementId,
            'performed_by' => $this->user->id,
        ]);
    }

    /**
     * Regression test: local staff accounts are explicitly allowed to have
     * no email ("Optional for local staff" in the web staff form), so
     * $payload['email'] is then simply absent from the push — but the
     * duplicate-account check accessed it unguarded and crashed with
     * "Undefined array key" instead of skipping the check.
     */
    public function test_push_sync_handles_user_insert_without_email()
    {
        $newUserId = (string) \Illuminate\Support\Str::uuid();
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'users',
                    'operation' => 'INSERT',
                    'record_id' => $newUserId,
                    'payload' => [
                        'id' => $newUserId,
                        'first_name' => 'Demo',
                        'last_name' => 'Cashier',
                        'username' => 'demo_cashier',
                        'pin' => '1234',
                        'role' => 'sales_staff',
                        'store_id' => $this->store->id,
                        // Deliberately no 'email' — this is the bug.
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
            ],
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);
        $response->assertJsonCount(0, 'failed');

        $this->assertDatabaseHas('users', [
            'id' => $newUserId,
            'username' => 'demo_cashier',
            'email' => null,
        ]);
    }

    /**
     * Regression test: when a pushed category's name collides with one that
     * already exists, the INSERT is silently skipped and the id remap used
     * to only live in $idMap's in-request memory (see push()'s duplicate-name
     * handling) — never reaching the client, which left any product pushed
     * in a later request permanently unable to satisfy its category_id
     * foreign key. The response must report the remap via id_map so the
     * client can fix up its own local rows immediately.
     */
    public function test_push_sync_reports_id_map_for_duplicate_category_name()
    {
        // Category uses HasUuids, which assigns its own id on creation
        // regardless of what's passed in — read the real id back afterward
        // rather than assuming an explicitly-passed one sticks.
        $existingCategory = \App\Models\Category::create([
            'name' => 'DRUGS',
            'user_id' => $this->user->id,
        ]);
        $existingCategoryId = $existingCategory->id;

        $localCategoryId = (string) \Illuminate\Support\Str::uuid();
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'categories',
                    'operation' => 'INSERT',
                    'record_id' => $localCategoryId,
                    'payload' => [
                        'id' => $localCategoryId,
                        'name' => 'DRUGS',
                        '_synced' => 0,
                    ],
                ],
            ],
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'id_map' => [
                'categories' => [
                    $localCategoryId => $existingCategoryId,
                ],
            ],
        ]);

        // No second row was created for the colliding name.
        $this->assertDatabaseMissing('categories', ['id' => $localCategoryId]);
        $this->assertDatabaseCount('categories', 1);
    }
}
