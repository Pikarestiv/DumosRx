<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SyncFailure;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * A-273. Rationale in laravel-server/AGENTS.md, "Re-sent INSERTs".
 */
class SyncPushResentInsertTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Divamax',
            'last_name' => 'Owner',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Divamax',
            'device_id' => 'DRX-LAPTOP',
            'currency' => 'NGN',
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
    }

    private function seedAudit(string $id, int $version, int $actual = 10): void
    {
        DB::table('stock_audits')->insert([
            'id' => $id,
            'product_id' => 'prod-1',
            'store_id' => $this->store->id,
            'expected_quantity' => 12,
            'actual_quantity' => $actual,
            'difference' => $actual - 12,
            'user_id' => $this->owner->id,
            'status' => 'pending',
            '_version' => $version,
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ]);
    }

    private function push(array $change)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [$change],
        ]);
    }

    private function resentInsert(string $id, int $version, int $actual): array
    {
        return [
            'table_name' => 'stock_audits',
            'operation' => 'INSERT',
            'record_id' => $id,
            'payload' => [
                'id' => $id,
                'product_id' => 'prod-1',
                'store_id' => $this->store->id,
                'expected_quantity' => 12,
                'actual_quantity' => $actual,
                'difference' => $actual - 12,
                'user_id' => $this->owner->id,
                'status' => 'pending',
                '_version' => $version,
                '_synced' => 0,
                'updated_at' => now()->toDateTimeString(),
            ],
        ];
    }

    private function genuineUpdate(string $id, int $version, int $actual): array
    {
        return [
            'table_name' => 'stock_audits',
            'operation' => 'UPDATE',
            'record_id' => $id,
            'payload' => [
                'id' => $id,
                'actual_quantity' => $actual,
                'difference' => $actual - 12,
                'status' => 'reconciled',
                '_version' => $version,
                '_synced' => 0,
                'updated_at' => now()->toDateTimeString(),
            ],
        ];
    }

    /**
     * The data-loss path the owner reported: the orphan requeue re-sends a row
     * the server already holds, that acceptance bumps `_version`, and another
     * device's genuine pending edit — staged at the version everybody had —
     * then arrives one behind and is dropped for good.
     */
    public function test_a_resent_insert_does_not_bump_the_version_and_so_does_not_drop_another_devices_edit()
    {
        $auditId = 'audit-divamax';
        $this->seedAudit($auditId, 5);

        $resend = $this->push($this->resentInsert($auditId, 5, 10));
        $resend->assertStatus(200);
        $resend->assertJsonCount(0, 'failed');

        $this->assertSame(
            5,
            (int) DB::table('stock_audits')->where('id', $auditId)->value('_version'),
            'A re-sent snapshot the server already holds must not move the version.',
        );

        $laptop = $this->push($this->genuineUpdate($auditId, 5, 7));
        $laptop->assertStatus(200);
        $laptop->assertJsonCount(0, 'failed');

        $row = DB::table('stock_audits')->where('id', $auditId)->first();
        $this->assertSame(7, (int) $row->actual_quantity);
        $this->assertSame('reconciled', $row->status);
        $this->assertSame(6, (int) $row->_version);
    }

    /**
     * The other direction the owner saw: the re-sender is behind. Its snapshot
     * can neither win nor be a genuine conflict, so the server's row stands and
     * the change comes back accepted — which is what finally lets the device
     * mark the row synced and stop re-sending it.
     */
    public function test_a_behind_resent_insert_is_accepted_without_overwriting_the_server_row()
    {
        $auditId = 'audit-behind';
        $this->seedAudit($auditId, 9, 4);

        $response = $this->push($this->resentInsert($auditId, 3, 99));
        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $response->assertJson(['processed' => 1]);

        $row = DB::table('stock_audits')->where('id', $auditId)->first();
        $this->assertSame(4, (int) $row->actual_quantity);
        $this->assertSame(9, (int) $row->_version);

        $this->assertSame(
            0,
            SyncFailure::where('record_id', $auditId)->count(),
            'A re-send is routine traffic, not a refusal worth reporting to the operator.',
        );
    }

    /**
     * Accepting without writing removes the refusal that used to drive a full
     * re-pull, and the row's `updated_at` deliberately does not move — so the
     * incremental pull can never re-offer it and `versions` is now the only
     * thing that can tell the re-sender what version it is actually on. Left
     * out, that device's next genuine edit to the row pushes stale and is
     * dropped: the same data loss, moved onto the re-sender.
     */
    public function test_a_resent_insert_hands_back_the_servers_version_so_the_resender_is_not_stranded()
    {
        $auditId = 'audit-stranded';
        $this->seedAudit($auditId, 9, 4);

        $response = $this->push($this->resentInsert($auditId, 3, 99));
        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $response->assertJson([
            'versions' => ['stock_audits' => [$auditId => 9]],
        ]);

        $this->assertSame(9, (int) DB::table('stock_audits')->where('id', $auditId)->value('_version'));
    }

    /**
     * A-279. A behind re-send is a row whose content lost, and the device now
     * holds that losing snapshot with a correct version and no queue entry —
     * so only the pull can correct it, and only if the row re-enters the
     * window. `_synced_at` is what puts it there; `updated_at` and `_version`
     * must not move, or the re-sender's own next edit is judged against a
     * version it never saw.
     */
    public function test_a_behind_resent_insert_reopens_the_pull_window_without_moving_the_row()
    {
        $auditId = 'audit-stale-content';
        $this->seedAudit($auditId, 9, 4);
        DB::table('stock_audits')->where('id', $auditId)->update([
            '_synced_at' => now()->subDay()->toDateTimeString(),
        ]);

        $before = DB::table('stock_audits')->where('id', $auditId)->first();

        $this->push($this->resentInsert($auditId, 3, 99))
            ->assertStatus(200)
            ->assertJsonCount(0, 'failed');

        $after = DB::table('stock_audits')->where('id', $auditId)->first();

        $this->assertTrue(
            \Carbon\Carbon::parse($after->_synced_at)->greaterThan(\Carbon\Carbon::parse($before->_synced_at)),
            'A behind re-send must advance _synced_at so the incremental pull re-offers the row.',
        );
        $this->assertSame($before->updated_at, $after->updated_at);
        $this->assertSame(9, (int) $after->_version);
        $this->assertSame(4, (int) $after->actual_quantity);
    }

    public function test_a_resent_insert_at_the_servers_version_also_hands_that_version_back()
    {
        $auditId = 'audit-equal-version';
        $this->seedAudit($auditId, 2, 4);

        $this->push($this->resentInsert($auditId, 2, 6))
            ->assertStatus(200)
            ->assertJson(['versions' => ['stock_audits' => [$auditId => 2]]]);
    }

    /**
     * The override is not a blanket no-op: `remapForeignKey()` relies on a
     * re-sent INSERT to deliver a corrected foreign key, and the soft-delete
     * restore relies on it too. Both arrive at the version the server holds.
     */
    public function test_a_resent_insert_at_the_servers_version_is_still_applied()
    {
        $auditId = 'audit-remap';
        $this->seedAudit($auditId, 2, 4);

        $change = $this->resentInsert($auditId, 2, 6);
        $change['payload']['notes'] = 'corrected';

        $response = $this->push($change);
        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $row = DB::table('stock_audits')->where('id', $auditId)->first();
        $this->assertSame(6, (int) $row->actual_quantity);
        $this->assertSame('corrected', $row->notes);
        $this->assertSame(2, (int) $row->_version);
    }

    public function test_a_resent_insert_restores_a_soft_deleted_row()
    {
        $auditId = 'audit-restore';
        $this->seedAudit($auditId, 2);
        DB::table('stock_audits')->where('id', $auditId)->update(['deleted_at' => now()]);

        $change = $this->resentInsert($auditId, 2, 10);
        $change['payload']['_deleted'] = 0;

        $this->push($change)->assertStatus(200)->assertJsonCount(0, 'failed');

        $this->assertNull(DB::table('stock_audits')->where('id', $auditId)->value('deleted_at'));
    }

    /**
     * A-242. A refusal reached through the existence probe is an UPDATE by the
     * time the server judges it, and `version_conflict` is only reachable for a
     * row the server already has — so recording it as INSERT states the
     * opposite of what happened.
     */
    public function test_a_refusal_after_the_existence_probe_is_recorded_as_the_applied_update()
    {
        $other = Store::create([
            'user_id' => User::create([
                'first_name' => 'Other', 'last_name' => 'Owner',
                'email' => 'other-'.uniqid().'@dumosrx.com',
                'password' => bcrypt('password'), 'role' => 'store_owner',
            ])->id,
            'name' => 'Not Divamax',
            'device_id' => 'DRX-OTHER',
            'currency' => 'NGN',
        ]);

        $auditId = 'audit-foreign';
        DB::table('stock_audits')->insert([
            'id' => $auditId,
            'product_id' => 'prod-1',
            'store_id' => $other->id,
            'expected_quantity' => 1,
            'actual_quantity' => 1,
            'difference' => 0,
            'user_id' => $other->user_id,
            'status' => 'pending',
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->push($this->resentInsert($auditId, 1, 5))->assertStatus(200);

        $this->assertSame(
            'UPDATE',
            SyncFailure::where('record_id', $auditId)->value('operation'),
        );
    }
}
