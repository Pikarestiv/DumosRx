<?php

namespace App\Services\ProductImages;

use App\Models\Product;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/** Design: docs/PRODUCT_IMAGES_DESIGN.md */
class ProductImageService
{
    private const ISSUED_KEY_CACHE_PREFIX = 'product-image-upload:';

    private const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

    private const SIGNATURES = [
        'image/webp' => ['offset' => 8, 'bytes' => 'WEBP'],
        'image/jpeg' => ['offset' => 0, 'bytes' => "\xFF\xD8\xFF"],
        'image/png' => ['offset' => 0, 'bytes' => "\x89PNG"],
    ];

    private ?bool $hasImageColumn = null;

    public function isEnabled(): bool
    {
        return (bool) config('product_images.enabled')
            && filled(config('product_images.public_base_url'))
            && ($this->hasImageColumn ??= Schema::hasColumn('products', 'image_key'));
    }

    /** @return array<string, mixed> */
    public function clientConfig(): array
    {
        $enabled = $this->isEnabled();

        return [
            'enabled' => $enabled,
            'public_base_url' => $enabled ? rtrim((string) config('product_images.public_base_url'), '/') : null,
            'max_bytes' => $this->maxBytes(),
            'allowed_types' => array_keys($this->allowedTypes()),
        ];
    }

    public function publicUrl(?string $key): ?string
    {
        if (! $key || ! $this->isEnabled()) {
            return null;
        }

        return rtrim((string) config('product_images.public_base_url'), '/').'/'.$key;
    }

    public function maxBytes(): int
    {
        return (int) config('product_images.max_bytes');
    }

    /** @return array<string, string> */
    public function allowedTypes(): array
    {
        return (array) config('product_images.allowed_types');
    }

    /** @return array{key: string, upload_url: string, headers: array<string, mixed>, expires_at: string} */
    public function presign(Product $product, string $contentType): array
    {
        $ttl = (int) config('product_images.upload_ttl_seconds');
        $expiresAt = now()->addSeconds($ttl);
        $key = sprintf(
            'stores/%s/products/%s/%s.%s',
            $product->store_id,
            $product->id,
            Str::uuid()->toString(),
            $this->allowedTypes()[$contentType],
        );

        $signed = $this->incomingDisk()->temporaryUploadUrl($key, $expiresAt, ['ContentType' => $contentType]);

        Cache::put(self::ISSUED_KEY_CACHE_PREFIX.$key, ['product_id' => $product->id, 'type' => $contentType], $ttl);

        return [
            'key' => $key,
            'upload_url' => $signed['url'],
            'headers' => ['Content-Type' => $contentType],
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }

    /** @throws ProductImageRejected */
    public function confirm(Product $product, string $key): Product
    {
        $issued = Cache::pull(self::ISSUED_KEY_CACHE_PREFIX.$key);
        if (! is_array($issued) || ($issued['product_id'] ?? null) !== $product->id) {
            throw new ProductImageRejected('This upload was not issued for this product, or it has expired. Try again.');
        }

        $type = (string) $issued['type'];
        $bytes = $this->takeValidatedUpload($key, $type);
        $this->disk()->put($key, $bytes, ['ContentType' => $type, 'CacheControl' => self::PUBLIC_CACHE_CONTROL]);

        return $this->replaceKey($product, $key);
    }

    public function remove(Product $product): Product
    {
        return $this->replaceKey($product, null);
    }

    public function disk(): Filesystem
    {
        return Storage::disk((string) config('product_images.disk'));
    }

    public function incomingDisk(): Filesystem
    {
        return Storage::disk((string) config('product_images.incoming_disk'));
    }

    private function replaceKey(Product $product, ?string $key): Product
    {
        $previous = $product->image_key;

        $product->forceFill(['image_key' => $key, '_synced_at' => now()])->save();

        if ($previous && $previous !== $key) {
            $this->deleteQuietly($this->disk(), $previous);
        }

        return $product;
    }

    /** @throws ProductImageRejected */
    private function takeValidatedUpload(string $key, string $expectedType): string
    {
        $incoming = $this->incomingDisk();
        if (! $incoming->exists($key)) {
            throw new ProductImageRejected('The upload did not arrive. Try again.');
        }

        $size = $incoming->size($key);
        $bytes = $size > 0 && $size <= $this->maxBytes() ? (string) $incoming->get($key) : '';
        $this->deleteQuietly($incoming, $key);

        $signature = self::SIGNATURES[$expectedType];
        if ($bytes === '' || substr($bytes, $signature['offset'], strlen($signature['bytes'])) !== $signature['bytes']) {
            throw new ProductImageRejected('The uploaded file is not a valid image within the size limit.');
        }

        return $bytes;
    }

    public function deleteQuietly(Filesystem $disk, string $key): void
    {
        try {
            $disk->delete($key);
        } catch (\Throwable $e) {
            Log::warning('Product image delete failed; the orphan sweep will retry', ['key' => $key, 'error' => $e->getMessage()]);
        }
    }
}
