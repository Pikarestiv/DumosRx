<?php

namespace App\Services\Sync;

use App\Models\Category;
use App\Models\Supplier;

/**
 * Keeps a pushed row from naming another store's category or supplier.
 * Rationale, the production measurement and why this remaps rather than
 * refuses or drops: docs/FIXED_BUGS.md A-301, A-302 and A-321.
 */
class CrossStoreReferenceGuard
{
    /** @var array<string, array<string, class-string>> */
    private const GUARDED = [
        'products' => ['category_id' => Category::class],
        'purchase_orders' => ['supplier_id' => Supplier::class],
        'supplier_payments' => ['supplier_id' => Supplier::class],
        'stock_batches' => ['supplier_id' => Supplier::class],
    ];

    /** @var array<string, array{store_id: ?string, name: string, is_active: mixed}|null> */
    private array $referents = [];

    /** @var array<string, ?string> */
    private array $ownedByName = [];

    /** @var array<int, array<string, string>> */
    private array $remapped = [];

    public function __construct(
        private CrossTenantCategoryRepairService $repair,
        private OwnedSupplierResolver $suppliers,
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function apply(string $table, array $payload, ?string $rowStoreId, ?string $recordId): array
    {
        if ($rowStoreId === null || ! isset(self::GUARDED[$table])) {
            return $payload;
        }

        foreach (self::GUARDED[$table] as $column => $model) {
            $referencedId = $payload[$column] ?? null;

            if (! is_string($referencedId) || $referencedId === '') {
                continue;
            }

            $referent = $this->referent($model, $referencedId);

            // Absent or store-less referents are left alone: docs/FIXED_BUGS.md A-302.
            if ($referent === null || $referent['store_id'] === null) {
                continue;
            }

            if ($referent['store_id'] === $rowStoreId) {
                continue;
            }

            $ownedId = $this->ownedByName($model, $rowStoreId, $referent['name'], $referent['is_active']);

            if ($ownedId === null || $ownedId === $referencedId) {
                continue;
            }

            $payload[$column] = $ownedId;
            $this->remapped[] = [
                'table_name' => $table,
                'record_id' => (string) $recordId,
                'reason' => 'cross_store_reference',
            ];
        }

        return $payload;
    }

    /** @return array<int, array<string, string>> */
    public function remapped(): array
    {
        return $this->remapped;
    }

    /** @return array{store_id: ?string, name: string, is_active: mixed}|null */
    private function referent(string $model, string $id): ?array
    {
        $key = $model.'|'.$id;

        if (array_key_exists($key, $this->referents)) {
            return $this->referents[$key];
        }

        $row = $model::query()->whereKey($id)->first(['store_id', 'name', 'is_active']);

        return $this->referents[$key] = $row === null ? null : [
            'store_id' => $row->store_id,
            'name' => (string) $row->name,
            'is_active' => $row->is_active,
        ];
    }

    /** @param class-string $model */
    private function ownedByName(string $model, string $storeId, string $name, mixed $isActive): ?string
    {
        $key = $model.'|'.$storeId.'|'.mb_strtolower(trim($name));

        if (array_key_exists($key, $this->ownedByName)) {
            return $this->ownedByName[$key];
        }

        return $this->ownedByName[$key] = $model === Supplier::class
            ? $this->suppliers->resolve($storeId, $name, $isActive)
            : $this->repair->resolveOwnedCategoryId($storeId, $name, $isActive, true);
    }
}
