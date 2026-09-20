<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for SyncPayloadMapper's stores.logo_url size guard - a backstop
 * against a bypassed/buggy client pushing an unbounded base64 blob (logos
 * are stored inline, not as a real file upload; see stores.logo_url's
 * LONGTEXT migration). The primary control is client-side (handleLogoUpload
 * in hooks/use-settings.ts caps at 1MB before it ever reaches sync).
 */
class SyncStoresLogoSizeGuardTest extends TestCase
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
            'device_id' => 'WEB-TEST',
            'logo_url' => 'data:image/png;base64,original',
        ]);

        $this->user->update(['store_id' => $this->store->id]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    public function test_oversized_logo_url_is_dropped_but_other_fields_still_update()
    {
        $oversizedLogo = 'data:image/png;base64,' . str_repeat('A', 1024 * 1024 + 1);

        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'stores',
                    'operation' => 'UPDATE',
                    'record_id' => $this->store->id,
                    'payload' => [
                        'id' => $this->store->id,
                        'name' => 'Renamed Store',
                        'logo_url' => $oversizedLogo,
                        '_version' => 1,
                        '_synced' => 0,
                    ],
                ],
            ],
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        $response->assertStatus(200);
        $response->assertJson(['success' => true]);

        $this->store->refresh();
        $this->assertSame('Renamed Store', $this->store->name);
        $this->assertSame('data:image/png;base64,original', $this->store->logo_url);
    }

    public function test_logo_url_within_the_limit_is_accepted()
    {
        $validLogo = 'data:image/png;base64,' . str_repeat('A', 1000);

        $payload = [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => 'stores',
                    'operation' => 'UPDATE',
                    'record_id' => $this->store->id,
                    'payload' => [
                        'id' => $this->store->id,
                        'logo_url' => $validLogo,
                        '_version' => 1,
                        '_synced' => 0,
                    ],
                ],
            ],
        ];

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/push', $payload);

        $response->assertStatus(200);
        $this->store->refresh();
        $this->assertSame($validLogo, $this->store->logo_url);
    }
}
