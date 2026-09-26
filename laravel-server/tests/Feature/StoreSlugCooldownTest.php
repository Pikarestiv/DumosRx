<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for Store::boot()'s slug-change cooldown (once every 6 months) -
 * a regression test for a real bug caught in review: Carbon 3's
 * diffInMonths() returns a SIGNED value, so a naive
 * `now()->diffInMonths($lastChanged) < 6` is always true (permanently
 * negative), which silently reverted every slug change forever instead of
 * unlocking after 6 months.
 */
class StoreSlugCooldownTest extends TestCase
{
    use RefreshDatabase;

    /** store_slug_changed_at/storefront_dirty_at are deliberately NOT
     * fillable (server-only bookkeeping - see Store::boot()), so seeding
     * them for a test has to go around mass assignment the same way
     * production code does (a raw DB write), not through Store::create(). */
    protected function makeStore(array $attrs = []): Store
    {
        $user = User::create([
            'first_name' => 'Admin',
            'last_name' => 'User',
            'email' => uniqid('admin').'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);

        $bookkeeping = array_intersect_key($attrs, array_flip([
            'store_slug_changed_at', 'storefront_dirty_at',
        ]));
        $fillableAttrs = array_diff_key($attrs, $bookkeeping);

        $store = Store::create(array_merge([
            'user_id' => $user->id,
            'name' => 'Test Store',
            'device_id' => uniqid('WEB-TEST'),
        ], $fillableAttrs));

        if (! empty($bookkeeping)) {
            \Illuminate\Support\Facades\DB::table('stores')
                ->where('id', $store->id)
                ->update($bookkeeping);
            $store->refresh();
        }

        return $store;
    }

    public function test_first_ever_slug_set_is_never_restricted()
    {
        $store = $this->makeStore();

        $store->store_slug = 'my-first-slug';
        $store->save();

        $this->assertSame('my-first-slug', $store->store_slug);
        $this->assertNull($store->store_slug_changed_at);
    }

    public function test_changing_slug_again_within_6_months_is_reverted()
    {
        $store = $this->makeStore([
            'store_slug' => 'original-slug',
            'store_slug_changed_at' => now()->subMonths(2),
        ]);

        $store->store_slug = 'new-slug';
        $store->save();

        $this->assertSame('original-slug', $store->fresh()->store_slug);
    }

    public function test_changing_slug_after_6_months_is_allowed_and_restamps()
    {
        $store = $this->makeStore([
            'store_slug' => 'original-slug',
            'store_slug_changed_at' => now()->subMonths(7),
        ]);

        $store->store_slug = 'new-slug';
        $store->save();

        $fresh = $store->fresh();
        $this->assertSame('new-slug', $fresh->store_slug);
        $this->assertTrue($fresh->store_slug_changed_at->isToday());
    }

    public function test_storefront_dirty_at_is_stamped_when_online_status_changes()
    {
        $store = $this->makeStore(['online_store_enabled' => false]);
        $this->assertNull($store->fresh()->storefront_dirty_at);

        $store->online_store_enabled = true;
        $store->save();

        $this->assertNotNull($store->fresh()->storefront_dirty_at);
    }

    public function test_slug_is_slugified_on_write_regardless_of_the_path_it_arrives_through()
    {
        $store = $this->makeStore();

        $store->store_slug = '  My Corner ../ Shop!  ';
        $store->save();

        $this->assertSame('my-corner-shop', $store->fresh()->store_slug);
    }

    public function test_a_slug_with_no_usable_characters_is_reverted()
    {
        $store = $this->makeStore(['store_slug' => 'good-slug']);

        $store->store_slug = '///';
        $store->save();

        $this->assertSame('good-slug', $store->fresh()->store_slug);
    }

    public function test_a_public_profile_change_dirties_the_storefront()
    {
        $store = $this->makeStore([
            'online_store_enabled' => true,
            'store_slug' => 'profile-store',
        ]);
        \Illuminate\Support\Facades\DB::table('stores')->where('id', $store->id)
            ->update(['storefront_dirty_at' => null]);

        $store->name = 'Renamed Store';
        $store->save();

        $this->assertNotNull($store->fresh()->storefront_dirty_at);
    }

    public function test_an_internal_only_change_does_not_dirty_the_storefront()
    {
        $store = $this->makeStore([
            'online_store_enabled' => true,
            'store_slug' => 'internal-store',
        ]);
        \Illuminate\Support\Facades\DB::table('stores')->where('id', $store->id)
            ->update(['storefront_dirty_at' => null]);

        $store->receipt_footer = 'Thanks for shopping';
        $store->save();

        $this->assertNull($store->fresh()->storefront_dirty_at);
    }

    public function test_suspending_a_store_dirties_the_storefront()
    {
        $store = $this->makeStore([
            'online_store_enabled' => true,
            'store_slug' => 'suspend-store',
        ]);
        \Illuminate\Support\Facades\DB::table('stores')->where('id', $store->id)
            ->update(['storefront_dirty_at' => null]);

        $store->status = 'suspended';
        $store->save();

        $this->assertNotNull($store->fresh()->storefront_dirty_at);
    }
}
