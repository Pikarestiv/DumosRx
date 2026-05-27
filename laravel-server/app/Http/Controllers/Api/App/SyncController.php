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
use App\Models\ActivityLog;
use App\Models\Vendor;
use App\Models\Expense;
use App\Models\StockMovement;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;

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

        $hasSyncedAtCache = [];

        try {
            foreach ($changes as $change) {
                $modelClass = $this->getModelForTable($change['table_name']);

                if (!$modelClass) {
                    Log::warning("Sync push ignored unknown table: " . $change['table_name']);
                    continue;
                }

                $payload = is_array($change['payload']) ? $change['payload'] : json_decode($change['payload'], true);
                $now = now();

                // Map user_id to cashier_id for sales table coming from client
                if ($change['table_name'] === 'sales' && isset($payload['user_id'])) {
                    $payload['cashier_id'] = $payload['user_id'];
                    unset($payload['user_id']);
                }

                // Map quantity to quantity_in_stock for inventory
                if ($change['table_name'] === 'inventory' && isset($payload['quantity'])) {
                    $payload['quantity_in_stock'] = $payload['quantity'];
                    unset($payload['quantity']);
                }

                // Map vendor_id to supplier_id for purchase orders
                if ($change['table_name'] === 'purchase_orders') {
                    if (isset($payload['vendor_id'])) {
                        $payload['supplier_id'] = $payload['vendor_id'];
                        unset($payload['vendor_id']);
                    }
                    if (!isset($payload['ordered_by']) && isset($payload['user_id'])) {
                        $payload['ordered_by'] = $payload['user_id'];
                        unset($payload['user_id']);
                    }
                }

                // Map purchase_order_items fields
                if ($change['table_name'] === 'purchase_order_items') {
                    if (isset($payload['po_id'])) {
                        $payload['purchase_order_id'] = $payload['po_id'];
                        unset($payload['po_id']);
                    }
                    if (isset($payload['subtotal'])) {
                        $payload['total_cost'] = $payload['subtotal'];
                        unset($payload['subtotal']);
                    }
                    if (isset($payload['bulk_quantity']) && isset($payload['units_per_bulk'])) {
                        $payload['quantity_ordered'] = intval($payload['bulk_quantity']) * intval($payload['units_per_bulk']);
                        unset($payload['bulk_quantity']);
                        unset($payload['units_per_bulk']);
                    }
                }

                // Handle user specific mappings
                if ($change['table_name'] === 'users') {
                    if (isset($payload['name']) && !isset($payload['first_name'])) {
                        $parts = explode(' ', $payload['name'], 2);
                        $payload['first_name'] = $parts[0] ?? 'User';
                        $payload['last_name'] = $parts[1] ?? '';
                    }
                }

                if ($change['operation'] === 'INSERT') {
                    $recordId = $change['record_id'] ?? ($payload['id'] ?? null);
                    $exists = $modelClass::where('id', $recordId)->exists();
                    
                    // Prevent duplicate email/username crashes for users
                    if (!$exists && $change['table_name'] === 'users') {
                        $conflict = $modelClass::where('email', $payload['email'])
                                             ->orWhere('username', $payload['username'])
                                             ->first();
                        if ($conflict) {
                            Log::warning("Sync push skipped user insert due to duplicate email/username: {$payload['email']}");
                            $exists = true; // Pretend it exists to skip insertion
                        }
                    }

                    if (!$exists) {
                        $model = new $modelClass();
                        $model->fill($payload);
                        
                        // Force missing required fields for users
                        if ($change['table_name'] === 'users') {
                            if (empty($model->password)) {
                                $model->password = \Illuminate\Support\Facades\Hash::make($payload['pin'] ?? '1234');
                            }
                            if (empty($model->first_name)) {
                                $model->first_name = $payload['first_name'] ?? 'User';
                            }
                            if (empty($model->last_name) && !isset($payload['last_name'])) {
                                $model->last_name = '';
                            }
                        }
                        
                        $model->id = $recordId;
                        
                        $table = $model->getTable();
                        if (!isset($hasSyncedAtCache[$table])) {
                            $hasSyncedAtCache[$table] = \Illuminate\Support\Facades\Schema::hasColumn($table, '_synced_at');
                        }
                        if ($hasSyncedAtCache[$table]) {
                            $model->_synced_at = $now;
                        }
                        
                        $model->save();
                    }
                } elseif ($change['operation'] === 'UPDATE') {
                    $recordId = $change['record_id'] ?? ($payload['id'] ?? null);
                    $model = $modelClass::find($recordId);
                    if ($model) {
                        $model->fill($payload);
                        
                        if ($change['table_name'] === 'users') {
                            if (isset($payload['password'])) {
                                $model->password = $payload['password'];
                            }
                            if (isset($payload['first_name'])) {
                                $model->first_name = $payload['first_name'];
                            }
                            if (isset($payload['last_name'])) {
                                $model->last_name = $payload['last_name'];
                            }
                        }

                        $table = $model->getTable();
                        if (!isset($hasSyncedAtCache[$table])) {
                            $hasSyncedAtCache[$table] = \Illuminate\Support\Facades\Schema::hasColumn($table, '_synced_at');
                        }
                        if ($hasSyncedAtCache[$table]) {
                            $model->_synced_at = $now;
                        }

                        $model->save();
                    }
                } elseif ($change['operation'] === 'DELETE') {
                    $modelClass::where('id', $change['record_id'])->delete();
                }

                $processed++;
            }

            // Update the last sync time for the user's store
            if ($request->user()) {
                Store::where('user_id', $request->user()->id)->update(['last_sync_at' => now()]);
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

        $tables = ['medicines', 'customers', 'suppliers', 'sales', 'store_profile', 'users', 'stock_movements', 'purchase_orders', 'purchase_order_items'];

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
                } elseif ($table === 'sales') {
                    // For sales, we pull all sales from the stores owned by the user
                    $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
                    $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();
                    $query->whereIn('cashier_id', $userIds);
                } elseif ($table === 'purchase_orders') {
                    $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
                    $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();
                    $query->whereIn('ordered_by', $userIds);
                } elseif ($table === 'purchase_order_items') {
                    $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
                    $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();
                    $poIds = PurchaseOrder::whereIn('ordered_by', $userIds)->pluck('id')->toArray();
                    $query->whereIn('purchase_order_id', $poIds);
                } elseif ($table === 'stock_movements') {
                    $storeIds = Store::where('user_id', $user->id)->pluck('id')->toArray();
                    $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($user->id)->toArray();
                    $query->whereIn('performed_by', $userIds);
                } else {
                    // Default to filtering by user_id for medicines, customers, suppliers
                    $query->where('user_id', $user->id);
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

                // Map cashier_id back to user_id for client SQLite sales table
                if ($table === 'sales' && isset($array['cashier_id'])) {
                    $array['user_id'] = $array['cashier_id'];
                }

                // Map supplier_id to vendor_id and ordered_by to user_id for purchase_orders
                if ($table === 'purchase_orders') {
                    if (isset($array['supplier_id'])) {
                        $array['vendor_id'] = $array['supplier_id'];
                    }
                    if (isset($array['ordered_by'])) {
                        $array['user_id'] = $array['ordered_by'];
                    }
                }

                // Map purchase_order_items back to SQLite format
                if ($table === 'purchase_order_items') {
                    if (isset($array['purchase_order_id'])) {
                        $array['po_id'] = $array['purchase_order_id'];
                    }
                    if (isset($array['total_cost'])) {
                        $array['subtotal'] = $array['total_cost'];
                    }
                    if (isset($array['quantity_ordered'])) {
                        $array['bulk_quantity'] = $array['quantity_ordered'];
                        $array['units_per_bulk'] = 1;
                    }
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
            'inventory' => Inventory::class,
            'activity_logs' => ActivityLog::class,
            'categories' => \App\Models\Category::class,
            'vendors' => Vendor::class,
            'expenses' => Expense::class,
            'feedback' => \App\Models\Feedback::class,
            'stock_movements' => StockMovement::class,
            'purchase_orders' => PurchaseOrder::class,
            'purchase_order_items' => PurchaseOrderItem::class,
        ];
        return $map[$tableName] ?? null;
    }
}
