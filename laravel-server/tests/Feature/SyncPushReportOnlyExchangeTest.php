<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SyncCommand;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Commands and their outcomes travel on a push. But the commonest successful
 * outcome EMPTIES the queue — abandoning or retrying the last stuck row — so
 * if a push required at least one change, the device would have nothing to
 * ride along with and the outcome would never be delivered. The operator
 * would be left looking at a command that is forever "queued", which is the
 * exact ambiguity this feature exists to remove.
 *
 * Likewise an idle device would never pick a command up at all.
 *
 * So a push carrying no changes is a legitimate request: it exchanges
 * reports, outcomes and commands, and nothing else.
 */
class SyncPushReportOnlyExchangeTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    private const DEVICE = 'DESKTOP-IDLE';

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Idle Store',
            'device_id' => self::DEVICE,
            'currency' => 'NGN',
        ]);

        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();
    }

    private function push(array $body): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->owner)
            ->withHeader('X-Store-Id', $this->store->id)
            ->withHeader('X-Device-Id', self::DEVICE)
            ->postJson('/api/v1/app/sync/push', $body);
    }

    private function pendingCommand(): SyncCommand
    {
        return SyncCommand::create([
            'id' => (string) Str::uuid(),
            'store_id' => $this->store->id,
            'device_id' => self::DEVICE,
            'action' => 'abandon',
            'table_name' => 'feedback',
            'record_id' => (string) Str::uuid(),
            'issued_by' => $this->owner->id,
            'status' => 'pending',
            'issued_at' => now(),
        ]);
    }

    public function test_a_push_with_no_changes_is_accepted(): void
    {
        $this->push(['changes' => []])->assertOk();
    }

    public function test_an_idle_device_still_receives_a_pending_command(): void
    {
        $command = $this->pendingCommand();

        $response = $this->push(['changes' => []])->assertOk();

        $this->assertSame(
            [$command->id],
            array_column($response->json('sync_commands') ?? [], 'id'),
            'a device with an empty queue must still be able to pick a command up'
        );
    }

    public function test_an_outcome_is_recorded_even_when_the_queue_is_now_empty(): void
    {
        $command = $this->pendingCommand();
        $command->update(['status' => 'delivered']);

        $this->push([
            'changes' => [],
            'sync_command_results' => [
                ['id' => $command->id, 'status' => 'applied', 'result' => 'dropped from the queue'],
            ],
        ])->assertOk();

        $command->refresh();

        $this->assertSame('applied', $command->status);
        $this->assertNotNull($command->acted_at);
    }

    /** A malformed changes value is still a client bug, not a report-only push. */
    public function test_a_non_array_changes_value_is_still_refused(): void
    {
        $this->push(['changes' => 'all of them'])->assertStatus(422);
    }

    public function test_an_absent_changes_key_is_still_refused(): void
    {
        $this->push([])->assertStatus(422);
    }
}
