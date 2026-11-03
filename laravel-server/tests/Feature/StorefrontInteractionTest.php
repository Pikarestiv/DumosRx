<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\OnlineOrder;
use App\Models\OnlineOrderItem;
use App\Models\Product;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StorefrontInteractionTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;
    private Store $store;
    private Storefront $storefront;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'enterprise' => ['features' => ['store_url' => true]],
                'free' => ['features' => ['store_url' => true]],
            ],
        ]);

        $this->owner = User::create([
            'first_name' => 'John',
            'last_name' => 'Owner',
            'email' => 'interaction-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Subscription::create([
            'user_id' => $this->owner->id,
            'plan_name' => 'enterprise',
            'status' => 'active',
            'license_key' => 'LIC-'.uniqid(),
            'start_date' => now()->subMonth(),
            'end_date' => now()->addMonth(),
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Apex Pharmacy',
            'store_slug' => 'apex-pharmacy',
            'online_store_enabled' => true,
            'currency' => 'NGN',
            'device_id' => 'APEX-DEV-01',
        ]);

        $this->storefront = Storefront::create([
            'user_id' => $this->owner->id,
            'slug' => 'apex',
            'name' => 'Apex Healthcare',
            'primary_store_id' => $this->store->id,
        ]);
    }

    public function test_can_track_order_by_order_id_with_masked_customer_name(): void
    {
        $product = Product::create([
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'name' => 'Vitamin C 1000mg',
            'selling_price' => 1200,
            'show_online' => true,
            'is_active' => true,
            'is_controlled' => false,
        ]);

        $order = OnlineOrder::create([
            'store_id' => $this->store->id,
            'customer_name' => 'Alexander Hamilton',
            'customer_phone' => '08012345678',
            'total_amount' => 2400,
            'payment_method' => 'in_store',
            'payment_status' => 'pending',
            'order_status' => 'pending',
            'paystack_reference' => 'PAY-REF-12345',
        ]);

        $order->items()->create([
            'product_id' => $product->id,
            'quantity' => 2,
            'unit_price' => 1200,
            'subtotal' => 2400,
        ]);

        // Track by order id
        $resById = $this->getJson("/api/v1/storefront/apex/orders/{$order->id}");
        $resById->assertOk()
            ->assertJsonPath('order.id', $order->id)
            ->assertJsonPath('order.order_status', 'pending')
            ->assertJsonPath('order.payment_method', 'in_store')
            ->assertJsonPath('order.branch_name', 'Apex Pharmacy')
            ->assertJsonPath('order.customer_name', 'A*******r H******n')
            ->assertJsonPath('order.items.0.product_name', 'Vitamin C 1000mg')
            ->assertJsonPath('order.items.0.quantity', 2);

        // Track by payment reference
        $resByRef = $this->getJson('/api/v1/storefront/apex/orders/PAY-REF-12345');
        $resByRef->assertOk()
            ->assertJsonPath('order.id', $order->id);
    }

    public function test_tracking_nonexistent_order_returns_404(): void
    {
        $res = $this->getJson('/api/v1/storefront/apex/orders/NONEXISTENT-ORDER-ID');
        $res->assertNotFound();
    }

    public function test_can_upload_prescription_and_creates_staff_notification(): void
    {
        Storage::fake('public');

        $file = UploadedFile::fake()->create('my_prescription.pdf', 500, 'application/pdf');

        $payload = [
            'customer_name' => 'Sarah Connor',
            'customer_phone' => '08098765432',
            'notes' => 'Urgent for hypertension medication refill',
            'prescription_file' => $file,
        ];

        $res = $this->postJson('/api/v1/storefront/apex/prescriptions', $payload);
        $res->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['prescription_number', 'message']);

        $rxNumber = $res->json('prescription_number');
        $this->assertDatabaseHas('storefront_prescriptions', [
            'prescription_number' => $rxNumber,
            'customer_name' => 'Sarah Connor',
            'customer_phone' => '08098765432',
            'status' => 'pending',
        ]);

        $this->assertDatabaseHas('notifications', [
            'type' => 'online_prescription',
        ]);
    }
}
