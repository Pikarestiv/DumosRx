<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Store;
use App\Models\Subscription;
use App\Models\User;
use App\Services\Admin\AdminSummaryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminSummaryMetricHonestyTest extends TestCase
{
    use RefreshDatabase;

    private function summary(): array
    {
        return app(AdminSummaryService::class)->getGlobalSummary();
    }

    private function statNamed(array $summary, string $name): array
    {
        foreach ($summary['stats'] as $stat) {
            if ($stat['name'] === $name) {
                return $stat;
            }
        }

        $this->fail("No stat named {$name}");
    }

    private function makeUser(string $role = 'store_owner'): User
    {
        return User::create([
            'first_name' => 'Test',
            'last_name' => ucfirst($role),
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    private function makeStore(?Carbon $lastSyncAt = null): Store
    {
        return Store::create([
            'name' => 'Store '.uniqid(),
            'user_id' => $this->makeUser()->id,
            'device_id' => 'DESKTOP-'.strtoupper(uniqid()),
            'currency' => 'NGN',
            'last_sync_at' => $lastSyncAt,
        ]);
    }

    private function logAction(string $action, Carbon $createdAt): void
    {
        $log = ActivityLog::create([
            'user_id' => $this->makeUser()->id,
            'action' => $action,
            'description' => 'x',
            'status' => 'success',
        ]);

        DB::table('activity_logs')->where('id', $log->id)->update([
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ]);
    }

    public function test_revenue_stat_reports_subscription_revenue_per_currency_not_tenant_gmv(): void
    {
        $stat = $this->statNamed($this->summary(), 'Subscription Revenue');

        $this->assertArrayHasKey('totals_by_currency', $stat);
        $this->assertArrayNotHasKey('change', $stat);
        $this->assertArrayNotHasKey('trend', $stat);
    }

    public function test_no_stat_claims_to_measure_global_inventory(): void
    {
        $names = array_column($this->summary()['stats'], 'name');

        $this->assertNotContains('Global Inventory', $names);
        $this->assertNotContains('Platform Revenue', $names);
        $this->assertContains('Catalog Products', $names);
    }

    public function test_catalog_product_stat_is_a_raw_count_not_divided_by_a_thousand(): void
    {
        Product::create(['name' => 'Paracetamol']);
        Product::create(['name' => 'Ibuprofen']);

        $this->assertSame('2', $this->statNamed($this->summary(), 'Catalog Products')['value']);
    }

    public function test_live_operations_drops_the_fabricated_websocket_metric(): void
    {
        $operations = $this->summary()['live_operations'];

        $this->assertArrayNotHasKey('active_connections', $operations);
        $this->assertArrayHasKey('audit_log_entries', $operations);
    }

    public function test_sync_success_rate_is_null_when_there_is_no_sync_activity_in_the_window(): void
    {
        $this->assertNull($this->summary()['live_operations']['sync_success_rate_24h']);
    }

    public function test_sync_success_rate_only_counts_the_last_24_hours(): void
    {
        $this->logAction('SYNC_SUCCESS', now()->subDays(3));
        $this->logAction('SYNC_SUCCESS', now()->subHour());
        $this->logAction('SYNC_FAILURE', now()->subHour());

        $this->assertSame('50%', $this->summary()['live_operations']['sync_success_rate_24h']);
    }

    public function test_count_stats_report_an_absolute_weekly_delta(): void
    {
        $this->assertSame('+0 this week', $this->statNamed($this->summary(), 'Total Stores')['change']);
    }

    public function test_weekly_delta_counts_only_rows_created_in_the_last_seven_days(): void
    {
        $this->makeStore();
        $old = $this->makeStore();
        DB::table('stores')->where('id', $old->id)->update(['created_at' => now()->subDays(30)]);

        $this->assertSame('+1 this week', $this->statNamed($this->summary(), 'Total Stores')['change']);
    }

    private function subscribe(User $user, array $attributes = []): Subscription
    {
        return Subscription::create(array_merge([
            'user_id' => $user->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
            'start_date' => now()->subMonth(),
            'end_date' => now()->addMonth(),
            'license_key' => 'LIC-'.uniqid(),
        ], $attributes));
    }

    public function test_it_reports_active_subscriptions(): void
    {
        $this->subscribe($this->makeUser());

        $this->assertSame('1', $this->statNamed($this->summary(), 'Active Subscriptions')['value']);
    }

    /**
     * The reported reproduction: one store owner showed 7. Nothing flips a
     * subscription to 'expired' when its end_date passes, so every historical
     * row an owner ever held still reads status='active' and a row count
     * reports the owner once per subscription they have ever had.
     */
    public function test_active_subscriptions_counts_distinct_owners_not_subscription_rows(): void
    {
        $owner = $this->makeUser();
        $this->subscribe($owner, ['end_date' => now()->subYear(), 'start_date' => now()->subYears(2)]);
        $this->subscribe($owner, ['end_date' => now()->subMonths(6), 'start_date' => now()->subYear()]);
        $this->subscribe($owner);

        $this->assertSame('1', $this->statNamed($this->summary(), 'Active Subscriptions')['value']);
    }

    public function test_active_subscriptions_excludes_an_owner_whose_subscription_has_lapsed(): void
    {
        $this->subscribe($this->makeUser(), ['end_date' => now()->subDay()]);

        $this->assertSame('0', $this->statNamed($this->summary(), 'Active Subscriptions')['value']);
    }

    public function test_active_subscriptions_excludes_trials_and_reports_them_on_the_sub_line(): void
    {
        $this->subscribe($this->makeUser());
        $this->subscribe($this->makeUser(), ['is_trial' => true]);
        $this->subscribe($this->makeUser(), ['is_trial' => true]);

        $stat = $this->statNamed($this->summary(), 'Active Subscriptions');

        $this->assertSame('1', $stat['value']);
        $this->assertSame('2 on trial', $stat['change']);
    }

    public function test_active_users_counts_store_owners_only(): void
    {
        $this->makeUser('store_owner');
        $this->makeUser('store_owner');
        $this->makeUser('platform_admin');
        $this->makeUser('agent');
        $this->makeUser('super_admin');
        $this->makeUser('manager');
        $this->makeUser('sales_staff');

        $this->assertSame('2', $this->statNamed($this->summary(), 'Active Users')['value']);
    }

    public function test_active_users_reports_store_staff_on_the_sub_line(): void
    {
        $this->makeUser('store_owner');
        $this->makeUser('admin');
        $this->makeUser('manager');
        $this->makeUser('specialist');
        $this->makeUser('sales_staff');
        $this->makeUser('auditor');
        $this->makeUser('platform_admin');

        $this->assertSame('5 staff', $this->statNamed($this->summary(), 'Active Users')['change']);
    }

    public function test_active_users_ignores_deactivated_accounts(): void
    {
        $this->makeUser('store_owner');
        $this->makeUser('store_owner')->forceFill(['is_active' => false])->save();

        $this->assertSame('1', $this->statNamed($this->summary(), 'Active Users')['value']);
    }

    public function test_it_counts_only_stores_synced_within_the_last_day(): void
    {
        $this->makeStore(now()->subHour());
        $this->makeStore(now()->subDays(5));
        $this->makeStore(null);

        $this->assertSame('1', $this->statNamed($this->summary(), 'Stores Synced (24h)')['value']);
    }
}
