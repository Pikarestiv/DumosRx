<?php

namespace Tests\Feature;

use App\Models\PermissionGroup;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class ProductImageTest extends TestCase
{
    use RefreshDatabase;

    private const KEY_PATTERN = '#^stores/%s/products/%s/[0-9a-f-]{36}\.webp$#';

    private User $owner;

    private Store $store;

    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        config([
            'product_images.enabled' => true,
            'product_images.disk' => 'r2',
            'product_images.incoming_disk' => 'r2_incoming',
            'product_images.public_base_url' => 'https://img.example.test',
        ]);
        Storage::fake('r2');
        Storage::fake('r2_incoming');

        [$this->owner, $this->store] = $this->makeTenant('a');
        $this->product = $this->makeProduct($this->store);
    }

    /** @return array{0: User, 1: Store} */
    private function makeTenant(string $suffix): array
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => strtoupper($suffix),
            'email' => "owner-{$suffix}@dumosrx.com", 'password' => bcrypt('password'),
            'role' => 'store_owner', 'is_active' => true,
        ]);
        $store = Store::create([
            'user_id' => $owner->id, 'name' => "Store {$suffix}",
            'store_slug' => "store-{$suffix}", 'device_id' => "WEB-{$suffix}",
        ]);

        return [$owner, $store];
    }

    private function makeProduct(Store $store): Product
    {
        return Product::create([
            'id' => (string) Str::uuid(), 'name' => 'panadol', 'selling_price' => 100,
            'user_id' => $store->user_id, 'store_id' => $store->id,
        ]);
    }

    private function url(Product $product, string $suffix = ''): string
    {
        return "/api/v1/app/products/{$product->id}/image{$suffix}";
    }

    private function presign(?User $as = null, ?Product $product = null, array $body = []): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as ?? $this->owner)->postJson(
            $this->url($product ?? $this->product, '/presign'),
            $body + ['content_type' => 'image/webp', 'content_length' => 40_000],
        );
    }

    private function uploadIssuedKey(int $bytes = 40_000): string
    {
        $key = $this->presign()->assertOk()->json('key');
        Storage::disk('r2_incoming')->put($key, $this->webpBytes($bytes));

        return $key;
    }

    private function webpBytes(int $bytes): string
    {
        return str_pad("RIFF\x00\x00\x00\x00WEBPVP8 ", $bytes, "\x00");
    }

    public function test_confirm_rejects_an_object_whose_bytes_are_not_the_declared_image_type(): void
    {
        $key = $this->presign()->assertOk()->json('key');
        Storage::disk('r2_incoming')->put($key, '<html><script>alert(1)</script></html>');

        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $key])
            ->assertUnprocessable();

        $this->assertNull($this->product->fresh()->image_key);
        Storage::disk('r2')->assertMissing($key);
        Storage::disk('r2_incoming')->assertMissing($key);
    }

    public function test_confirm_publishes_the_upload_with_a_server_chosen_type_and_clears_the_incoming_copy(): void
    {
        $key = $this->uploadIssuedKey();

        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $key])->assertOk();

        Storage::disk('r2')->assertExists($key);
        $this->assertSame($this->webpBytes(40_000), Storage::disk('r2')->get($key));
        Storage::disk('r2_incoming')->assertMissing($key);
    }

    public function test_config_reports_disabled_when_the_flag_is_off(): void
    {
        config(['product_images.enabled' => false]);

        $this->actingAs($this->owner)->getJson('/api/v1/app/product-images/config')
            ->assertOk()
            ->assertExactJson(['enabled' => false, 'public_base_url' => null, 'max_bytes' => 262144, 'allowed_types' => ['image/webp', 'image/jpeg', 'image/png']]);
    }

    public function test_config_reports_disabled_without_a_public_base_url(): void
    {
        config(['product_images.public_base_url' => '']);

        $this->actingAs($this->owner)->getJson('/api/v1/app/product-images/config')
            ->assertOk()->assertJsonPath('enabled', false);
    }

    public function test_config_reports_the_public_base_url_when_enabled(): void
    {
        $this->actingAs($this->owner)->getJson('/api/v1/app/product-images/config')
            ->assertOk()
            ->assertJsonPath('enabled', true)
            ->assertJsonPath('public_base_url', 'https://img.example.test');
    }

    public function test_config_requires_authentication(): void
    {
        $this->getJson('/api/v1/app/product-images/config')->assertUnauthorized();
    }

    public function test_every_write_endpoint_is_a_404_while_the_feature_is_off(): void
    {
        config(['product_images.enabled' => false]);

        $this->presign()->assertNotFound();
        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => 'x'])->assertNotFound();
        $this->actingAs($this->owner)->deleteJson($this->url($this->product))->assertNotFound();
    }

    public function test_presign_issues_a_server_built_key_and_a_short_lived_upload_url(): void
    {
        $response = $this->presign()->assertOk();

        $this->assertMatchesRegularExpression(
            sprintf(self::KEY_PATTERN, $this->store->id, $this->product->id),
            $response->json('key'),
        );
        $this->assertNotEmpty($response->json('upload_url'));
        $this->assertSame('image/webp', $response->json('headers.Content-Type'));
        $expiresAt = \Carbon\Carbon::parse($response->json('expires_at'));
        $this->assertTrue($expiresAt->lte(now()->addMinutes(5)->addSecond()));
    }

    public function test_presign_uses_the_extension_of_the_declared_type(): void
    {
        $key = $this->presign(body: ['content_type' => 'image/jpeg'])->assertOk()->json('key');

        $this->assertStringEndsWith('.jpg', $key);
    }

    public function test_presign_refuses_a_type_outside_the_allow_list(): void
    {
        $this->presign(body: ['content_type' => 'image/svg+xml'])->assertUnprocessable();
        $this->presign(body: ['content_type' => 'text/html'])->assertUnprocessable();
    }

    public function test_presign_refuses_an_oversized_or_empty_declared_length(): void
    {
        $this->presign(body: ['content_length' => 262145])->assertUnprocessable();
        $this->presign(body: ['content_length' => 0])->assertUnprocessable();
    }

    public function test_another_tenant_cannot_presign_confirm_or_delete_this_product(): void
    {
        [$intruder] = $this->makeTenant('b');
        $key = $this->uploadIssuedKey();

        $this->presign(as: $intruder)->assertNotFound();
        $this->actingAs($intruder)->postJson($this->url($this->product, '/confirm'), ['key' => $key])->assertNotFound();
        $this->actingAs($intruder)->deleteJson($this->url($this->product))->assertNotFound();
        $this->assertNull($this->product->fresh()->image_key);
    }

    public function test_a_key_issued_for_another_product_cannot_be_confirmed_here(): void
    {
        $other = $this->makeProduct($this->store);
        $foreignKey = $this->presign(product: $other)->json('key');
        Storage::disk('r2_incoming')->put($foreignKey, $this->webpBytes(100));

        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $foreignKey])
            ->assertUnprocessable();
        $this->assertNull($this->product->fresh()->image_key);
    }

    public function test_a_key_the_server_never_issued_cannot_be_confirmed(): void
    {
        $forged = "stores/{$this->store->id}/products/{$this->product->id}/".Str::uuid().'.webp';
        Storage::disk('r2_incoming')->put($forged, $this->webpBytes(100));

        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $forged])
            ->assertUnprocessable();
    }

    public function test_staff_without_manage_products_is_forbidden(): void
    {
        $group = PermissionGroup::create([
            'store_id' => $this->store->id, 'name' => 'Cashiers', 'based_on_role' => 'sales_staff', 'permissions' => ['view_reports'],
        ]);
        $staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'A', 'email' => 'staff-a@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'sales_staff', 'is_active' => true,
            'store_id' => $this->store->id, 'permission_group_id' => $group->id,
        ]);

        $this->presign(as: $staff)->assertForbidden();
    }

    public function test_staff_whose_group_grants_manage_products_may_presign(): void
    {
        $group = PermissionGroup::create([
            'store_id' => $this->store->id, 'name' => 'Stock', 'based_on_role' => 'sales_staff', 'permissions' => ['manage_products'],
        ]);
        $staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'B', 'email' => 'staff-b@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'sales_staff', 'is_active' => true,
            'store_id' => $this->store->id, 'permission_group_id' => $group->id,
        ]);

        $this->presign(as: $staff)->assertOk();
    }

    public function test_confirm_sets_the_key_moves_the_row_into_the_pull_and_keeps_the_version(): void
    {
        DB::table('products')->where('id', $this->product->id)->update(['_synced_at' => now()->subDay()]);
        $before = $this->product->fresh();
        $key = $this->uploadIssuedKey();

        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $key])
            ->assertOk()
            ->assertJsonPath('image_key', $key)
            ->assertJsonPath('image_url', "https://img.example.test/{$key}");

        $after = $this->product->fresh();
        $this->assertSame($key, $after->image_key);
        $this->assertSame((int) $before->_version, (int) $after->_version);
        $this->assertTrue(\Carbon\Carbon::parse($after->_synced_at)->gt(\Carbon\Carbon::parse($before->_synced_at)));
    }

    public function test_a_key_can_only_be_confirmed_once(): void
    {
        $key = $this->uploadIssuedKey();
        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $key])->assertOk();

        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $key])
            ->assertUnprocessable();
    }

    public function test_replacing_deletes_the_old_object_only_after_the_new_key_is_saved(): void
    {
        $first = $this->uploadIssuedKey();
        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $first])->assertOk();
        $second = $this->uploadIssuedKey();

        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $second])->assertOk();

        $this->assertNotSame($first, $second);
        $this->assertSame($second, $this->product->fresh()->image_key);
        Storage::disk('r2')->assertMissing($first);
        Storage::disk('r2')->assertExists($second);
    }

    public function test_a_failed_confirm_keeps_the_previous_image(): void
    {
        $first = $this->uploadIssuedKey();
        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $first])->assertOk();
        $missing = $this->presign()->json('key');

        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $missing])
            ->assertUnprocessable();

        $this->assertSame($first, $this->product->fresh()->image_key);
        Storage::disk('r2')->assertExists($first);
    }

    public function test_confirm_rejects_and_deletes_an_object_over_the_size_cap(): void
    {
        $key = $this->uploadIssuedKey(262145);

        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $key])
            ->assertUnprocessable();

        $this->assertNull($this->product->fresh()->image_key);
        Storage::disk('r2')->assertMissing($key);
        Storage::disk('r2_incoming')->assertMissing($key);
    }

    public function test_delete_clears_the_key_then_removes_the_object(): void
    {
        $key = $this->uploadIssuedKey();
        $this->actingAs($this->owner)->postJson($this->url($this->product, '/confirm'), ['key' => $key])->assertOk();

        $this->actingAs($this->owner)->deleteJson($this->url($this->product))->assertOk()->assertJsonPath('image_key', null);

        $this->assertNull($this->product->fresh()->image_key);
        Storage::disk('r2')->assertMissing($key);
    }

    public function test_an_unknown_product_is_a_404(): void
    {
        $ghost = new Product(['id' => (string) Str::uuid()]);

        $this->presign(product: $ghost)->assertNotFound();
    }
}
