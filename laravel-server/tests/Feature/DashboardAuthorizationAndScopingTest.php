<?php

namespace Tests\Feature;

use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class DashboardAuthorizationAndScopingTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store1;

    protected Store $store2;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Boss',
            'email' => 'owner@example.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store1 = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Store Alpha',
            'device_id' => 'DEV-ALPHA-1',
        ]);

        $this->store2 = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Store Beta',
            'device_id' => 'DEV-BETA-1',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    #[Test]
    public function sales_staff_without_reporting_permission_is_forbidden_from_dashboard_summary(): void
    {
        $cashier = User::create([
            'first_name' => 'Cashier',
            'last_name' => 'User',
            'email' => 'cashier@example.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store1->id,
        ]);

        $token = $cashier->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/summary');

        $response->assertStatus(403);
        $response->assertJson([
            'error' => 'Forbidden',
            'message' => 'You do not have permission to view store financial reports and statistics.',
        ]);
    }

    #[Test]
    public function sales_staff_without_reporting_permission_is_forbidden_from_dashboard_stats(): void
    {
        $cashier = User::create([
            'first_name' => 'Cashier',
            'last_name' => 'User',
            'email' => 'cashier-stats@example.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store1->id,
        ]);

        $token = $cashier->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/stats');

        $response->assertStatus(403);
    }

    #[Test]
    public function sales_staff_without_reporting_permission_is_forbidden_from_widget_snapshot(): void
    {
        $cashier = User::create([
            'first_name' => 'Cashier',
            'last_name' => 'User',
            'email' => 'cashier-widget@example.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store1->id,
        ]);

        $token = $cashier->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/widget-snapshot');

        $response->assertStatus(403);
    }

    #[Test]
    public function specialist_without_reporting_permission_is_forbidden(): void
    {
        $specialist = User::create([
            'first_name' => 'Specialist',
            'last_name' => 'User',
            'email' => 'specialist@example.com',
            'password' => bcrypt('password'),
            'role' => 'specialist',
            'store_id' => $this->store1->id,
        ]);

        $token = $specialist->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/summary');

        $response->assertStatus(403);
    }

    #[Test]
    public function store_manager_is_scoped_strictly_to_their_assigned_store(): void
    {
        $manager = User::create([
            'first_name' => 'Store',
            'last_name' => 'Manager',
            'email' => 'manager@example.com',
            'password' => bcrypt('password'),
            'role' => 'manager',
            'store_id' => $this->store1->id,
        ]);

        // Sale on Store 1 (assigned to manager)
        $sale1 = Sale::create([
            'cashier_id' => $manager->id,
            'subtotal' => 10000,
            'total_amount' => 10000,
            'amount_paid' => 10000,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'transaction_date' => now(),
        ]);
        $sale1->store_id = $this->store1->id;
        $sale1->save();

        // Sale on Store 2 (different branch)
        $sale2 = Sale::create([
            'cashier_id' => $this->owner->id,
            'subtotal' => 25000,
            'total_amount' => 25000,
            'amount_paid' => 25000,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'transaction_date' => now(),
        ]);
        $sale2->store_id = $this->store2->id;
        $sale2->save();

        $token = $manager->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/summary');

        $response->assertStatus(200);
        $response->assertJsonPath('stats.total_sales.value', 10000);
        $response->assertJsonCount(1, 'stores');
        $response->assertJsonPath('stores.0.id', $this->store1->id);
        $response->assertJsonPath('stores.0.name', 'Store Alpha');
    }

    #[Test]
    public function store_owner_sees_all_stores_and_aggregated_sales(): void
    {
        // Sale on Store 1
        $sale1 = Sale::create([
            'cashier_id' => $this->owner->id,
            'subtotal' => 10000,
            'total_amount' => 10000,
            'amount_paid' => 10000,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'transaction_date' => now(),
        ]);
        $sale1->store_id = $this->store1->id;
        $sale1->save();

        // Sale on Store 2
        $sale2 = Sale::create([
            'cashier_id' => $this->owner->id,
            'subtotal' => 25000,
            'total_amount' => 25000,
            'amount_paid' => 25000,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'transaction_date' => now(),
        ]);
        $sale2->store_id = $this->store2->id;
        $sale2->save();

        $token = $this->owner->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/summary');

        $response->assertStatus(200);
        $response->assertJsonPath('stats.total_sales.value', 35000);
        $response->assertJsonCount(2, 'stores');
    }

    #[Test]
    public function sales_staff_with_explicit_view_reports_grant_is_allowed(): void
    {
        $cashierWithReports = User::create([
            'first_name' => 'Auditing',
            'last_name' => 'Cashier',
            'email' => 'auditing-cashier@example.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store1->id,
        ]);

        $permission = \App\Models\Permission::create([
            'name' => 'View Reports',
            'slug' => 'view_reports',
            'description' => 'Can view reports',
        ]);
        $cashierWithReports->permissions()->attach($permission->id, ['granted' => true]);

        $token = $cashierWithReports->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/summary');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'stores');
        $response->assertJsonPath('stores.0.id', $this->store1->id);
    }

    #[Test]
    public function owner_with_legacy_poisoned_store_id_still_sees_all_owned_stores(): void
    {
        $this->owner->store_id = $this->store1->id;
        $this->owner->save();

        $token = $this->owner->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/summary');

        $response->assertStatus(200);
        $response->assertJsonCount(2, 'stores');
    }

    #[Test]
    public function staff_with_permission_group_granting_view_reports_is_allowed(): void
    {
        $group = \App\Models\PermissionGroup::create([
            'store_id' => $this->store1->id,
            'name' => 'Custom Reporting Group',
            'based_on_role' => 'sales_staff',
            'permissions' => ['process_sales', 'view_reports'],
        ]);

        $cashier = User::create([
            'first_name' => 'Reporting',
            'last_name' => 'Cashier',
            'email' => 'reporting-cashier@example.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store1->id,
            'permission_group_id' => $group->id,
        ]);

        $token = $cashier->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/summary');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'stores');
        $response->assertJsonPath('stores.0.id', $this->store1->id);
    }

    #[Test]
    public function manager_with_restricted_permission_group_is_forbidden(): void
    {
        $group = \App\Models\PermissionGroup::create([
            'store_id' => $this->store1->id,
            'name' => 'Restricted Manager Group',
            'based_on_role' => 'manager',
            'permissions' => ['process_sales', 'manage_inventory'], // no view_reports or view_financial_reports
        ]);

        $restrictedManager = User::create([
            'first_name' => 'Restricted',
            'last_name' => 'Manager',
            'email' => 'restricted-manager@example.com',
            'password' => bcrypt('password'),
            'role' => 'manager',
            'store_id' => $this->store1->id,
            'permission_group_id' => $group->id,
        ]);

        $token = $restrictedManager->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/dashboard/summary');

        $response->assertStatus(403);
    }
}
