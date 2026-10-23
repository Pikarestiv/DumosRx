<?php

namespace App\Services\Sync;

use App\Models\Category;

/**
 * Keeps a pushed row from naming another store's category. Rationale, the
 * production measurement and why this remaps rather than refuses or drops:
 * docs/KNOWN_BUGS.md A-302 and docs/FIXED_BUGS.md A-301.
 */
class CrossStoreReferenceGuard
{
    /** @var array<string, array<string, class-string>> */
    private const GUARDED = [
        'products' => ['category_id' => Category::class],
    ];

    /** @var array<string, array{store_id: ?string, name: string, is_active: mixed}|null> */
    private array $referents = [];

    /** @var array<string, ?string> */
    private array $ownedByName = [];

    /** @var array<int, array<string, string>> */
    private array $remapped = [];

    public function __construct(private CrossTenantCategoryRepairService $repair) {}

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

            $ownedId = $this->ownedByName($rowStoreId, $referent['name'], $referent['is_active']);

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
        if (array_key_exists($id, $this->referents)) {
            return $this->referents[$id];
        }

        $row = $model::query()->whereKey($id)->first(['store_id', 'name', 'is_active']);

        return $this->referents[$id] = $row === null ? null : [
            'store_id' => $row->store_id,
            'name' => (string) $row->name,
            'is_active' => $row->is_active,
        ];
    }

    private function ownedByName(string $storeId, string $name, mixed $isActive): ?string
    {
        $key = $storeId.'|'.mb_strtolower(trim($name));

        if (array_key_exists($key, $this->ownedByName)) {
            return $this->ownedByName[$key];
        }

        return $this->ownedByName[$key] = $this->repair->resolveOwnedCategoryId(
            $storeId,
            $name,
            $isActive,
            true,
        );
    }
}
