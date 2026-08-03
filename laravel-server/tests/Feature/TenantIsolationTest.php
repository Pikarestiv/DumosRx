<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the tenant-scoping fixes to Category/Supplier/
 * Product/Customer: before the fix, index/show/store had no user_id
 * scoping at all (any authenticated user could see every store's data
 * through these endpoints), and staff accounts specifically couldn't see
 * their own store owner's data because scoping (where it existed at all,
 * for Customer) used the staff member's own id instead of resolving to the
 * store owner via ScopesToTenant.
 */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    protected User $ownerA;
    protected User $staffA;
    protected User $ownerB;
    protected Store $storeA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->ownerA = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'ownerA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->storeA = Store::create([
            'user_id' => $this->ownerA->id,
            'name' => 'Store A',
            'store_slug' => 'store-a',
            'device_id' => 'WEB-A',
        ]);

        $this->staffA = User::create([
            'first_name' => 'Staff', 'last_name' => 'A',
            'email' => 'staffA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->storeA->id,
        ]);

        $this->ownerB = User::create([
            'first_name' => 'Owner', 'last_name' => 'B',
            'email' => 'ownerB@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Store::create([
            'user_id' => $this->ownerB->id,
            'name' => 'Store B',
            'store_slug' => 'store-b',
            'device_id' => 'WEB-B',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    // ---- Categories ----

    public function test_staff_can_see_their_store_owners_categories()
    {
        Category::create(['name' => 'Analgesics', 'user_id' => $this->ownerA->id]);

        $response = $this->actingAs($this->staffA)->getJson('/api/v1/app/categories');

        $response->assertStatus(200);
        $response->assertJsonCount(1);
        $response->assertJsonFragment(['name' => 'Analgesics']);
    }

    public function test_category_index_excludes_other_stores_categories()
    {
        Category::create(['name' => 'Owner A Category', 'user_id' => $this->ownerA->id]);
        Category::create(['name' => 'Owner B Category', 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->ownerA)->getJson('/api/v1/app/categories');

        $response->assertStatus(200);
        $response->assertJsonCount(1);
        $response->assertJsonMissing(['name' => 'Owner B Category']);
    }

    public function test_category_show_404s_for_another_stores_category()
    {
        $foreign = Category::create(['name' => 'Owner B Category', 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/app/categories/{$foreign->id}");

        $response->assertStatus(404);
    }

    public function test_category_update_404s_for_another_stores_category()
    {
        $foreign = Category::create(['name' => 'Owner B Category', 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->ownerA)
            ->putJson("/api/v1/app/categories/{$foreign->id}", ['name' => 'Hijacked']);

        $response->assertStatus(404);
        $this->assertDatabaseHas('categories', ['id' => $foreign->id, 'name' => 'Owner B Category']);
    }

    public function test_category_destroy_404s_for_another_stores_category()
    {
        $foreign = Category::create(['name' => 'Owner B Category', 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->ownerA)->deleteJson("/api/v1/app/categories/{$foreign->id}");

        $response->assertStatus(404);
        $this->assertDatabaseHas('categories', ['id' => $foreign->id, 'deleted_at' => null]);
    }

    public function test_category_store_assigns_owner_not_caller()
    {
        $response = $this->actingAs($this->staffA)
            ->postJson('/api/v1/app/categories', ['name' => 'Vitamins']);

        $response->assertStatus(201);
        $this->assertDatabaseHas('categories', ['name' => 'Vitamins', 'user_id' => $this->ownerA->id]);
    }

    // ---- Suppliers ----

    public function test_supplier_index_excludes_other_stores_suppliers()
    {
        Supplier::create(['name' => 'Owner A Supplier', 'user_id' => $this->ownerA->id]);
        Supplier::create(['name' => 'Owner B Supplier', 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->staffA)->getJson('/api/v1/app/suppliers');

        $response->assertStatus(200);
        $response->assertJsonCount(1);
        $response->assertJsonMissing(['name' => 'Owner B Supplier']);
    }

    public function test_supplier_show_404s_for_another_stores_supplier()
    {
        $foreign = Supplier::create(['name' => 'Owner B Supplier', 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/app/suppliers/{$foreign->id}");

        $response->assertStatus(404);
    }

    public function test_supplier_destroy_404s_for_another_stores_supplier()
    {
        $foreign = Supplier::create(['name' => 'Owner B Supplier', 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->ownerA)->deleteJson("/api/v1/app/suppliers/{$foreign->id}");

        $response->assertStatus(404);
    }

    // ---- Products ----

    public function test_product_index_excludes_other_stores_products()
    {
        Product::create(['name' => 'Owner A Drug', 'selling_price' => 100, 'is_active' => true, 'user_id' => $this->ownerA->id]);
        Product::create(['name' => 'Owner B Drug', 'selling_price' => 100, 'is_active' => true, 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->staffA)->getJson('/api/v1/app/products');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $response->assertJsonMissing(['name' => 'Owner B Drug']);
    }

    public function test_product_search_excludes_other_stores_products()
    {
        Product::create(['name' => 'Panadol Extra', 'selling_price' => 100, 'is_active' => true, 'user_id' => $this->ownerA->id]);
        Product::create(['name' => 'Panadol Advance', 'selling_price' => 100, 'is_active' => true, 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->staffA)->getJson('/api/v1/app/products/search?q=Panadol');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $response->assertJsonMissing(['name' => 'Panadol Advance']);
    }

    public function test_product_show_404s_for_another_stores_product()
    {
        $foreign = Product::create(['name' => 'Owner B Drug', 'selling_price' => 100, 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/app/products/{$foreign->id}");

        $response->assertStatus(404);
    }

    public function test_product_update_404s_for_another_stores_product()
    {
        $foreign = Product::create(['name' => 'Owner B Drug', 'selling_price' => 100, 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->ownerA)
            ->putJson("/api/v1/app/products/{$foreign->id}", ['selling_price' => 1]);

        $response->assertStatus(404);
        $this->assertDatabaseHas('products', ['id' => $foreign->id, 'selling_price' => 100]);
    }

    public function test_product_store_assigns_owner_not_caller()
    {
        $response = $this->actingAs($this->staffA)
            ->postJson('/api/v1/app/products', ['name' => 'Amoxicillin', 'selling_price' => 500]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('products', ['name' => 'Amoxicillin', 'user_id' => $this->ownerA->id]);
    }

    // ---- Customers ----

    public function test_staff_can_see_their_store_owners_customers()
    {
        // This is the specific bug that existed even where scoping was
        // present at all: index() used $request->user()->id directly, so a
        // staff member (store_id set, but a different own id) saw nothing.
        Customer::create(['first_name' => 'Jane', 'last_name' => 'Doe', 'user_id' => $this->ownerA->id]);

        $response = $this->actingAs($this->staffA)->getJson('/api/v1/app/customers');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
    }

    public function test_customer_index_excludes_other_stores_customers()
    {
        Customer::create(['first_name' => 'Owner A', 'last_name' => 'Customer', 'user_id' => $this->ownerA->id]);
        Customer::create(['first_name' => 'Owner B', 'last_name' => 'Customer', 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->ownerA)->getJson('/api/v1/app/customers');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
    }

    public function test_customer_show_returns_sales_relation_without_error()
    {
        // Customer::show() eager-loads `sales`, which didn't exist as a
        // relation on the model at all before the fix.
        $customer = Customer::create(['first_name' => 'Jane', 'last_name' => 'Doe', 'user_id' => $this->ownerA->id]);

        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/app/customers/{$customer->id}");

        $response->assertStatus(200);
    }

    public function test_customer_show_404s_for_another_stores_customer()
    {
        $foreign = Customer::create(['first_name' => 'Owner B', 'last_name' => 'Customer', 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/app/customers/{$foreign->id}");

        $response->assertStatus(404);
    }

    public function test_customer_destroy_404s_for_another_stores_customer()
    {
        $foreign = Customer::create(['first_name' => 'Owner B', 'last_name' => 'Customer', 'user_id' => $this->ownerB->id]);

        $response = $this->actingAs($this->ownerA)->deleteJson("/api/v1/app/customers/{$foreign->id}");

        $response->assertStatus(404);
    }

    public function test_customer_store_assigns_owner_not_caller()
    {
        $response = $this->actingAs($this->staffA)
            ->postJson('/api/v1/app/customers', ['first_name' => 'New', 'last_name' => 'Customer']);

        $response->assertStatus(201);
        $this->assertDatabaseHas('customers', ['first_name' => 'New', 'user_id' => $this->ownerA->id]);
    }
}
