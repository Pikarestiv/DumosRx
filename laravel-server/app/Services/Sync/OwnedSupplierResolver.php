<?php

namespace App\Services\Sync;

use App\Models\Supplier;

class OwnedSupplierResolver
{
    public function resolve(string $storeId, string $name, mixed $sourceIsActive): string
    {
        $ownedId = Supplier::query()
            ->where('store_id', $storeId)
            ->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower(trim($name))])
            ->orderBy('created_at')
            ->orderBy('id')
            ->value('id');

        if ($ownedId !== null) {
            return $ownedId;
        }

        $supplier = new Supplier();
        $supplier->name = trim($name);
        $supplier->store_id = $storeId;
        $supplier->is_active = $sourceIsActive === null ? true : (bool) $sourceIsActive;
        $supplier->save();

        return $supplier->id;
    }
}
