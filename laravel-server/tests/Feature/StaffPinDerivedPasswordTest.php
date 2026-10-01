<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * A-11. A staff account created without an explicit password used to get a
 * web-dashboard login password derived from its 4-digit PIN (or the literal
 * "1234" when no PIN was supplied either) — a real `/login` credential with a
 * 10,000-value keyspace, on an account whose email is the predictable
 * `<username>@local.dumosrx.com`. Both creation paths did it: the online
 * `POST /staff` one and the sync-push users INSERT.
 *
 * PIN-only staff now get `password = null`, and `/login` refuses to
 * authenticate a null-password account at all. The POS itself never uses
 * `/login` for staff (PIN login is verified entirely client-side against the
 * synced `users.pin` hash — see client/lib/context/auth-context.tsx), so the
 * product flow this protects is the pull that ships that hash down, asserted
 * at the bottom of this file.
 */
class StaffPinDerivedPasswordTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1, 'staff' => -1],
                ],
            ],
        ]);

        $this->owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => 'pinpw-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Owner Store',
            'store_slug' => 'pinpw-store',
            'device_id' => 'WEB-PINPW',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    // ---------------------------------------------------------------
    // POST /staff
    // ---------------------------------------------------------------

    public function test_staff_created_with_a_pin_gets_no_login_password(): void
    {
        $response = $this->actingAs($this->owner)->postJson('/api/v1/staff', [
            'first_name' => 'Pin', 'last_name' => 'Only',
            'username' => 'pinonly', 'role' => 'sales_staff',
            'pin' => '4321', 'store_id' => $this->store->id,
        ]);

        $response->assertStatus(201);

        $staff = User::where('username', 'pinonly')->firstOrFail();
        $this->assertNull($staff->password, 'A PIN-only staff account must have no login password.');
        $this->assertTrue(Hash::check('4321', $staff->pin), 'The PIN itself must still work.');
    }

    public function test_staff_created_with_no_password_gets_no_login_password(): void
    {
        $response = $this->actingAs($this->owner)->postJson('/api/v1/staff', [
            'first_name' => 'No', 'last_name' => 'Credentials',
            'username' => 'nocreds', 'role' => 'sales_staff',
            'pin' => '9182', 'store_id' => $this->store->id,
        ]);

        $response->assertStatus(201);

        $staff = User::where('username', 'nocreds')->firstOrFail();
        $this->assertNull($staff->password);
    }

    public function test_a_pin_only_staff_account_cannot_log_in_with_its_pin(): void
    {
        $this->actingAs($this->owner)->postJson('/api/v1/staff', [
            'first_name' => 'Pin', 'last_name' => 'Login',
            'username' => 'pinlogin', 'role' => 'sales_staff',
            'pin' => '4321', 'store_id' => $this->store->id,
        ])->assertStatus(201);

        $response = $this->postJson('/api/v1/login', [
            'email' => 'pinlogin@local.dumosrx.com',
            'password' => '4321',
            'device_name' => 'attacker',
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, User::where('username', 'pinlogin')->firstOrFail()->tokens()->count());
    }

    /**
     * A-89: the create endpoint used to fall back to the literal PIN `1234`
     * when none was supplied, handing out a shared, publicly-known till
     * credential. There is no default any more — the PIN must be stated.
     */
    public function test_creating_staff_without_a_pin_is_rejected(): void
    {
        $this->actingAs($this->owner)->postJson('/api/v1/staff', [
            'first_name' => 'No', 'last_name' => 'Pin',
            'username' => 'nopin', 'role' => 'sales_staff',
            'store_id' => $this->store->id,
        ])->assertStatus(422)->assertJsonValidationErrors('pin');

        $this->assertNull(User::where('username', 'nopin')->first());
    }

    public function test_an_explicit_pin_is_the_only_pin_a_created_account_ever_gets(): void
    {
        $this->actingAs($this->owner)->postJson('/api/v1/staff', [
            'first_name' => 'Has', 'last_name' => 'Pin',
            'username' => 'haspin', 'role' => 'sales_staff',
            'pin' => '5309', 'store_id' => $this->store->id,
        ])->assertStatus(201);

        $staff = User::where('username', 'haspin')->firstOrFail();

        $this->assertTrue(Hash::check('5309', $staff->pin));
        $this->assertFalse(Hash::check('1234', $staff->pin));
    }

    public function test_a_pin_less_staff_account_cannot_log_in_with_the_literal_1234(): void
    {
        User::create([
            'first_name' => 'No', 'last_name' => 'Pin',
            'username' => 'nopin3', 'email' => 'nopin3@local.dumosrx.com',
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        $this->postJson('/api/v1/login', [
            'email' => 'nopin3@local.dumosrx.com',
            'password' => '1234',
            'device_name' => 'attacker',
        ])->assertStatus(422);
    }

    public function test_an_empty_password_never_authenticates_a_null_password_account(): void
    {
        $staff = User::create([
            'first_name' => 'Null', 'last_name' => 'Password',
            'email' => 'nullpw@local.dumosrx.com', 'username' => 'nullpw',
            'role' => 'sales_staff', 'store_id' => $this->store->id,
            'password' => null, 'pin' => User::hashPin('1111'),
        ]);

        foreach (['', '1111', 'password', '$2y$12$'] as $attempt) {
            $this->postJson('/api/v1/login', [
                'email' => 'nullpw@local.dumosrx.com',
                'password' => $attempt === '' ? ' ' : $attempt,
                'device_name' => 'attacker',
            ])->assertStatus(422);
        }

        $this->assertSame(0, $staff->tokens()->count());
    }

    public function test_staff_created_with_a_real_password_can_still_log_in(): void
    {
        $this->actingAs($this->owner)->postJson('/api/v1/staff', [
            'first_name' => 'Web', 'last_name' => 'Manager',
            'username' => 'webmanager', 'role' => 'manager',
            'password' => 'a-real-password', 'pin' => '4321',
            'store_id' => $this->store->id,
        ])->assertStatus(201);

        $staff = User::where('username', 'webmanager')->firstOrFail();
        $this->assertNotNull($staff->password);

        $response = $this->postJson('/api/v1/login', [
            'email' => 'webmanager@local.dumosrx.com',
            'password' => 'a-real-password',
            'device_name' => 'web',
        ]);

        $response->assertStatus(200);
        $response->assertJsonStructure(['token']);
    }

    public function test_setting_a_password_later_restores_web_login(): void
    {
        $this->actingAs($this->owner)->postJson('/api/v1/staff', [
            'first_name' => 'Later', 'last_name' => 'Password',
            'username' => 'laterpw', 'role' => 'manager',
            'pin' => '4321', 'store_id' => $this->store->id,
        ])->assertStatus(201);

        $staff = User::where('username', 'laterpw')->firstOrFail();
        $this->assertNull($staff->password);

        $this->actingAs($this->owner)
            ->putJson("/api/v1/staff/{$staff->id}", ['password' => 'a-real-password'])
            ->assertStatus(200);

        $this->postJson('/api/v1/login', [
            'email' => 'laterpw@local.dumosrx.com',
            'password' => 'a-real-password',
            'device_name' => 'web',
        ])->assertStatus(200);
    }

    // ---------------------------------------------------------------
    // Sync-push INSERT path
    // ---------------------------------------------------------------

    public function test_a_synced_offline_created_staff_row_gets_no_login_password(): void
    {
        $newUserId = (string) Str::uuid();

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'users',
                'operation' => 'INSERT',
                'record_id' => $newUserId,
                'payload' => [
                    'id' => $newUserId,
                    'first_name' => 'Offline', 'last_name' => 'Hire',
                    'username' => 'offlinehire',
                    'email' => 'offlinehire@local.dumosrx.com',
                    'role' => 'sales_staff',
                    'store_id' => $this->store->id,
                    'pin' => '9999',
                ],
            ]],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $staff = User::find($newUserId);
        $this->assertNotNull($staff, 'The offline-created staff row should still be inserted.');
        $this->assertNull($staff->password, 'The sync INSERT path must not derive a password from the PIN.');

        $this->postJson('/api/v1/login', [
            'email' => 'offlinehire@local.dumosrx.com',
            'password' => '9999',
            'device_name' => 'attacker',
        ])->assertStatus(422);

        $this->postJson('/api/v1/login', [
            'email' => 'offlinehire@local.dumosrx.com',
            'password' => '1234',
            'device_name' => 'attacker',
        ])->assertStatus(422);
    }

    public function test_a_synced_staff_row_with_an_already_hashed_pin_also_gets_no_password(): void
    {
        $newUserId = (string) Str::uuid();

        $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'users',
                'operation' => 'INSERT',
                'record_id' => $newUserId,
                'payload' => [
                    'id' => $newUserId,
                    'first_name' => 'Hashed', 'last_name' => 'Pin',
                    'username' => 'hashedpin',
                    'email' => 'hashedpin@local.dumosrx.com',
                    'role' => 'sales_staff',
                    'store_id' => $this->store->id,
                    'pin' => Hash::make('9999'),
                ],
            ]],
        ])->assertStatus(200);

        $staff = User::find($newUserId);
        $this->assertNotNull($staff);
        $this->assertNull($staff->password);
    }

    // ---------------------------------------------------------------
    // The POS's own staff auth flow must be untouched
    // ---------------------------------------------------------------

    /**
     * The POS verifies a staff PIN entirely client-side against the bcrypt
     * hash the pull ships down; it never calls `/login` for staff. This is
     * the server half of that flow, and it must keep working for an account
     * that now has no password at all.
     */
    public function test_the_pos_still_receives_a_password_less_staff_members_pin_hash(): void
    {
        $this->actingAs($this->owner)->postJson('/api/v1/staff', [
            'first_name' => 'Pos', 'last_name' => 'Staff',
            'username' => 'posstaff', 'role' => 'sales_staff',
            'pin' => '2468', 'store_id' => $this->store->id,
        ])->assertStatus(201);

        $staff = User::where('username', 'posstaff')->firstOrFail();
        $this->assertNull($staff->password);

        $response = $this->actingAs($this->owner)
            ->postJson('/api/v1/app/sync/pull', ['last_synced' => [], 'setup' => 0]);

        $response->assertStatus(200);

        $row = collect($response->json('changes.users'))->firstWhere('id', $staff->id);

        $this->assertNotNull($row, 'The staff row must still reach the device.');
        $this->assertTrue(
            Hash::check('2468', $row['pin']),
            'Offline PIN login depends on this hash reaching the device intact.',
        );
    }

    /**
     * The owner's own account is a real, password-backed one and is the only
     * thing the POS ever sends to `/login` (linkCloudAccount in
     * auth-context.tsx). Unchanged by this fix.
     */
    public function test_the_store_owners_cloud_login_is_unaffected(): void
    {
        $response = $this->postJson('/api/v1/login', [
            'email' => 'pinpw-owner@dumosrx.com',
            'password' => 'password',
            'device_name' => 'DumosRx Desktop',
        ]);

        $response->assertStatus(200);
        $response->assertJsonStructure(['token']);
    }
}
