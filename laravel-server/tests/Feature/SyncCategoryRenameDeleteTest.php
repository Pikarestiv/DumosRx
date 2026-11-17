<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class SyncCategoryRenameDeleteTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $this->user = User::create(['first_name' => 'A', 'last_name' => 'B', 'email' => 'a@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'admin']);
        $this->store = Store::create(['user_id' => $this->user->id, 'name' => 'S', 'email' => 's@dumosrx.com', 'phone' => '1', 'address' => 'x', 'slug' => 's', 'device_id' => 'WEB-1']);
        $this->user->update(['store_id' => $this->store->id]);
        \App\Models\SystemConfig::setVal('subscription_plans', ['tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]]]);
        $this->withoutMiddleware();
    }

    private function category(string $name): Category
    {
        $category = new Category;
        $category->name = $name;
        $category->user_id = $this->user->id;
        $category->store_id = $this->store->id;
        $category->save();

        return $category->fresh();
    }

    private function push(array $changes)
    {
        return $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', ['setup' => true, 'changes' => $changes]);
    }

    public function test_a_rename_updates_the_same_row_instead_of_adding_a_new_category(): void
    {
        $category = $this->category('painkillers');

        $this->push([[
            'table_name' => 'categories', 'operation' => 'UPDATE', 'record_id' => $category->id,
            'payload' => ['id' => $category->id, 'name' => 'analgesics', '_version' => (int) $category->_version, '_synced' => 0, 'updated_at' => now()->addMinute()->toDateTimeString()],
        ]])->assertOk();

        $this->assertDatabaseCount('categories', 1);
        $this->assertSame('analgesics', Category::find($category->id)->name);
    }

    public function test_a_delete_removes_the_category_and_a_later_pull_reports_it_deleted(): void
    {
        $category = $this->category('painkillers');

        $this->push([['table_name' => 'categories', 'operation' => 'DELETE', 'record_id' => $category->id, 'payload' => ['id' => $category->id]]])->assertOk();

        $this->assertNull(Category::find($category->id));
        $this->assertNotNull(Category::withTrashed()->find($category->id)?->deleted_at);
    }

    public function test_a_category_created_on_a_device_gets_a_server_id_and_a_rename_by_that_id_still_updates_it(): void
    {
        $localId = (string) Str::uuid();
        $response = $this->push([[
            'table_name' => 'categories', 'operation' => 'INSERT', 'record_id' => $localId,
            'payload' => ['id' => $localId, 'name' => 'painkillers', '_synced' => 0],
        ]])->assertOk();
        $serverId = $response->json('id_map.categories.'.$localId) ?? Category::first()->id;

        $this->push([[
            'table_name' => 'categories', 'operation' => 'UPDATE', 'record_id' => $serverId,
            'payload' => ['id' => $serverId, 'name' => 'analgesics', '_version' => 1, '_synced' => 0, 'updated_at' => now()->addMinute()->toDateTimeString()],
        ]])->assertOk();

        $this->assertDatabaseCount('categories', 1);
        $this->assertSame('analgesics', Category::first()->name);
    }

    private function pulledCategories(): \Illuminate\Support\Collection
    {
        $body = $this->actingAs($this->user)->postJson('/api/v1/app/sync/pull', ['setup' => true, 'last_synced' => []])->assertOk()->json();

        return collect($body['changes']['categories'] ?? []);
    }

    public function test_a_rename_reaches_another_device_on_its_next_pull(): void
    {
        $category = $this->category('painkillers');
        $this->push([[
            'table_name' => 'categories', 'operation' => 'UPDATE', 'record_id' => $category->id,
            'payload' => ['id' => $category->id, 'name' => 'analgesics', '_version' => (int) $category->_version, '_synced' => 0, 'updated_at' => now()->addMinute()->toDateTimeString()],
        ]])->assertOk();

        $this->assertSame(['analgesics'], $this->pulledCategories()->pluck('name')->all());
    }

    public function test_a_delete_reaches_another_device_as_a_deleted_row(): void
    {
        $category = $this->category('painkillers');
        $this->push([['table_name' => 'categories', 'operation' => 'DELETE', 'record_id' => $category->id, 'payload' => ['id' => $category->id]]])->assertOk();

        $row = $this->pulledCategories()->firstWhere('id', $category->id);

        $this->assertNotNull($row, 'the deleted category must still be pulled so other devices can drop it');
        $this->assertTrue((bool) ($row['_deleted'] ?? false) || ! empty($row['deleted_at']));
    }

    public function test_a_rename_pushed_in_the_shape_the_client_sends_updates_the_same_row(): void
    {
        $id = (string) Str::uuid();
        $this->push([
            ['table_name' => 'categories', 'operation' => 'INSERT', 'record_id' => $id, 'payload' => ['id' => $id, 'name' => 'painkillers', 'is_active' => 1, 'store_id' => null, 'created_at' => now()->toIso8601String(), 'updated_at' => now()->toIso8601String(), '_version' => 1, '_synced' => 0]],
            ['table_name' => 'categories', 'operation' => 'UPDATE', 'record_id' => $id, 'payload' => ['name' => 'analgesics', 'updated_at' => now()->addSecond()->toIso8601String(), '_version' => 1, '_synced' => 0]],
        ])->assertOk();

        $this->assertDatabaseCount('categories', 1);
        $this->assertSame('analgesics', Category::find($id)->name);
    }

    public function test_a_rename_in_a_later_push_without_an_id_in_the_payload_still_updates_the_row(): void
    {
        $category = $this->category('painkillers');

        $this->push([
            ['table_name' => 'categories', 'operation' => 'UPDATE', 'record_id' => $category->id, 'payload' => ['name' => 'analgesics', 'updated_at' => now()->addMinute()->toIso8601String(), '_version' => 1, '_synced' => 0]],
        ])->assertOk();

        $this->assertDatabaseCount('categories', 1);
        $this->assertSame('analgesics', Category::find($category->id)->name);
    }
}
