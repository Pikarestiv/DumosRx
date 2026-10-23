<?php

namespace App\Services\Sync;

use App\Models\Supplier;

class OwnedSupplierResolver
{
    public function resolve(string $storeId, string $name, mixed $sourceIsActive): string
    {
        $owned = Supplier::withTrashed()
            ->where('store_id', $storeId)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower(trim($name))])
            ->orderByRaw('deleted_at IS NOT NULL')
            ->first();

        if ($owned !== null) {
            if ($owned->trashed()) {
                $owned->restore();
            }

            return $owned->id;
        }

        $supplier = new Supplier();
        $supplier->name = $name;
        $supplier->store_id = $storeId;
        $supplier->is_active = $sourceIsActive === null ? true : (bool) $sourceIsActive;
        $supplier->save();

        return $supplier->id;
    }
}
