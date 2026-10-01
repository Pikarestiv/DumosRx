<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Undoes the historical poisoning described in docs/FIXED_BUGS.md A-127:
 * the client used to stamp a store owner's own `users` row with its
 * `store_id`, and the server used to forceFill it verbatim, leaving owners
 * with a column that is supposed to mark staff only.
 */
class ClearStoreIdOnStoreOwnersTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function clears_store_id_on_a_user_who_owns_a_store()
    {
        $owner = User::create([
            'first_name' => 'Poisoned',
            'last_name' => 'Owner',
            'email' => 'poisoned-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Owned Store',
            'store_slug' => 'owned-store',
            'device_id' => 'WEB-OWNED',
        ]);

        $owner->update(['store_id' => $store->id]);
        $this->assertNotNull($owner->refresh()->store_id);

        $this->runMigration();

        $this->assertNull($owner->refresh()->store_id);
    }

    #[Test]
    public function leaves_a_genuine_staff_accounts_store_id_untouched()
    {
        $owner = User::create([
            'first_name' => 'Clean',
            'last_name' => 'Owner',
            'email' => 'clean-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Staffed Store',
            'store_slug' => 'staffed-store',
            'device_id' => 'WEB-STAFFED',
        ]);

        $staff = User::create([
            'first_name' => 'Real',
            'last_name' => 'Staff',
            'email' => 'real-staff@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $store->id,
        ]);

        $this->runMigration();

        $this->assertSame($store->id, $staff->refresh()->store_id);
        $this->assertNull($owner->refresh()->store_id);
    }

    private function runMigration(): void
    {
        (require base_path('database/migrations/2026_10_01_000000_clear_store_id_on_store_owners.php'))->up();
    }
}
