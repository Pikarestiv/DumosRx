<?php

namespace App\Services\Storefront;

use App\Models\Store;
use App\Models\Storefront;
use App\Models\StorefrontBranch;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class StorefrontBranchSlugs
{
    public const RESERVED = ['catalog', 'checkout', 'order', 'about', 'faq', 'locations', 'track', 'prescription', 'p'];

    private const MAX_BASE_LENGTH = 40;

    private const CREATE_ATTEMPTS = 3;

    private ?bool $tableReady = null;

    public function existing(Store $store): ?string
    {
        return $this->tableReady() ? StorefrontBranch::where('store_id', $store->id)->value('slug') : null;
    }

    public function ensure(Store $store): string
    {
        if (! $this->tableReady()) {
            return $this->baseSlug($store);
        }

        $existing = StorefrontBranch::where('store_id', $store->id)->value('slug');

        if ($existing) {
            return $existing;
        }

        for ($attempt = 1; $attempt <= self::CREATE_ATTEMPTS; $attempt++) {
            try {
                $slug = $attempt < self::CREATE_ATTEMPTS ? $this->uniqueSlug($store) : $this->baseSlug($store).'-'.substr($store->id, 0, 6);

                return DB::transaction(fn () => StorefrontBranch::create(['store_id' => $store->id, 'user_id' => $store->user_id, 'slug' => $slug]))->slug;
            } catch (UniqueConstraintViolationException) {
                $existing = StorefrontBranch::where('store_id', $store->id)->value('slug');
                if ($existing) {
                    return $existing;
                }
            }
        }

        return StorefrontBranch::where('store_id', $store->id)->value('slug') ?? throw new \RuntimeException("Could not allocate a branch slug for store {$store->id}.");
    }

    public function checkoutPath(Store $store, ?string $cameFromBranch = null): string
    {
        $brand = Storefront::where('user_id', $store->user_id)->value('slug') ?: $store->store_slug;

        return $cameFromBranch !== null && $cameFromBranch === $this->existing($store)
            ? "/s/{$brand}/{$cameFromBranch}/checkout"
            : "/s/{$brand}/checkout";
    }

    /**
     * @param  Collection<int, Store>  $branches
     * @return array<string, string> store id => branch slug
     */
    public function forBranches(Collection $branches): array
    {
        return $branches->mapWithKeys(fn (Store $branch) => [$branch->id => $this->ensure($branch)])->all();
    }

    private function baseSlug(Store $store): string
    {
        return Str::limit(Str::slug($store->name), self::MAX_BASE_LENGTH, '') ?: 'branch';
    }

    private function tableReady(): bool
    {
        return $this->tableReady ??= Schema::hasTable('storefront_branches');
    }

    protected function uniqueSlug(Store $store): string
    {
        $base = $this->baseSlug($store);
        $taken = StorefrontBranch::where('user_id', $store->user_id)->pluck('slug')->all();
        $slug = $base;

        for ($n = 2; in_array($slug, self::RESERVED, true) || in_array($slug, $taken, true); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }
}
