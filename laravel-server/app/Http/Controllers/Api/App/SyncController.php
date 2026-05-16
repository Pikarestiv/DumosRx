<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\Medicine;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Customer;
use App\Models\Supplier;
use App\Models\Inventory;
use App\Models\Store;
use App\Models\User;

class SyncController extends Controller
{
    /**
     * Push changes from client to server
     */
    public function push(Request $request)
    {
        $request->validate([
            'changes' => 'required|array',
            'changes.*.table_name' => 'required|string',
            'changes.*.operation' => 'required|in:INSERT,UPDATE,DELETE',
            'changes.*.payload' => 'nullable'
        ]);

        $changes = $request->input('changes');
        $processed = 0;

        DB::beginTransaction();

        try {
            foreach ($changes as $change) {
                $modelClass = $this->getModelForTable($change['table_name']);

                if (!$modelClass) {
                    Log::warning("Sync push ignored unknown table: " . $change['table_name']);
                    continue;
                }

                $payload = is_array($change['payload']) ? $change['payload'] : json_decode($change['payload'], true);
                $now = now();

                if ($change['operation'] === 'INSERT') {
                    $exists = $modelClass::where('id', $payload['id'])->exists();
                    if (!$exists) {
                        $model = new $modelClass();
                        $model->fill($payload);
                        $model->id = $payload['id'];
                        $model->_synced_at = $now;
                        $model->save();
                    }
                } elseif ($change['operation'] === 'UPDATE') {
                    $model = $modelClass::find($payload['id']);
                    if ($model) {
                        $model->fill($payload);
                        $model->_synced_at = $now;
                        $model->save();
                    }
                } elseif ($change['operation'] === 'DELETE') {
                    $modelClass::where('id', $change['record_id'])->delete();
                }

                $processed++;
            }

            DB::commit();
            return response()->json(['success' => true, 'processed' => $processed]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Sync push failed: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Sync failed', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Pull changes from server to client
     */
    public function pull(Request $request)
    {
        $lastSyncedMap = $request->input('last_synced', []);
        $changes = [];
        $serverTimestamp = now()->toIso8601String();

        $tables = ['medicines', 'customers', 'suppliers', 'sales', 'store_profile', 'users'];

        foreach ($tables as $table) {
            $lastSynced = $lastSyncedMap[$table] ?? null;
            $modelClass = $this->getModelForTable($table);

            if (!$modelClass)
                continue;

            $query = \method_exists($modelClass, 'withTrashed')
                ? $modelClass::withTrashed()
                : $modelClass::query();

            // Multi-tenant filtering
            $user = $request->user();
            if ($user->role !== 'super_admin') {
                if ($table === 'users') {
                    // Only sync themselves and users in their stores
                    $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
                    $query->where(function ($q) use ($user, $storeIds) {
                        $q->where('id', $user->id)
                            ->orWhereIn('store_id', $storeIds);
                    });
                } elseif ($table === 'store_profile') {
                    $query->where('user_id', $user->id);
                } else {
                    // For other tables, we need a way to filter. 
                    // If the model has a store_id or user_id, use it.
                    // This is a simplified approach.
                    $columns = \Schema::getColumnListing($table);
                    if (\in_array('store_id', $columns)) {
                        $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
                        $query->whereIn('store_id', $storeIds);
                    } elseif (\in_array('user_id', $columns)) {
                        $query->where('user_id', $user->id);
                    } elseif (\in_array('pharmacy_id', $columns)) {
                        $query->where('pharmacy_id', $user->id);
                    } elseif (\in_array('cashier_id', $columns)) {
                        // For sales, we pull all sales from the stores owned by the user
                        $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
                        $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();
                        $query->whereIn('cashier_id', $userIds);
                    }
                }
            }

            if ($lastSynced) {
                $query->where(function ($q) use ($lastSynced) {
                    $q->where('updated_at', '>', $lastSynced)
                        ->orWhere('_synced_at', '>', $lastSynced);
                });
            }

            $records = $query->limit(500)->get();

            $changes[$table] = $records->map(function ($item) use ($table) {
                $array = $item->toArray();
                $array['_deleted'] = (\method_exists($item, 'trashed') && $item->trashed()) ? 1 : 0;

                // SQLite on desktop has a NOT NULL constraint on username
                if ($table === 'users' && empty($array['username'])) {
                    $array['username'] = $array['email'] ?: 'user_' . substr($array['id'], 0, 8);
                }

                return $array;
            });
        }

        return response()->json([
            'success' => true,
            'server_timestamp' => $serverTimestamp,
            'changes' => $changes
        ]);
    }

    private function getModelForTable($tableName)
    {
        $map = [
            'medicines' => Medicine::class,
            'customers' => Customer::class,
            'suppliers' => Supplier::class,
            'sales' => Sale::class,
            'sale_items' => SaleItem::class,
            'store_profile' => Store::class,
            'users' => User::class,
        ];
        return $map[$tableName] ?? null;
    }
}
