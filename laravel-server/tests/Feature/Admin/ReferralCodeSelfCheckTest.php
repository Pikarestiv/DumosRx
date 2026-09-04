<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coverage for the contract the "My Referrals" self-save fix
 * (web/app/admin/referrals/page.tsx handleSave) now relies on: checking a
 * user's own already-assigned referral code must report it as available to
 * *them*, or saving an unchanged code always fails as "already taken".
 * checkReferralCodeAvailable() already supported an $ignoreUserId
 * self-exclusion param — the bug was purely that the frontend call site
 * never passed it. This locks in the backend half of that contract.
 */
class ReferralCodeSelfCheckTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_checking_own_existing_code_without_self_exclusion_reports_taken(): void
    {
        $user = User::create([
            'first_name' => 'Pika',
            'last_name' => 'Admin',
            'email' => 'pika-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
        // The 'creating' hook auto-assigns a platform_referral_code for
        // this role, overriding any value passed to create() — so the
        // custom code has to be set afterward, same as a real user editing
        // their auto-assigned code via "My Referrals".
        $user->update(['platform_referral_code' => 'pikarestiv']);

        $response = $this->actingAs($user)
            ->getJson('/api/v1/admin/referral-code/check?code=pikarestiv');

        $response->assertOk();
        $response->assertJson(['available' => false, 'code' => 'pikarestiv']);
    }

    public function test_checking_own_existing_code_with_self_exclusion_reports_available(): void
    {
        $user = User::create([
            'first_name' => 'Pika',
            'last_name' => 'Admin',
            'email' => 'pika-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
        $user->update(['platform_referral_code' => 'pikarestiv']);

        $response = $this->actingAs($user)
            ->getJson('/api/v1/admin/referral-code/check?code=pikarestiv&user_id='.$user->id);

        $response->assertOk();
        $response->assertJson(['available' => true, 'code' => 'pikarestiv']);
    }

    public function test_someone_elses_code_is_still_reported_taken_even_with_self_exclusion(): void
    {
        $other = User::create([
            'first_name' => 'Other',
            'last_name' => 'Admin',
            'email' => 'other-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
        $other->update(['platform_referral_code' => 'takenname']);

        $user = User::create([
            'first_name' => 'Pika',
            'last_name' => 'Admin',
            'email' => 'pika-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
        $user->update(['platform_referral_code' => 'pikarestiv']);

        $response = $this->actingAs($user)
            ->getJson('/api/v1/admin/referral-code/check?code=takenname&user_id='.$user->id);

        $response->assertOk();
        $response->assertJson(['available' => false, 'code' => 'takenname']);
    }
}
