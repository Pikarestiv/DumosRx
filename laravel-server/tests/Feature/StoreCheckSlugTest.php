<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * stores.store_slug is a database-level UNIQUE index that does not exclude
 * soft-deleted rows, so availability has to be checked withTrashed() -
 * otherwise an archived store's slug reads as free and the store that
 * claims it can never push its own row again.
 */
class StoreCheckSlugTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();

        $this->owner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
    }

    private function makeStore(string $slug): Store
    {
        return Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Branch '.$slug,
            'store_type' => 'pharmacy',
            'store_slug' => $slug,
            'device_id' => 'test-device-'.uniqid(),
        ]);
    }

    public function test_an_archived_stores_slug_is_not_reported_as_available(): void
    {
        $this->makeStore('mypharmacy')->delete();

        $this->actingAs($this->owner)
            ->getJson('/api/v1/stores/check-slug?slug=mypharmacy')
            ->assertStatus(200)
            ->assertJsonPath('available', false)
            ->assertJsonPath('slug', 'mypharmacy');
    }

    public function test_an_active_stores_slug_is_still_reported_as_taken(): void
    {
        $this->makeStore('otherpharmacy');

        $this->actingAs($this->owner)
            ->getJson('/api/v1/stores/check-slug?slug=otherpharmacy')
            ->assertStatus(200)
            ->assertJsonPath('available', false);
    }

    public function test_an_unused_slug_is_available(): void
    {
        $this->actingAs($this->owner)
            ->getJson('/api/v1/stores/check-slug?slug=brand-new-slug')
            ->assertStatus(200)
            ->assertJsonPath('available', true);
    }

    public function test_the_stores_own_slug_can_be_ignored(): void
    {
        $store = $this->makeStore('keepmine');

        $this->actingAs($this->owner)
            ->getJson('/api/v1/stores/check-slug?slug=keepmine&ignore_id='.$store->id)
            ->assertStatus(200)
            ->assertJsonPath('available', true);
    }
}
