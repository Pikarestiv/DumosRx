<?php

namespace App\Services\Storefront;

use App\Models\Store;
use App\Models\Storefront;
use App\Models\StorefrontBranch;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class StorefrontBranchSlugs
{
    public const RESERVED = ['catalog', 'checkout', 'order', 'about', 'faq', 'locations', 'track', 'prescription', 'p'];

    private const MAX_BASE_LENGTH = 40;

    private ?bool $tableReady = null;

    public function existing(Store $store): ?string
    {
        return $this->tableReady() ? StorefrontBranch::where('store_id', $store->id)->value('slug') : null;
    }

    public function ensure(Store $store): string
    {
        if (! $this->tableReady()) {
            return Str::limit(Str::slug($store->name), self::MAX_BASE_LENGTH, '') ?: 'branch';
        }

        $existing = StorefrontBranch::where('store_id', $store->id)->value('slug');

        if ($existing) {
            return $existing;
        }

        try {
            return StorefrontBranch::create([
                'store_id' => $store->id,
                'user_id' => $store->user_id,
                'slug' => $this->uniqueSlug($store),
            ])->slug;
        } catch (UniqueConstraintViolationException) {
            return StorefrontBranch::where('store_id', $store->id)->valueOrFail('slug');
        }
    }

    public function checkoutPath(Store $store): string
    {
        $brand = Storefront::where('user_id', $store->user_id)->value('slug') ?: $store->store_slug;
        $liveBranches = Store::where('user_id', $store->user_id)->where('online_store_enabled', true)->count();

        return $liveBranches >= 2 ? "/s/{$brand}/{$this->ensure($store)}/checkout" : "/s/{$brand}/checkout";
    }

    /**
     * @param  Collection<int, Store>  $branches
     * @return array<string, string> store id => branch slug
     */
    public function forBranches(Collection $branches): array
    {
        return $branches->mapWithKeys(fn (Store $branch) => [$branch->id => $this->ensure($branch)])->all();
    }

    private function tableReady(): bool
    {
        return $this->tableReady ??= Schema::hasTable('storefront_branches');
    }

    private function uniqueSlug(Store $store): string
    {
        $base = Str::limit(Str::slug($store->name), self::MAX_BASE_LENGTH, '') ?: 'branch';
        $taken = StorefrontBranch::where('user_id', $store->user_id)->pluck('slug')->all();
        $slug = $base;

        for ($n = 2; in_array($slug, self::RESERVED, true) || in_array($slug, $taken, true); $n++) {
            $slug = "{$base}-{$n}";
        }

        return $slug;
    }
}
