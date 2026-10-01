<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\SubscriptionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Registration's user+store+trial creation is one DB transaction, so a
 * mid-flight failure (e.g. a timeout, or trial creation throwing) can't
 * leave an orphaned user row with no store - which previously made the
 * account permanently stuck (every retry 422s "email already taken", and
 * the client's cloud-restore path also dead-ends with "no stores found").
 */
class RegistrationTransactionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();

        $this->withoutMiddleware([
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_a_failure_after_user_creation_rolls_back_the_whole_registration(): void
    {
        $this->app->bind(SubscriptionService::class, function () {
            return new class extends SubscriptionService {
                public function createTrial(User $user)
                {
                    throw new \RuntimeException('simulated trial-creation failure');
                }
            };
        });

        $response = $this->postJson('/api/v1/register', [
            'first_name' => 'New',
            'last_name' => 'Owner',
            'email' => 'rolled-back@dumosrx.com',
            'password' => 'password123',
            'store_name' => 'Rolled Back Pharmacy',
        ]);

        $response->assertStatus(500);
        $this->assertDatabaseMissing('users', ['email' => 'rolled-back@dumosrx.com']);
        $this->assertDatabaseMissing('stores', ['name' => 'Rolled Back Pharmacy']);
    }

    public function test_a_normal_registration_still_commits_user_store_and_trial_together(): void
    {
        $response = $this->postJson('/api/v1/register', [
            'first_name' => 'New',
            'last_name' => 'Owner',
            'email' => 'committed@dumosrx.com',
            'password' => 'password123',
            'store_name' => 'Committed Pharmacy',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('users', ['email' => 'committed@dumosrx.com']);
        $this->assertDatabaseHas('stores', ['name' => 'Committed Pharmacy']);
        $user = User::where('email', 'committed@dumosrx.com')->firstOrFail();
        $this->assertDatabaseHas('subscriptions', ['user_id' => $user->id, 'is_trial' => true]);
    }
}
