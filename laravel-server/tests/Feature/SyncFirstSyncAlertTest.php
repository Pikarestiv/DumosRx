<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Events\MessageSending;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * A-110: the first-sync super-admin alert is a synchronous SMTP send (this
 * repo runs no queue worker), so it must not happen while the push
 * transaction and its lockForUpdate() row locks are still open.
 */
class SyncFirstSyncAlertTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        config(['dumos.admin_emails' => ['platform-admin@dumosrx.com']]);

        $this->owner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Main Branch',
            'device_id' => 'WEB-FIRSTSYNC',
        ]);
        $this->owner->update(['store_id' => $this->store->id]);

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

    private function push(): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'products',
                    'operation' => 'INSERT',
                    'record_id' => 'first-sync-product',
                    'payload' => [
                        'id' => 'first-sync-product',
                        'name' => 'Panadol',
                        'selling_price' => 100,
                        '_version' => 1,
                    ],
                ],
            ],
        ]);
    }

    public function test_the_first_sync_alert_is_sent_outside_the_push_transaction(): void
    {
        $baseline = DB::transactionLevel();
        $transactionLevels = [];
        Event::listen(MessageSending::class, function () use (&$transactionLevels) {
            $transactionLevels[] = DB::transactionLevel();
        });

        $this->push()->assertStatus(200);

        $this->assertNotEmpty($transactionLevels, 'No first-sync alert was sent at all.');
        $this->assertSame([$baseline], array_unique($transactionLevels), 'The first-sync alert was sent inside an open transaction.');
        $this->assertNotNull($this->store->fresh()->last_sync_at);
    }

    public function test_a_subsequent_sync_sends_no_alert(): void
    {
        $this->store->last_sync_at = now()->subDay();
        $this->store->saveQuietly();

        $sent = 0;
        Event::listen(MessageSending::class, function () use (&$sent) {
            $sent++;
        });

        $this->push()->assertStatus(200);

        $this->assertSame(0, $sent);
    }
}
