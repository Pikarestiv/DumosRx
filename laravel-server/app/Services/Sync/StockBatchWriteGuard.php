<?php

namespace App\Services\Sync;

use App\Models\PermissionGroup;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/** A-421: the sync push only checked that a stock_batches row belongs to a store the session
 * may write, so a session without the batch-editing rights could rewrite a batch's cost,
 * expiry, lot or manufacture date. Every till still pushes quantity-only UPDATEs, so this
 * compares the payload with the stored row and only acts on a real change to those columns. */
class StockBatchWriteGuard
{
    private const UNRESTRICTED_ROLES = ['store_owner', 'admin', 'super_admin'];

    /** edit_product_cost covers the stock-audit cost correction and manage_products the
     * product import, both of which have always changed a batch's cost. */
    private const COST_PERMISSIONS = ['edit_batch_details', 'edit_product_cost', 'manage_products'];

    private const DETAIL_PERMISSIONS = ['edit_batch_details'];

    private const DETAIL_COLUMNS = ['batch_number', 'expiry_date', 'manufacture_date'];

    public function refuses(User $user, Model $batch, array $payload): bool
    {
        if (in_array($user->role, self::UNRESTRICTED_ROLES, true)) {
            return false;
        }

        if ($this->changesCost($batch, $payload) && ! $this->holdsAny($user, self::COST_PERMISSIONS)) {
            return true;
        }

        return $this->changesDetails($batch, $payload) && ! $this->holdsAny($user, self::DETAIL_PERMISSIONS);
    }

    private function changesCost(Model $batch, array $payload): bool
    {
        if (! array_key_exists('cost_price', $payload)) {
            return false;
        }

        return abs((float) $payload['cost_price'] - (float) $batch->getAttribute('cost_price')) > 0.0001;
    }

    private function changesDetails(Model $batch, array $payload): bool
    {
        foreach (self::DETAIL_COLUMNS as $column) {
            if (array_key_exists($column, $payload)
                && $this->normalized($column, $payload[$column]) !== $this->normalized($column, $batch->getAttribute($column))) {
                return true;
            }
        }

        return false;
    }

    private function normalized(string $column, mixed $value): ?string
    {
        $text = $value === null ? '' : trim((string) $value);
        if ($text === '') {
            return null;
        }

        return $column === 'batch_number' ? $text : substr($text, 0, 10);
    }

    private function holdsAny(User $user, array $permissions): bool
    {
        $group = $user->permission_group_id ? PermissionGroup::find($user->permission_group_id) : null;
        if ($group) {
            return count(array_intersect($permissions, $group->permissions ?? [])) > 0;
        }

        foreach ($permissions as $permission) {
            if ($user->hasPermission($permission)) {
                return true;
            }
        }

        return false;
    }
}
