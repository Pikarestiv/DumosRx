<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\SyncCommand;
use App\Models\User;
use App\Services\Admin\SyncCommandService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Phase 4 of the stuck-data work: the first thing here that acts ON a
 * customer device rather than reading from it.
 *
 * The safety rules are the feature. A compromised admin panel must not become
 * a way to destroy store data, and "abandon" must never be able to discard a
 * business record whose only copy is on that device — the owner's point:
 * abandoning a stuck sale or stock movement spoils the data permanently.
 */
class SyncCommandSafetyTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private User $actor;

    protected function setUp(): void
    {
        parent::setUp();

        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Command Store',
            'device_id' => 'DESKTOP-ONE',
            'currency' => 'NGN',
        ]);

        $this->actor = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'super_admin',
        ]);
    }

    private function service(): SyncCommandService
    {
        return app(SyncCommandService::class);
    }

    public function test_it_queues_a_retry_for_a_specific_device_and_row(): void
    {
        $command = $this->service()->issue(
            $this->store->id, 'DESKTOP-ONE', 'retry', 'sales', 'rec-1', $this->actor->id
        );

        $this->assertSame('pending', $command->status);
        $this->assertSame('retry', $command->action);
        $this->assertSame('sales', $command->table_name);
    }

    /**
     * The owner's constraint, enforced in code: a sale or a stock movement
     * exists only on that device, so discarding it loses revenue data or
     * falsifies stock permanently. Escalation, never discard.
     */
    public function test_abandon_is_refused_for_a_business_record(): void
    {
        foreach (['sales', 'sale_items', 'stock_movements', 'returns', 'customer_payments'] as $table) {
            $this->expectNotToPerformAssertions();

            try {
                $this->service()->issue($this->store->id, 'DESKTOP-ONE', 'abandon', $table, 'r1', $this->actor->id);
                $this->fail("abandon must be refused for {$table}");
            } catch (\InvalidArgumentException $e) {
                // expected
            }
        }
    }

    public function test_abandon_is_allowed_for_a_diagnostic_record(): void
    {
        $command = $this->service()->issue(
            $this->store->id, 'DESKTOP-ONE', 'abandon', 'feedback', 'crash-1', $this->actor->id
        );

        $this->assertSame('abandon', $command->action);
    }

    /**
     * An allowlist, not a denylist: a table added later defaults to
     * "cannot abandon" rather than silently becoming discardable.
     */
    public function test_an_unknown_table_cannot_be_abandoned(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->service()->issue($this->store->id, 'DESKTOP-ONE', 'abandon', 'some_new_table', 'r1', $this->actor->id);
    }

    public function test_an_unknown_action_is_refused(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->service()->issue($this->store->id, 'DESKTOP-ONE', 'drop_table', 'sales', 'r1', $this->actor->id);
    }

    public function test_every_issued_command_is_audited(): void
    {
        $this->service()->issue($this->store->id, 'DESKTOP-ONE', 'retry', 'sales', 'rec-1', $this->actor->id);

        $log = ActivityLog::where('action', 'SYNC_COMMAND_ISSUED')->first();

        $this->assertNotNull($log);
        $this->assertSame($this->actor->id, $log->user_id);
    }

    public function test_a_device_only_receives_its_own_pending_commands(): void
    {
        $this->service()->issue($this->store->id, 'DESKTOP-ONE', 'retry', 'sales', 'r1', $this->actor->id);
        $this->service()->issue($this->store->id, 'LAPTOP-TWO', 'retry', 'sales', 'r2', $this->actor->id);

        $pending = $this->service()->pendingFor($this->store->id, 'DESKTOP-ONE');

        $this->assertCount(1, $pending);
        $this->assertSame('r1', $pending[0]['record_id']);
    }

    public function test_a_command_is_not_handed_out_twice(): void
    {
        $this->service()->issue($this->store->id, 'DESKTOP-ONE', 'retry', 'sales', 'r1', $this->actor->id);

        $this->assertCount(1, $this->service()->pendingFor($this->store->id, 'DESKTOP-ONE'));
        $this->assertCount(0, $this->service()->pendingFor($this->store->id, 'DESKTOP-ONE'));
    }

    public function test_a_device_reports_the_outcome_back(): void
    {
        $command = $this->service()->issue(
            $this->store->id, 'DESKTOP-ONE', 'retry', 'sales', 'r1', $this->actor->id
        );
        $this->service()->pendingFor($this->store->id, 'DESKTOP-ONE');

        $this->service()->recordOutcome($this->store->id, 'DESKTOP-ONE', [
            ['id' => $command->id, 'status' => 'applied', 'result' => 'requeued'],
        ]);

        $this->assertSame('applied', SyncCommand::find($command->id)->status);
        $this->assertNotNull(SyncCommand::find($command->id)->acted_at);
    }

    /** A device must not be able to close another device's command. */
    public function test_a_device_cannot_close_a_command_issued_to_another(): void
    {
        $command = $this->service()->issue(
            $this->store->id, 'LAPTOP-TWO', 'retry', 'sales', 'r1', $this->actor->id
        );

        $this->service()->recordOutcome($this->store->id, 'DESKTOP-ONE', [
            ['id' => $command->id, 'status' => 'applied', 'result' => 'nope'],
        ]);

        $this->assertNotSame('applied', SyncCommand::find($command->id)->status);
    }

    private function admin(string $role): User
    {
        return User::create([
            'first_name' => 'Platform', 'last_name' => 'Tester',
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => $role,
        ]);
    }

    private function withoutGateMiddleware(): void
    {
        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
    }

    /** Acting on a customer device is never delegatable. */
    public function test_issuing_a_command_is_super_admin_only(): void
    {
        $this->withoutGateMiddleware();

        foreach (['platform_admin', 'agent'] as $role) {
            $this->actingAs($this->admin($role))
                ->postJson("/api/v1/admin/stores/{$this->store->id}/sync-commands", [
                    'device_id' => 'DESKTOP-ONE', 'action' => 'retry',
                    'table_name' => 'sales', 'record_id' => 'r1',
                ])
                ->assertStatus(403);
        }

        $this->actingAs($this->admin('super_admin'))
            ->postJson("/api/v1/admin/stores/{$this->store->id}/sync-commands", [
                'device_id' => 'DESKTOP-ONE', 'action' => 'retry',
                'table_name' => 'sales', 'record_id' => 'r1',
            ])
            ->assertStatus(201);
    }

    public function test_the_endpoint_refuses_to_abandon_a_business_record(): void
    {
        $this->withoutGateMiddleware();

        $this->actingAs($this->admin('super_admin'))
            ->postJson("/api/v1/admin/stores/{$this->store->id}/sync-commands", [
                'device_id' => 'DESKTOP-ONE', 'action' => 'abandon',
                'table_name' => 'stock_movements', 'record_id' => 'r1',
            ])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => "Rows in 'stock_movements' cannot be abandoned: the device holds the only copy, so discarding one would lose business data permanently. Escalate it instead."]);
    }
}
