<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Store;
use App\Models\User;
use App\Services\Sync\PushedRowRestamper;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * A-286. `_synced_at` was stamped when a change was processed, not when it
 * became visible, so a push held open by lock waits committed rows stamped
 * minutes earlier. Rationale in laravel-server/AGENTS.md, "The pull watermark
 * lags".
 */
class SyncPushRestampAtCommitTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Restamp',
            'last_name' => 'Owner',
            'email' => 'restamp@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Restamp Store',
            'slug' => 'restamp-store',
            'device_id' => 'WEB-RESTAMP',
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

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function seedCategory(string $id, string $syncedAt = '2026-01-01 00:00:00'): void
    {
        DB::table('categories')->insert([
            'id' => $id,
            'store_id' => $this->store->id,
            'name' => 'Cat-'.$id,
            '_version' => 3,
            '_synced_at' => $syncedAt,
            'created_at' => '2026-01-01 00:00:00',
            'updated_at' => '2026-01-01 00:00:00',
        ]);
    }

    private function push(array $changes)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', ['changes' => $changes]);
    }

    private function syncedAt(string $id): Carbon
    {
        return Carbon::parse(DB::table('categories')->where('id', $id)->value('_synced_at'));
    }

    /**
     * Moves the clock forward the moment the row is written, standing in for
     * a push that spends its time blocked on lock waits after the write.
     */
    private function advanceClockAfterWriting(string $table, int $seconds): void
    {
        $fired = false;
        DB::listen(function ($query) use ($table, $seconds, &$fired) {
            if (! $fired && preg_match('/^(insert into|update) "?'.$table.'"?/i', $query->sql)) {
                $fired = true;
                Carbon::setTestNow(now()->addSeconds($seconds));
            }
        });
    }

    public function test_a_pushed_insert_is_stamped_at_commit_not_when_it_was_processed()
    {
        $this->advanceClockAfterWriting('categories', 300);
        $before = now();

        $this->push([[
            'table_name' => 'categories',
            'operation' => 'INSERT',
            'record_id' => 'cat-new',
            'payload' => ['id' => 'cat-new', 'name' => 'Fresh', 'store_id' => $this->store->id],
        ]])->assertOk();

        $this->assertGreaterThanOrEqual(
            $before->copy()->addSeconds(300)->timestamp,
            $this->syncedAt('cat-new')->timestamp,
        );
    }

    public function test_a_pushed_update_is_stamped_at_commit_without_moving_updated_at_or_version_again()
    {
        $this->seedCategory('cat-upd');
        $this->advanceClockAfterWriting('categories', 300);
        $before = now();

        $this->push([[
            'table_name' => 'categories',
            'operation' => 'UPDATE',
            'record_id' => 'cat-upd',
            'payload' => ['id' => 'cat-upd', 'name' => 'Renamed', '_version' => 3],
        ]])->assertOk();

        $this->assertGreaterThanOrEqual(
            $before->copy()->addSeconds(300)->timestamp,
            $this->syncedAt('cat-upd')->timestamp,
        );
        $this->assertSame(4, (int) DB::table('categories')->where('id', 'cat-upd')->value('_version'));
        $this->assertLessThan(
            $before->copy()->addSeconds(300)->timestamp,
            Carbon::parse(DB::table('categories')->where('id', 'cat-upd')->value('updated_at'))->timestamp,
        );
    }

    public function test_a_pushed_delete_is_stamped_at_commit()
    {
        $this->seedCategory('cat-del');
        $this->advanceClockAfterWriting('categories', 300);
        $before = now();

        $this->push([[
            'table_name' => 'categories',
            'operation' => 'DELETE',
            'record_id' => 'cat-del',
            'payload' => [],
        ]])->assertOk();

        $this->assertNotNull(DB::table('categories')->where('id', 'cat-del')->value('deleted_at'));
        $this->assertGreaterThanOrEqual(
            $before->copy()->addSeconds(300)->timestamp,
            $this->syncedAt('cat-del')->timestamp,
        );
    }

    public function test_a_rejected_change_is_not_restamped()
    {
        $other = User::create([
            'first_name' => 'Other',
            'last_name' => 'Owner',
            'email' => 'other@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $otherStore = Store::create([
            'user_id' => $other->id,
            'name' => 'Other Store',
            'slug' => 'other-store',
            'device_id' => 'WEB-OTHER',
            'currency' => 'NGN',
        ]);
        DB::table('categories')->insert([
            'id' => 'cat-foreign',
            'store_id' => $otherStore->id,
            'name' => 'Foreign',
            '_version' => 1,
            '_synced_at' => '2026-01-01 00:00:00',
            'created_at' => '2026-01-01 00:00:00',
            'updated_at' => '2026-01-01 00:00:00',
        ]);

        $this->push([[
            'table_name' => 'categories',
            'operation' => 'UPDATE',
            'record_id' => 'cat-foreign',
            'payload' => ['id' => 'cat-foreign', 'name' => 'Hijacked', '_version' => 1],
        ]])->assertOk()->assertJsonPath('failed.0.reason', 'forbidden');

        $this->assertSame('2026-01-01 00:00:00', $this->syncedAt('cat-foreign')->format('Y-m-d H:i:s'));
    }

    public function test_the_restamper_only_touches_committed_changes_and_never_the_version_or_updated_at()
    {
        $this->seedCategory('cat-kept');
        $this->seedCategory('cat-dropped');
        $restamper = new PushedRowRestamper();

        $restamper->remember(Category::findOrFail('cat-kept'));
        $restamper->commitChange();
        $restamper->remember(Category::findOrFail('cat-dropped'));
        $restamper->discardChange();

        $restamper->restamp(Carbon::parse('2026-06-01 12:00:00'));

        $this->assertSame('2026-06-01 12:00:00', $this->syncedAt('cat-kept')->format('Y-m-d H:i:s'));
        $this->assertSame('2026-01-01 00:00:00', $this->syncedAt('cat-dropped')->format('Y-m-d H:i:s'));
        $this->assertSame(3, (int) DB::table('categories')->where('id', 'cat-kept')->value('_version'));
        $this->assertSame(
            '2026-01-01 00:00:00',
            Carbon::parse(DB::table('categories')->where('id', 'cat-kept')->value('updated_at'))->format('Y-m-d H:i:s'),
        );
    }

    public function test_a_table_without_a_synced_at_column_is_skipped()
    {
        $this->assertFalse(Schema::hasColumn('sync_failures', '_synced_at'));
        $row = new \App\Models\SyncFailure();
        $row->forceFill(['id' => 1]);
        $restamper = new PushedRowRestamper();

        $restamper->remember($row);
        $restamper->commitChange();
        $restamper->restamp(now());

        $this->addToAssertionCount(1);
    }
}
