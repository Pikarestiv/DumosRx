<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-83: the dashboard summary's `staff` array must contain staff only.
 * `referred_by_id` points at an unrelated store owner who signed up through
 * the caller's referral link, so including it leaked another tenant's email.
 */
class DashboardStaffScopingTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Referring', 'last_name' => 'Owner',
            'email' => 'referring-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Referrer Pharmacy', 'device_id' => 'DEV-REF-1',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function summaryStaffEmails(): array
    {
        $token = $this->owner->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/summary');

        $response->assertStatus(200);

        return collect($response->json('staff') ?? [])->pluck('email')->all();
    }

    #[Test]
    public function a_referred_store_owner_is_not_listed_as_staff()
    {
        $referredOwner = User::create([
            'first_name' => 'Referred', 'last_name' => 'Owner',
            'email' => 'referred-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'referred_by_id' => $this->owner->id,
        ]);
        Store::create([
            'user_id' => $referredOwner->id,
            'name' => 'Referred Pharmacy', 'device_id' => 'DEV-REF-2',
        ]);

        $this->assertNotContains('referred-owner@dumosrx.com', $this->summaryStaffEmails());
    }

    #[Test]
    public function genuine_staff_of_the_callers_store_are_still_listed()
    {
        User::create([
            'first_name' => 'Real', 'last_name' => 'Staff',
            'email' => 'real-staff@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        $this->assertContains('real-staff@dumosrx.com', $this->summaryStaffEmails());
    }
}
