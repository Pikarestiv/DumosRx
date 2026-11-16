<?php

namespace App\Services\Storefront;

class StorefrontBranchDirectory
{
    public function __construct(
        private readonly StorefrontCatalogService $catalog,
        private readonly StorefrontBranchSlugs $slugs,
    ) {}

    /**
     * Branch slugs per published storefront slug, for storefronts with two or more live branches
     * (a single-branch storefront has no branch pages).
     *
     * @param  array<int, string>  $storefrontSlugs
     * @return array<string, array<int, string>>
     */
    public function forStorefronts(array $storefrontSlugs): array
    {
        $directory = [];

        foreach ($storefrontSlugs as $slug) {
            $storefront = $this->catalog->resolveStorefront($slug);
            $branches = $storefront
                ? $this->catalog->getStorefrontBranches($storefront)->reject(fn ($branch) => $branch->isSuspended())
                : collect();

            if ($branches->count() >= 2) {
                $directory[$slug] = array_values($this->slugs->forBranches($branches));
            }
        }

        return $directory;
    }
}
