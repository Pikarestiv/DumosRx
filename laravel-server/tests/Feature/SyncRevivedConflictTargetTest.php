<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * A-285. `findDuplicateInsertConflict()` remaps a pushed INSERT onto the row
 * it collides with by name, which tells the client to tombstone the row it
 * just created — so reviving a trashed target has to carry the payload across,
 * and only `categories` may be matched against a trashed row at all.
 * Rationale in laravel-server/AGENTS.md, "Every pulled table soft-deletes".
 */
class SyncRevivedConflictTargetTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Revive',
            'last_name' => 'Owner',
            'email' => 'revive-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Revive Store',
            'slug' => 'revive-store',
            'device_id' => 'WEB-REVIVE',
            'currency' => 'NGN',
        ]);
        $this->owner->update(['store_id' => $this->store->id]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();
    }

    private function pushDelete(string $table, string $id)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => $table,
                    'operation' => 'DELETE',
                    'record_id' => $id,
                    'payload' => ['id' => $id, 'store_id' => $this->store->id],
                ],
            ],
        ]);
    }

    /**
     * A-285. Reviving the trashed row the client's new id is remapped onto is
     * not enough: the remap tombstones the row the owner just created, so
     * whatever they typed has to be carried onto the survivor. A category
     * deleted while inactive is the case that bites — the revived row comes
     * back `is_active = 0` and `getCategoryList()` filters it straight back
     * out, so the category the owner just made is simply missing.
     */
    public function test_reviving_a_deleted_category_applies_what_the_owner_just_typed()
    {
        DB::table('categories')->insert([
            'id' => 'cat-revive',
            'store_id' => $this->store->id,
            'name' => 'Cosmetics',
            'description' => 'old',
            'is_active' => 0,
            '_version' => 4,
            'created_at' => now()->subDays(3),
            'updated_at' => now()->subDays(3),
        ]);
        $this->pushDelete('categories', 'cat-revive')->assertStatus(200);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'categories',
                    'operation' => 'INSERT',
                    'record_id' => 'cat-fresh',
                    'payload' => [
                        'id' => 'cat-fresh',
                        'store_id' => $this->store->id,
                        'name' => 'Cosmetics',
                        'description' => 'new',
                        'is_active' => 1,
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200)->assertJsonCount(0, 'failed');
        $response->assertJsonPath('id_map.categories.cat-fresh', 'cat-revive');

        $survivor = DB::table('categories')->where('id', 'cat-revive')->first();
        $this->assertNull($survivor->deleted_at, 'The remapped-onto row must not stay deleted.');
        $this->assertSame(1, (int) $survivor->is_active, 'The owner re-created the category as active.');
        $this->assertSame('new', $survivor->description, 'The revived row kept the description the owner replaced.');
        $this->assertGreaterThan(4, (int) $survivor->_version, 'Reviving changed the row, so a stale device must not win against it.');

        $pull = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/pull', [
            'setup' => true,
            'last_synced' => [],
        ]);
        $delivered = collect($pull->json('changes.categories'))->firstWhere('id', 'cat-revive');
        $this->assertSame(0, $delivered['_deleted'], 'The deleting device must be told the row is back.');
    }

    /**
     * `suppliers.name` carries no unique index — only `categories` does, and
     * only scoped to the store — so a supplier named after a deleted one
     * never collided and must stay a genuinely new row. Remapping it would
     * revive the old supplier's phone, address and contact over it.
     */
    public function test_a_supplier_named_after_a_deleted_one_is_not_remapped_onto_it()
    {
        DB::table('suppliers')->insert([
            'id' => 'sup-old',
            'store_id' => $this->store->id,
            'name' => 'Acme Pharma',
            'phone' => '0800-OLD',
            '_version' => 2,
            'deleted_at' => now()->subDay(),
            'created_at' => now()->subDays(3),
            'updated_at' => now()->subDays(3),
        ]);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'suppliers',
                    'operation' => 'INSERT',
                    'record_id' => 'sup-new',
                    'payload' => [
                        'id' => 'sup-new',
                        'store_id' => $this->store->id,
                        'name' => 'Acme Pharma',
                        'phone' => '0800-NEW',
                    ],
                ],
            ],
        ]);

        $response->assertStatus(200)->assertJsonCount(0, 'failed');
        $response->assertJsonMissingPath('id_map.suppliers.sup-new');

        $this->assertSame(
            '0800-NEW',
            DB::table('suppliers')->where('id', 'sup-new')->value('phone'),
            'The new supplier must exist in its own right.',
        );
        $this->assertNotNull(
            DB::table('suppliers')->where('id', 'sup-old')->value('deleted_at'),
            'The deleted supplier must stay deleted.',
        );
    }
}
