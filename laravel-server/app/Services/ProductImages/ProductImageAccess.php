<?php

namespace App\Services\ProductImages;

use App\Models\PermissionGroup;
use App\Models\Product;
use App\Models\User;
use App\Services\Sync\SyncOwnershipResolver;

class ProductImageAccess
{
    private const PERMISSION = 'manage_products';

    private const UNRESTRICTED_ROLES = ['store_owner', 'admin', 'super_admin'];

    public function __construct(private SyncOwnershipResolver $ownership) {}

    /** Null when the product does not exist or belongs to a store outside the caller's tenancy: callers answer 404 either way. */
    public function findInScope(User $user, string $productId): ?Product
    {
        $product = Product::find($productId);
        if (! $product || ! $product->store_id) {
            return null;
        }

        $storeIds = $this->ownership->resolveOwnershipIdentity($user)['storeIds'];

        return in_array($product->store_id, $storeIds, true) ? $product : null;
    }

    public function mayEditProducts(User $user): bool
    {
        if (in_array($user->role, self::UNRESTRICTED_ROLES, true)) {
            return true;
        }

        $group = $user->permission_group_id ? PermissionGroup::find($user->permission_group_id) : null;
        if ($group) {
            return in_array(self::PERMISSION, $group->permissions ?? [], true);
        }

        return (bool) $user->hasPermission(self::PERMISSION);
    }
}
