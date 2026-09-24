<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * POS unlock PINs (`users.pin`) used to be stored in plaintext AND
 * serialized out by every endpoint that returns a User model. They're
 * bcrypt-hashed on every write now, and hidden from serialization, with
 * one deliberate exception: the sync pull still ships the hash down so a
 * device can verify a PIN entirely offline (PIN login never contacts the
 * server, which is why the migration of existing plaintext values happens
 * client-side on next successful login rather than here).
 *
 * Assertions use Hash::check(), never string equality against the raw
 * digits - the whole point is that the raw digits are no longer recoverable
 * from the column.
 */
class PinHashingTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        // Mirrors SyncEndpointTest's setup: the staff-limit check and the
        // cloud_sync feature gate both read this config, and the users-table
        // sync push consults real Role/Permission rows.
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1, 'staff' => -1],
                ],
            ],
        ]);

        $this->owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Owner Store',
            'store_slug' => 'owner-store',
            'device_id' => 'WEB-OWNER',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_hash_pin_helper_is_idempotent_and_null_safe(): void
    {
        $hash = User::hashPin('1234');

        $this->assertNotSame('1234', $hash);
        $this->assertTrue(Hash::check('1234', $hash));
        // A value that is already a hash is never re-hashed (which would
        // make the original PIN unverifiable).
        $this->assertSame($hash, User::hashPin($hash));
        $this->assertNull(User::hashPin(null));
        $this->assertSame('', User::hashPin(''));
    }

    /**
     * hashPin()'s idempotency check used to be Hash::isHashed(), which is
     * PHP's password_get_info() under the hood - it only recognizes the
     * $2y$/$2a$ prefixes PHP itself produces, and returns FALSE for a $2b$
     * hash, which is exactly what the client's bcryptjs emits. That meant a
     * client-hashed PIN reaching this method (not reachable today, but one
     * relaxed validation rule away) would get hashed a SECOND time and be
     * permanently unverifiable against the real PIN. This is a real
     * bcryptjs-produced hash (bcrypt.hashSync("9876", 10)), not a
     * hand-written string standing in for one.
     */
    public function test_hash_pin_helper_recognizes_a_real_client_produced_hash_as_already_hashed(): void
    {
        $clientHash = '$2b$10$2ScAJubVULTuIcOQEiqWXO5EPGeER0c1tCkbNOCvzmqCnBNZygyXW';

        $this->assertSame($clientHash, User::hashPin($clientHash));

        // password_verify() is algorithm-agnostic and confirms this hash
        // genuinely verifies "9876" - i.e. hashPin() returning it unchanged
        // preserves a real, checkable PIN rather than just passing through
        // an opaque string untested.
        $this->assertTrue(password_verify('9876', $clientHash));

        // Laravel's Hash::check() is NOT interchangeable with
        // password_verify() here: it defaults to verifying the hash was
        // produced by the currently configured algorithm/prefix, and THROWS
        // on a $2b$ hash rather than returning false. Nothing server-side
        // calls Hash::check() on a PIN today (PIN login is client-only, see
        // pin-hash.ts), but this test exists so that if someone adds a
        // server-side PIN check later using the Hash facade, they hit this
        // failure in a test rather than a 500 in production.
        $this->expectException(\RuntimeException::class);
        Hash::check('9876', $clientHash);
    }

    public function test_creating_staff_stores_the_pin_hashed(): void
    {
        $response = $this->actingAs($this->owner)->postJson('/api/v1/staff', [
            'first_name' => 'New',
            'last_name' => 'Hire',
            'username' => 'newhire',
            'role' => 'sales_staff',
            'pin' => '4321',
            'store_id' => $this->store->id,
        ]);

        $response->assertStatus(201);

        $staff = User::where('username', 'newhire')->firstOrFail();
        $this->assertNotSame('4321', $staff->pin);
        $this->assertTrue(Hash::check('4321', $staff->pin));
        // The password fallback is still derived from the RAW pin (that's a
        // separate, server-side credential - see StaffController::store).
        $this->assertTrue(Hash::check('4321', $staff->password));
    }

    public function test_updating_a_staff_pin_stores_it_hashed(): void
    {
        $staff = User::create([
            'first_name' => 'Existing', 'last_name' => 'Staff',
            'email' => 'existing@dumosrx.com', 'password' => bcrypt('password'),
            'username' => 'existing', 'role' => 'sales_staff',
            'store_id' => $this->store->id, 'pin' => User::hashPin('1111'),
        ]);

        $response = $this->actingAs($this->owner)
            ->putJson("/api/v1/staff/{$staff->id}", ['pin' => '2222']);

        $response->assertStatus(200);

        $staff->refresh();
        $this->assertNotSame('2222', $staff->pin);
        $this->assertTrue(Hash::check('2222', $staff->pin));
        $this->assertFalse(Hash::check('1111', $staff->pin));
    }

    public function test_set_pin_profile_endpoint_stores_it_hashed(): void
    {
        $response = $this->actingAs($this->owner)
            ->postJson('/api/v1/profile/set-pin', ['pin' => '8642']);

        $response->assertStatus(200);

        $this->owner->refresh();
        $this->assertNotSame('8642', $this->owner->pin);
        $this->assertTrue(Hash::check('8642', $this->owner->pin));
    }

    public function test_registration_stores_the_pin_hashed(): void
    {
        $response = $this->postJson('/api/v1/register', [
            'first_name' => 'New',
            'last_name' => 'Registrant',
            'email' => 'new-registrant@dumosrx.com',
            'pin' => '1357',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'store_name' => 'New Registrant Pharmacy',
            'store_type' => 'pharmacy',
        ]);

        $response->assertSuccessful();

        $registrant = User::where('email', 'new-registrant@dumosrx.com')->firstOrFail();
        $this->assertNotSame('1357', $registrant->pin);
        $this->assertTrue(Hash::check('1357', $registrant->pin));
    }

    public function test_staff_endpoints_do_not_serialize_the_pin(): void
    {
        $staff = User::create([
            'first_name' => 'Hidden', 'last_name' => 'Pin',
            'email' => 'hidden@dumosrx.com', 'password' => bcrypt('password'),
            'username' => 'hiddenpin', 'role' => 'sales_staff',
            'store_id' => $this->store->id, 'pin' => User::hashPin('9999'),
        ]);

        $index = $this->actingAs($this->owner)->getJson('/api/v1/staff');
        $index->assertStatus(200);
        $this->assertStringNotContainsString('"pin"', $index->getContent());

        $show = $this->actingAs($this->owner)->getJson("/api/v1/staff/{$staff->id}");
        $show->assertStatus(200);
        $this->assertArrayNotHasKey('pin', $show->json());

        $create = $this->actingAs($this->owner)->postJson('/api/v1/staff', [
            'first_name' => 'Fresh', 'last_name' => 'Hire',
            'username' => 'freshhire', 'role' => 'sales_staff',
            'pin' => '1212', 'store_id' => $this->store->id,
        ]);
        $create->assertStatus(201);
        $this->assertArrayNotHasKey('pin', $create->json());
        $this->assertStringNotContainsString('1212', $create->getContent());
    }

    /**
     * The one endpoint that MUST still expose it: offline PIN login can only
     * verify against a value the device actually has. What it ships is the
     * bcrypt hash, never the PIN itself.
     */
    public function test_sync_pull_still_ships_the_hashed_pin_to_devices(): void
    {
        $this->owner->update(['pin' => User::hashPin('2468')]);

        $response = $this->actingAs($this->owner)
            ->postJson('/api/v1/app/sync/pull', ['last_synced' => [], 'setup' => 0]);

        $response->assertStatus(200);

        $users = collect($response->json('changes.users'));
        $row = $users->firstWhere('id', $this->owner->id);

        $this->assertNotNull($row, 'The owner row should be in the users pull.');
        $this->assertArrayHasKey('pin', $row);
        $this->assertNotSame('2468', $row['pin']);
        $this->assertTrue(Hash::check('2468', $row['pin']));
    }

    /**
     * A client that has just migrated a legacy plaintext PIN pushes the
     * ~60-char bcrypt hash up through the ordinary sync queue. Nothing on
     * the push path may reject or truncate it (the column was VARCHAR(4)
     * until 2026_09_24_000000_widen_users_pin_column).
     */
    public function test_sync_push_accepts_a_client_hashed_pin_intact(): void
    {
        $staff = User::create([
            'first_name' => 'Legacy', 'last_name' => 'Pin',
            'email' => 'legacy@dumosrx.com', 'password' => bcrypt('password'),
            'username' => 'legacypin', 'role' => 'sales_staff',
            'store_id' => $this->store->id, 'pin' => '1234',
        ]);

        $clientHash = Hash::make('1234');

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'changes' => [[
                'table_name' => 'users',
                'record_id' => $staff->id,
                'operation' => 'UPDATE',
                'payload' => ['id' => $staff->id, 'pin' => $clientHash],
            ]],
        ]);

        $response->assertStatus(200);

        $staff->refresh();
        $this->assertSame($clientHash, $staff->pin, 'The pushed hash must land untruncated and unmodified.');
        $this->assertTrue(Hash::check('1234', $staff->pin));
    }
}
