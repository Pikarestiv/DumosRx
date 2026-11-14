<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Services\ProductImages\ProductImageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Presigning is a local signature computation; nothing here reaches R2. */
class ProductImageR2PresignTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_presigned_put_targets_the_private_incoming_bucket_for_five_minutes(): void
    {
        config([
            'product_images.enabled' => true,
            'product_images.disk' => 'r2',
            'product_images.public_base_url' => 'https://img.example.test',
            'product_images.incoming_disk' => 'r2_incoming',
            'filesystems.disks.r2_incoming.key' => 'test-access-key',
            'filesystems.disks.r2_incoming.secret' => 'test-secret',
            'filesystems.disks.r2_incoming.bucket' => 'product-images-incoming',
            'filesystems.disks.r2_incoming.endpoint' => 'https://acct123.r2.cloudflarestorage.com',
        ]);
        $product = Product::create(['name' => 'panadol', 'store_id' => 'store-1']);

        $signed = app(ProductImageService::class)->presign($product, 'image/webp');

        $url = parse_url($signed['upload_url']);
        parse_str($url['query'], $query);
        $this->assertSame('acct123.r2.cloudflarestorage.com', $url['host']);
        $this->assertSame('/product-images-incoming/'.$signed['key'], $url['path']);
        $this->assertSame('300', $query['X-Amz-Expires']);
        $this->assertMatchesRegularExpression('#^test-access-key/\d{8}/auto/s3/aws4_request$#', $query['X-Amz-Credential']);
        $this->assertStringNotContainsString('test-secret', $signed['upload_url']);
    }
}
