<?php

namespace Tests\Feature;

use App\Models\License;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-87: POST /subscription/verify-license is authenticated but used to be
 * unauthorised — any user could present a stranger's license key, register
 * their own machine against it and be told `valid: true, plan: enterprise`.
 */
class VerifyLicenseOwnershipTest extends TestCase
{
    use RefreshDatabase;

    protected User $victim;

    protected User $attacker;

    protected Subscription $subscription;

    protected function setUp(): void
    {
        parent::setUp();

        $this->victim = User::create([
            'first_name' => 'Paid', 'last_name' => 'Owner',
            'email' => 'paid-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        Store::create([
            'user_id' => $this->victim->id, 'name' => 'Paid Pharmacy', 'device_id' => 'DEV-LIC-1',
        ]);

        $this->attacker = User::create([
            'first_name' => 'Free', 'last_name' => 'Rider',
            'email' => 'free-rider@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        Store::create([
            'user_id' => $this->attacker->id, 'name' => 'Free Pharmacy', 'device_id' => 'DEV-LIC-2',
        ]);

        $this->subscription = Subscription::create([
            'user_id' => $this->victim->id,
            'plan_name' => 'enterprise',
            'status' => 'active',
            'start_date' => now()->subMonth(),
            'end_date' => now()->addMonth(),
            'amount' => 50000,
            'license_key' => 'DUMOS-ENT-0001',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function verifyAs(User $user, array $payload = [])
    {
        return $this->actingAs($user)->postJson('/api/v1/subscription/verify-license', array_merge([
            'license_key' => 'DUMOS-ENT-0001',
            'machine_id' => 'MACHINE-'.$user->id,
        ], $payload));
    }

    #[Test]
    public function a_stranger_cannot_verify_someone_elses_license_key()
    {
        $this->verifyAs($this->attacker)
            ->assertStatus(404)
            ->assertJsonPath('valid', false);
    }

    #[Test]
    public function a_stranger_registers_no_device_against_someone_elses_subscription()
    {
        $this->verifyAs($this->attacker);

        $this->assertSame(0, License::where('subscription_id', $this->subscription->id)->count());
    }

    #[Test]
    public function the_owner_can_still_verify_their_own_license_key()
    {
        $this->verifyAs($this->victim)
            ->assertStatus(200)
            ->assertJsonPath('valid', true)
            ->assertJsonPath('plan', 'enterprise');

        $this->assertSame(1, License::where('subscription_id', $this->subscription->id)->count());
    }

    #[Test]
    public function the_owners_staff_can_verify_the_stores_license_key()
    {
        $staff = User::create([
            'first_name' => 'Till', 'last_name' => 'Staff',
            'email' => 'till-staff@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => Store::where('user_id', $this->victim->id)->value('id'),
        ]);

        $this->verifyAs($staff)
            ->assertStatus(200)
            ->assertJsonPath('valid', true);
    }

    #[Test]
    public function a_deactivated_device_is_refused_without_stamping_a_check_in()
    {
        License::create([
            'subscription_id' => $this->subscription->id,
            'machine_id' => 'MACHINE-'.$this->victim->id,
            'machine_name' => 'Old Till',
            'is_active' => false,
        ]);

        $this->verifyAs($this->victim)
            ->assertStatus(403)
            ->assertJsonPath('valid', false);

        $this->assertNull(License::where('machine_id', 'MACHINE-'.$this->victim->id)->value('last_check_in'));
    }
}
