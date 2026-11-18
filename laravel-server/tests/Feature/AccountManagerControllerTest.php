<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\AccountManagerController;
use App\Http\Controllers\Api\Admin\AdminStoreController;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use OpenApi\Attributes\Get;
use OpenApi\Attributes\Put;
use PHPUnit\Framework\Attributes\Test;
use ReflectionMethod;
use Tests\TestCase;

class AccountManagerControllerTest extends TestCase
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

    #[Test]
    public function it_returns_null_when_no_account_manager_is_resolved(): void
    {
        $owner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Store::create([
            'name' => 'Owner Store',
            'user_id' => $owner->id,
            'device_id' => 'DEV-001',
        ]);

        $response = $this->actingAs($owner)->getJson('/api/v1/account-manager');

        $response->assertOk()
            ->assertJson(['data' => null]);
    }

    #[Test]
    public function it_returns_the_assigned_account_manager(): void
    {
        $manager = User::create([
            'first_name' => 'Ada',
            'last_name' => 'Manager',
            'email' => 'ada@dumosrx.com',
            'phone' => '08031234567',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);

        $owner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
            'account_manager_id' => $manager->id,
        ]);

        Store::create([
            'name' => 'Owner Store',
            'user_id' => $owner->id,
            'device_id' => 'DEV-002',
        ]);

        $response = $this->actingAs($owner)->getJson('/api/v1/account-manager');

        $response->assertOk()
            ->assertJson([
                'data' => [
                    'id' => $manager->id,
                    'name' => 'Ada Manager',
                    'email' => 'ada@dumosrx.com',
                    'phone' => '08031234567',
                ],
            ]);
    }

    #[Test]
    public function openapi_summaries_use_account_manager_without_contact_specialist(): void
    {
        $showRef = new ReflectionMethod(AccountManagerController::class, 'show');
        $showAttrs = $showRef->getAttributes(Get::class);
        $showSummary = $showAttrs[0]->newInstance()->summary;

        $this->assertStringNotContainsStringIgnoringCase('contact specialist', $showSummary);
        $this->assertStringContainsStringIgnoringCase('account manager', $showSummary);

        $updateRef = new ReflectionMethod(AdminStoreController::class, 'updateAccountManager');
        $updateAttrs = $updateRef->getAttributes(Put::class);
        $updateSummary = $updateAttrs[0]->newInstance()->summary;

        $this->assertStringNotContainsStringIgnoringCase('contact specialist', $updateSummary);
        $this->assertStringContainsStringIgnoringCase('account manager', $updateSummary);

        $candidatesRef = new ReflectionMethod(AdminStoreController::class, 'accountManagerCandidates');
        $candidatesAttrs = $candidatesRef->getAttributes(Get::class);
        $candidatesSummary = $candidatesAttrs[0]->newInstance()->summary;

        $this->assertStringNotContainsStringIgnoringCase('contact specialist', $candidatesSummary);
        $this->assertStringContainsStringIgnoringCase('account manager', $candidatesSummary);
    }
}
