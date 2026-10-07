<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Admin\AdminSubscriptionLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Grace is resolved in PHP by design, so every bucket costs queries per
 * owner. The budget here is what keeps that from growing with the number of
 * buckets an owner happens to land in: a request must resolve each owner's
 * state once, not once per bucket and twice per resolution. See
 * laravel-server/AGENTS.md, "Subscription lifecycle".
 */
class AdminSubscriptionQueryBudgetTest extends TestCase
{
    use RefreshDatabase;

    private const OWNERS = 60;

    private const BUDGET = 250;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['grace_period_days' => 3]);
    }

    private function lapsedOwner(): void
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Store::create([
            'user_id' => $owner->id,
            'name' => 'Store '.uniqid(),
            'device_id' => 'DESKTOP-'.strtoupper(uniqid()),
            'currency' => 'NGN',
        ]);

        Subscription::create([
            'user_id' => $owner->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
            'start_date' => now()->subDays(60),
            'end_date' => now()->subDays(10),
            'license_key' => 'LIC-'.uniqid(),
        ]);
    }

    public function test_figures_resolves_each_owner_once_rather_than_once_per_bucket(): void
    {
        for ($i = 0; $i < self::OWNERS; $i++) {
            $this->lapsedOwner();
        }

        DB::enableQueryLog();
        app(AdminSubscriptionLifecycleService::class)->figures(30);
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertLessThan(
            self::BUDGET,
            $queries,
            self::OWNERS." lapsed owners cost {$queries} queries; the per-owner state must be resolved once per request"
        );
    }
}
