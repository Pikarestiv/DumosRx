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
                        // The real client (see base-helpers.ts's update() fix
                        // for _known-bugs.md #11) sends its UNCHANGED base
                        // version here, not an incremented one — this is the
                        // server's cue that the edit was made against its
                        // current known state. The server assigns the new
                        // version itself (asserted below).
                        '_version' => 1,
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

    /**
     * Regression test for a real report: the client's local SQLite schema
     * has always had purchase_orders.type (see client/lib/db/schema.ts), but
     * no server migration ever added it here, so every purchase order push
     * failed with "Unknown column 'type'" (SQLSTATE 42S22) — confirmed via a
     * real sync failure log predating this fix.
     */
    public function test_push_sync_handles_purchase_order_insert_with_type_column()
    {
        $supplierId = (string) \Illuminate\Support\Str::uuid();
        DB::table('suppliers')->insert([
            'id' => $supplierId,
            'user_id' => $this->user->id,
            'name' => 'Test Supplier',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $poId = (string) \Illuminate\Support\Str::uuid();
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'purchase_orders',
                    'operation' => 'INSERT',
                    'record_id' => $poId,
                    'payload' => [
                        'id' => $poId,
                        'order_number' => 'PO-TEST-001',
                        'supplier_id' => $supplierId,
                        'status' => 'pending',
                        'type' => 'standard',
                        'payment_status' => 'unpaid',
                        'amount_paid' => 0,
                        'total_amount' => 78000,
                        'ordered_by' => $this->user->id,
                        'order_date' => now()->toDateTimeString(),
                        '_synced' => 0,
                    ],
                ],
            ],
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $this->assertDatabaseHas('purchase_orders', [
            'id' => $poId,
            'order_number' => 'PO-TEST-001',
            'type' => 'standard',
        ]);
    }

    /**
     * Regression test for a real report: the client's local SQLite schema
     * has always allowed purchase_orders.supplier_id to be null (see
     * client/lib/db/schema.ts), and the app permits creating a purchase
     * order before a supplier is picked. The server's column was NOT NULL,
     * so any such purchase order failed to sync with "Column supplier_id
     * cannot be null" (SQLSTATE 23000) — confirmed via a real sync failure
     * log for a purchase order created without a supplier.
     */
    public function test_push_sync_handles_purchase_order_insert_without_supplier()
    {
        $poId = (string) \Illuminate\Support\Str::uuid();
        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'purchase_orders',
                    'operation' => 'INSERT',
                    'record_id' => $poId,
                    'payload' => [
                        'id' => $poId,
                        'order_number' => 'PO-TEST-002',
                        'supplier_id' => null,
                        'status' => 'pending',
                        'type' => 'standard',
                        'payment_status' => 'unpaid',
                        'amount_paid' => 0,
                        'total_amount' => 78000,
                        'ordered_by' => $this->user->id,
                        'order_date' => now()->toDateTimeString(),
                        '_synced' => 0,
                    ],
                ],
            ],
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $this->assertDatabaseHas('purchase_orders', [
            'id' => $poId,
            'order_number' => 'PO-TEST-002',
            'supplier_id' => null,
        ]);
    }

    /**
     * Regression test found via a critical review of the client's sync
     * engine: pull() capped every table, including 'stores', at
     * ->limit(500). The client's pull.ts prunes any local store absent from
     * the 'stores' response on the assumption that it's always a complete,
     * unfiltered snapshot (see the comment there) — true for every other
     * table's row count in practice, but an owner with more than 500 stores
     * would have gotten a silently truncated list, making stores past the
     * cutoff indistinguishable from ones that were actually deleted.
     */
    /**
     * Regression test for _known-bugs.md #11 — the confirmed live data-loss
     * bug: two devices, each making exactly ONE edit from the same shared,
     * already-synced ancestor row, will always compute the identical next
     * `_version` (pure arithmetic on the same starting number under the old
     * client behavior this test payload deliberately still models via a
     * pre-fix-style base version, matching what MACA GUMMIES's real
     * reproduction saw server-side: both devices' payload carrying the SAME
     * version as the server's current one). The old `<` check only rejected
     * a strictly-older payload and silently fell through to an updated_at
     * comparison on equality — exactly this shape — letting Session B's
     * later-clock push silently overwrite Session A's already-confirmed
     * server write with zero error or signal. This proves the strict-
     * equality fix: the second push claiming the same base version the first
     * one already consumed is now rejected as a genuine conflict, and the
     * first device's value survives untouched.
     */
    public function test_push_sync_rejects_second_device_pushing_same_base_version_as_conflict()
    {
        $productId = 'prod_maca_gummies';
        DB::table('products')->insert([
            'id' => $productId,
            'user_id' => $this->user->id,
            'name' => 'Maca Gummies',
            'selling_price' => 999,
            '_version' => 2, // Common ancestor version both devices started from.
            'created_at' => now()->subDays(3),
            'updated_at' => now()->subDays(3),
        ]);

        // Session A: online, edits 999 -> 1500, pushes first. Sends the
        // unchanged base version (2), per the fixed client contract.
        $sessionAPayload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'selling_price' => 1500,
                        '_version' => 2,
                        '_synced' => 0,
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
            ],
        ];

        $responseA = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $sessionAPayload);
        $responseA->assertStatus(200);
        $responseA->assertJsonCount(0, 'failed');

        $afterA = DB::table('products')->where('id', $productId)->first();
        $this->assertEquals('1500.00', $afterA->selling_price);
        $this->assertEquals(3, $afterA->_version); // Server-assigned: 2 + 1.
        // The server hands the new authoritative version back so the client
        // can apply it locally immediately.
        $responseA->assertJson([
            'versions' => ['products' => [$productId => 3]],
        ]);

        // Session B: restored from a backup taken BEFORE Session A's edit,
        // never pulled — independently edits the same field to 777, from the
        // same ancestor version (2) Session A started from. This is the
        // guaranteed collision: both devices compute _version 2 as "the
        // version this edit is based on," and by the time B's push arrives,
        // the server's actual current version is already 3 (Session A's).
        $sessionBPayload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'UPDATE',
                    'record_id' => $productId,
                    'payload' => [
                        'id' => $productId,
                        'selling_price' => 777,
                        '_version' => 2,
                        '_synced' => 0,
                        // A LATER wall-clock timestamp than Session A's edit —
                        // exactly what let the old updated_at fallback pick
                        // B as the "winner" despite being based on stale data.
                        'updated_at' => now()->addMinute()->toDateTimeString(),
                    ],
                ],
            ],
        ];

        $responseB = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $sessionBPayload);
        $responseB->assertStatus(200);

        // Rejected as a genuine conflict, not silently accepted.
        $responseB->assertJsonCount(1, 'failed');
        $responseB->assertJson([
            'failed' => [
                [
                    'table_name' => 'products',
                    'record_id' => $productId,
                    'reason' => 'version_conflict',
                ],
            ],
        ]);

        // Session A's already-confirmed write survives untouched — the core
        // data-loss assertion this bug was filed for.
        $final = DB::table('products')->where('id', $productId)->first();
        $this->assertEquals('1500.00', $final->selling_price);
        $this->assertEquals(3, $final->_version);
    }

    /**
     * Confirms the fix doesn't break the far more common, non-conflicting
     * case: one device making two sequential edits, each correctly based on
     * the version the previous push left behind (which is exactly what the
     * client now does — see push.ts's `versions` handling applying the
     * server's returned version to the local row immediately after each
     * accepted push).
     */
    public function test_push_sync_accepts_sequential_same_device_edits()
    {
        $productId = 'prod_sequential';
        DB::table('products')->insert([
            'id' => $productId,
            'user_id' => $this->user->id,
            'name' => 'Panadol',
            'selling_price' => 500,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // First edit: based on version 1.
        $first = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'products',
                'operation' => 'UPDATE',
                'record_id' => $productId,
                'payload' => [
                    'id' => $productId,
                    'selling_price' => 600,
                    '_version' => 1,
                    '_synced' => 0,
                    'updated_at' => now()->toDateTimeString(),
                ],
            ]],
        ]);
        $first->assertStatus(200);
        $first->assertJsonCount(0, 'failed');
        $first->assertJson(['versions' => ['products' => [$productId => 2]]]);

        // Second edit: the client applied the server's returned version (2)
        // to its local row after the first push, so this one correctly
        // targets version 2 — the normal, expected sequential-edit shape.
        $second = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'products',
                'operation' => 'UPDATE',
                'record_id' => $productId,
                'payload' => [
                    'id' => $productId,
                    'selling_price' => 700,
                    '_version' => 2,
                    '_synced' => 0,
                    'updated_at' => now()->addMinute()->toDateTimeString(),
                ],
            ]],
        ]);
        $second->assertStatus(200);
        $second->assertJsonCount(0, 'failed');
        $second->assertJson(['versions' => ['products' => [$productId => 3]]]);

        $final = DB::table('products')->where('id', $productId)->first();
        $this->assertEquals('700.00', $final->selling_price);
        $this->assertEquals(3, $final->_version);
    }

    /**
     * stock_batches is deliberately exempt from the strict version-conflict
     * check added for _known-bugs.md #11: two different terminals/devices
     * concurrently selling from the same batch is normal, everyday store
     * operation, not a rare edge case, and both pushes carry the same base
     * _version by the same guaranteed-collision arithmetic as any other
     * two-device edit on this table. Rejecting the second one would be a
     * constant false alarm — the table's only real, version-sensitive
     * field (quantity) is stripped from this UPDATE and never applied from
     * it at all; the true quantity comes from separate, never-version-
     * checked stock_movements deltas. This proves both terminals' updates
     * are accepted, not rejected.
     */
    public function test_push_sync_exempts_stock_batches_from_version_conflict_check()
    {
        DB::table('products')->insert([
            'id' => 'prod_multi_terminal',
            'user_id' => $this->user->id,
            'name' => 'Ibuprofen',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $batchId = 'batch_multi_terminal';
        DB::table('stock_batches')->insert([
            'id' => $batchId,
            'user_id' => $this->user->id,
            'product_id' => 'prod_multi_terminal',
            'quantity' => 100,
            'cost_price' => 10.00,
            'expiry_date' => now()->addYear()->toDateString(),
            'batch_number' => 'B-MULTI',
            '_version' => 2, // Common ancestor both terminals started from.
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ]);

        // Terminal 1 sells 5 units, pushes first.
        $terminal1 = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'stock_batches',
                    'operation' => 'UPDATE',
                    'record_id' => $batchId,
                    'payload' => [
                        'id' => $batchId,
                        'quantity' => 95, // Stripped server-side either way.
                        '_version' => 2,
                        '_synced' => 0,
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
                [
                    'table_name' => 'stock_movements',
                    'operation' => 'INSERT',
                    'record_id' => 'mov_terminal1',
                    'payload' => [
                        'id' => 'mov_terminal1',
                        'stock_batch_id' => $batchId,
                        'product_id' => 'prod_multi_terminal',
                        'movement_type' => 'sale',
                        'quantity' => -5,
                        'performed_by' => $this->user->id,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
            ],
        ]);
        $terminal1->assertStatus(200);
        $terminal1->assertJsonCount(0, 'failed');

        // Terminal 2, a different device, independently sells 3 units around
        // the same time — also based on the same ancestor version (2), never
        // having pulled Terminal 1's push yet.
        $terminal2 = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'stock_batches',
                    'operation' => 'UPDATE',
                    'record_id' => $batchId,
                    'payload' => [
                        'id' => $batchId,
                        'quantity' => 97,
                        '_version' => 2,
                        '_synced' => 0,
                        'updated_at' => now()->addSeconds(30)->toDateTimeString(),
                    ],
                ],
                [
                    'table_name' => 'stock_movements',
                    'operation' => 'INSERT',
                    'record_id' => 'mov_terminal2',
                    'payload' => [
                        'id' => 'mov_terminal2',
                        'stock_batch_id' => $batchId,
                        'product_id' => 'prod_multi_terminal',
                        'movement_type' => 'sale',
                        'quantity' => -3,
                        'performed_by' => $this->user->id,
                        'created_at' => now()->toDateTimeString(),
                        'updated_at' => now()->toDateTimeString(),
                    ],
                ],
            ],
        ]);
        $terminal2->assertStatus(200);

        // Not a false-alarm conflict — both terminals' updates are accepted.
        $terminal2->assertJsonCount(0, 'failed');

        // Both sales' deltas applied: 100 - 5 - 3 = 92, not one clobbering
        // the other and not either being lost.
        $this->assertDatabaseHas('stock_batches', [
            'id' => $batchId,
            'quantity' => 92,
        ]);
    }

    /**
     * Regression test for a review finding on the stock_batches exemption
     * above: it must NOT extend to fields other than quantity. The
     * stock-audit cost-correction flow (lib/db/queries/inventory.ts's
     * reconcileStockAudit, ~line 518) really does push a stock_batches
     * UPDATE that only touches cost_price — a genuine two-manager conflict
     * on that field must still be caught by the normal strict-equality
     * check, or this table's exemption would silently reintroduce the exact
     * class of data loss _known-bugs.md #11 was filed for, just relocated
     * to a different column.
     */
    public function test_push_sync_does_not_exempt_stock_batches_non_quantity_field_from_conflict_check()
    {
        DB::table('products')->insert([
            'id' => 'prod_cost_correction',
            'user_id' => $this->user->id,
            'name' => 'Amoxicillin',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $batchId = 'batch_cost_correction';
        DB::table('stock_batches')->insert([
            'id' => $batchId,
            'user_id' => $this->user->id,
            'product_id' => 'prod_cost_correction',
            'quantity' => 50,
            'cost_price' => 10.00,
            'expiry_date' => now()->addYear()->toDateString(),
            'batch_number' => 'B-COST',
            '_version' => 2, // Common ancestor both managers started from.
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ]);

        // Manager 1's stock-audit cost correction: cost_price only, no
        // quantity field at all — pushes first.
        $manager1 = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'stock_batches',
                'operation' => 'UPDATE',
                'record_id' => $batchId,
                'payload' => [
                    'id' => $batchId,
                    'cost_price' => 12.50,
                    '_version' => 2,
                    '_synced' => 0,
                    'updated_at' => now()->toDateTimeString(),
                ],
            ]],
        ]);
        $manager1->assertStatus(200);
        $manager1->assertJsonCount(0, 'failed');

        $afterManager1 = DB::table('stock_batches')->where('id', $batchId)->first();
        $this->assertEquals('12.50', $afterManager1->cost_price);
        $this->assertEquals(3, $afterManager1->_version); // Bumped, NOT exempt.

        // Manager 2, independently, also corrects cost_price from the same
        // ancestor version (2) — never having pulled Manager 1's push yet.
        $manager2 = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'stock_batches',
                'operation' => 'UPDATE',
                'record_id' => $batchId,
                'payload' => [
                    'id' => $batchId,
                    'cost_price' => 9.75,
                    '_version' => 2,
                    '_synced' => 0,
                    'updated_at' => now()->addMinute()->toDateTimeString(),
                ],
            ]],
        ]);
        $manager2->assertStatus(200);

        // Rejected as a genuine conflict — NOT silently accepted the way a
        // quantity-only update would be.
        $manager2->assertJsonCount(1, 'failed');
        $manager2->assertJson([
            'failed' => [[
                'table_name' => 'stock_batches',
                'record_id' => $batchId,
                'reason' => 'version_conflict',
            ]],
        ]);

        // Manager 1's already-confirmed cost_price survives untouched.
        $final = DB::table('stock_batches')->where('id', $batchId)->first();
        $this->assertEquals('12.50', $final->cost_price);
        $this->assertEquals(3, $final->_version);
    }

    public function test_pull_sync_returns_more_than_500_stores()
    {
        // A user with no store_id set is treated as the "pure owner" whose
        // 'stores' query resolves every store they own (see pull()'s
        // 'stores' => whereIn(..., $user->store_id ? $storeIds : Store::
        // where('user_id', $ownerId)->...) branch) — unlike $this->user from
        // setUp(), which already has store_id set to its own primary store
        // and would instead be narrowed to just that one store, a separate,
        // pre-existing scoping nuance unrelated to this fix.
        $owner = User::create([
            'first_name' => 'Multi',
            'last_name' => 'Owner',
            'email' => 'multi-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);

        for ($i = 0; $i < 502; $i++) {
            DB::table('stores')->insert([
                'id' => (string) \Illuminate\Support\Str::uuid(),
                'user_id' => $owner->id,
                'name' => "Store {$i}",
                'email' => "store{$i}@dumosrx.com",
                'phone' => '1234567890',
                'address' => '123 Test St',
                'store_slug' => "store-{$i}",
                'device_id' => "WEB-TEST-{$i}",
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $response = $this->actingAs($owner)->postJson('/api/v1/app/sync/pull', [
            'last_synced' => [],
        ]);

        $response->assertStatus(200);
        $this->assertCount(502, $response->json('changes.stores'));
    }
}
