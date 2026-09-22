<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression coverage for the 2026_09_22_000000 migration that adds a
 * unique index to online_orders.paystack_reference: the replay bug it
 * closes is exactly what could have already produced duplicate references
 * in a production DB, so the migration must deduplicate before adding the
 * constraint, or it aborts the deploy outright.
 */
class OnlineOrdersReferenceMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_migration_dedupes_existing_duplicate_references_before_adding_the_unique_index()
    {
        // RefreshDatabase already ran every migration once, including this
        // one -- drop its index so duplicates can be inserted, mimicking a
        // pre-migration production DB.
        Schema::table('online_orders', function ($table) {
            $table->dropUnique(['paystack_reference']);
        });

        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'reference-migration-owner@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $store = Store::create([
            'user_id' => $owner->id, 'name' => 'Store', 'store_slug' => 'ref-migration-store',
            'device_id' => 'WEB-REF-MIGRATION',
        ]);

        $base = [
            'store_id' => $store->id,
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'total_amount' => 100,
            'payment_method' => 'paystack',
            'payment_status' => 'paid',
            'order_status' => 'pending',
            'created_at' => now()->subMinutes(5),
            'updated_at' => now()->subMinutes(5),
        ];

        $oldestId = (string) Str::uuid();
        $newerId = (string) Str::uuid();
        $newestId = (string) Str::uuid();
        $untouchedId = (string) Str::uuid();

        DB::table('online_orders')->insert([
            array_merge($base, ['id' => $oldestId, 'paystack_reference' => 'REPLAYED', 'created_at' => now()->subMinutes(10), 'updated_at' => now()->subMinutes(10)]),
            array_merge($base, ['id' => $newerId, 'paystack_reference' => 'REPLAYED', 'created_at' => now()->subMinutes(5), 'updated_at' => now()->subMinutes(5)]),
            array_merge($base, ['id' => $newestId, 'paystack_reference' => 'REPLAYED', 'created_at' => now(), 'updated_at' => now()]),
            array_merge($base, ['id' => $untouchedId, 'paystack_reference' => 'UNIQUE-REF', 'created_at' => now(), 'updated_at' => now()]),
        ]);

        $migration = require database_path('migrations/2026_09_22_000000_add_unique_index_to_online_orders_paystack_reference.php');
        $migration->up();

        $this->assertSame('REPLAYED', DB::table('online_orders')->where('id', $oldestId)->value('paystack_reference'));
        $this->assertNull(DB::table('online_orders')->where('id', $newerId)->value('paystack_reference'));
        $this->assertNull(DB::table('online_orders')->where('id', $newestId)->value('paystack_reference'));
        $this->assertSame('UNIQUE-REF', DB::table('online_orders')->where('id', $untouchedId)->value('paystack_reference'));

        // The unique index must now be enforceable: a second non-null
        // duplicate insert is rejected at the DB level.
        $this->expectException(\Illuminate\Database\QueryException::class);
        DB::table('online_orders')->insert(array_merge($base, [
            'id' => (string) Str::uuid(), 'paystack_reference' => 'UNIQUE-REF',
        ]));
    }
}
