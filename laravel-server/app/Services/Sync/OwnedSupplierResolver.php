<?php

namespace App\Services\Sync;

use App\Models\Store;
use App\Models\Supplier;

class OwnedSupplierResolver
{
    public function resolve(string $storeId, string $name, mixed $sourceIsActive): string
    {
        $ownerId = Store::withTrashed()->whereKey($storeId)->lockForUpdate()->value('user_id');

        $ownedId = Supplier::query()
            ->where('store_id', $storeId)
            ->where('name', $name)
            ->orderBy('created_at')
            ->orderBy('id')
            ->value('id');

        if ($ownedId !== null) {
            return $ownedId;
        }

        $supplier = new Supplier;
        $supplier->name = $name;
        $supplier->store_id = $storeId;
        $supplier->user_id = $ownerId;
        $supplier->is_active = $sourceIsActive === null ? true : (bool) $sourceIsActive;
        $supplier->save();

        return $supplier->id;
    }
}
