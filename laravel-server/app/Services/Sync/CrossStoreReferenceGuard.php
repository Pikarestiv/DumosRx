<?php

namespace App\Services\Sync;

use App\Models\Category;
use App\Models\Store;
use App\Models\Supplier;

/**
 * Re-owns a pushed reference to another store's category or supplier onto the row's own store.
 * Rationale and lifecycle: laravel-server/AGENTS.md, "Cross-store supplier references".
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

    /** @var array<string, ?string> */
    private array $storeOwners = [];

    /** @var array<int, array<string, string>> */
    private array $remapped = [];

    /** @var array<int, array<string, string>> */
    private array $pendingRemapped = [];

    /** @var array<int, string> */
    private array $pendingOwnedKeys = [];

    /** @var array<string, array{0: class-string, 1: string}> */
    private array $pendingReferents = [];

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

            if (! $this->mayReOwn($model, $referent['store_id'] ?? null, $rowStoreId)) {
                continue;
            }

            $ownedId = $this->ownedByName($model, $rowStoreId, $referent['name'], $referent['is_active']);

            if ($ownedId === null || $ownedId === $referencedId) {
                continue;
            }

            $payload[$column] = $ownedId;
            $this->pendingReferents[$model.'|'.$ownedId] = [$model, $ownedId];
            $this->pendingRemapped[] = [
                'table_name' => $table,
                'record_id' => (string) $recordId,
                'reason' => 'cross_store_reference',
            ];
        }

        return $payload;
    }

    public function commitChange(PushedRowRestamper $restamper): void
    {
        foreach ($this->pendingReferents as [$model, $id]) {
            $row = $model::withTrashed()->find($id);
            if ($row !== null && $this->wasWrittenUnstamped($row)) {
                $restamper->remember($row);
            }
        }

        array_push($this->remapped, ...$this->pendingRemapped);
        $this->resetPending();
    }

    public function discardChange(): void
    {
        foreach ($this->pendingOwnedKeys as $key) {
            unset($this->ownedByName[$key]);
        }

        $this->resetPending();
    }

    /** @return array<int, array<string, string>> */
    public function remapped(): array
    {
        return $this->remapped;
    }

    private function resetPending(): void
    {
        $this->pendingRemapped = [];
        $this->pendingOwnedKeys = [];
        $this->pendingReferents = [];
    }

    /** Categories re-own across tenants as A-302 always did; a supplier's name never crosses one. */
    private function mayReOwn(string $model, ?string $referentStoreId, string $rowStoreId): bool
    {
        if ($referentStoreId === null || $referentStoreId === $rowStoreId) {
            return false;
        }

        if ($model !== Supplier::class) {
            return true;
        }

        $owner = $this->storeOwner($rowStoreId);

        return $owner !== null && $owner === $this->storeOwner($referentStoreId);
    }

    /** A row this request created or revived carries no stamp newer than its own write. */
    private function wasWrittenUnstamped(\Illuminate\Database\Eloquent\Model $row): bool
    {
        $syncedAt = $row->getAttribute('_synced_at');
        $updatedAt = $row->getAttribute('updated_at');

        return $syncedAt === null || ($updatedAt !== null && \Illuminate\Support\Carbon::parse($syncedAt)->lt($updatedAt));
    }

    private function storeOwner(string $storeId): ?string
    {
        if (! array_key_exists($storeId, $this->storeOwners)) {
            $this->storeOwners[$storeId] = Store::withTrashed()->whereKey($storeId)->value('user_id');
        }

        return $this->storeOwners[$storeId];
    }

    /**
     * @param  class-string  $model
     * @return array{store_id: ?string, name: string, is_active: mixed}|null
     */
    private function referent(string $model, string $id): ?array
    {
        $key = $model.'|'.$id;

        if (array_key_exists($key, $this->referents)) {
            return $this->referents[$key];
        }

        $row = $model::withTrashed()->whereKey($id)->first(['store_id', 'name', 'is_active']);

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

        $this->pendingOwnedKeys[] = $key;

        return $this->ownedByName[$key] = $model === Supplier::class
            ? $this->suppliers->resolve($storeId, $name, $isActive)
            : $this->repair->resolveOwnedCategoryId($storeId, $name, $isActive, true);
    }
}
