<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Customer;
use App\Models\Supplier;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\User;
use App\Models\ActivityLog;
use App\Models\Vendor;
use App\Models\Expense;
use App\Models\StockMovement;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\RequestedProduct;
use App\Services\Web\SyncPayloadMapper;
use OpenApi\Attributes as OA;

class SyncController extends Controller
{
    #[OA\Post(
        path: '/app/sync/push',
        summary: 'Push offline-first client changes to the server',
        description: 'Applies a batch of INSERT/UPDATE/DELETE changes from the client\'s local SQLite database. Conflict resolution uses `_version` (falling back to `updated_at`) — an incoming UPDATE older than the server\'s copy is silently ignored. May reject the whole request (403/429) if the store\'s plan disables cloud sync or the sync-interval throttle hasn\'t elapsed yet.',
        tags: ['Sync'],
        security: [['sanctum' => []]],
        parameters: [new OA\HeaderParameter(name: 'X-Store-Id', description: 'Which of the caller\'s stores to sync (defaults to their primary store)', schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['changes'],
            properties: [
                new OA\Property(property: 'changes', type: 'array', items: new OA\Items(
                    properties: [
                        new OA\Property(property: 'table_name', type: 'string'),
                        new OA\Property(property: 'operation', type: 'string', enum: ['INSERT', 'UPDATE', 'DELETE']),
                        new OA\Property(property: 'record_id', type: 'string'),
                        new OA\Property(property: 'payload', type: 'object', nullable: true),
                    ],
                )),
                new OA\Property(property: 'manual', type: 'boolean', description: 'Bypasses the plan\'s sync-interval throttle when true'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Changes applied', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'processed', type: 'integer'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 403, description: 'Cloud sync disabled on current plan, or store count exceeds plan limit'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 429, description: 'Sync-interval throttle not yet elapsed for this plan'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function push(Request $request)
    {
        $validation = $this->validateSync($request, true);
        if (!$validation['valid']) {
            return response()->json([
                'success' => false,
                'message' => $validation['message'],
                'code' => $validation['code']
            ], $validation['status']);
        }

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
        $currentUser = $request->user();
        $currentStoreId = null;
        if ($currentUser) {
            $requestedStoreId = $request->header('X-Store-Id') ?? $request->input('store_id');
            if ($requestedStoreId) {
                $ownerId = $currentUser->store_id 
                    ? Store::where('id', $currentUser->store_id)->value('user_id') 
                    : $currentUser->id;
                $ownsStore = Store::where('id', $requestedStoreId)->where('user_id', $ownerId)->exists();
                if ($ownsStore) {
                    $currentStoreId = $requestedStoreId;
                }
            }
            if (!$currentStoreId) {
                $currentStoreId = $currentUser->store_id ?? Store::where('user_id', $currentUser->id)->value('id');
            }
        }

        try {
            $idMap = [];

            foreach ($changes as $change) {
                $modelClass = $this->getModelForTable($change['table_name']);

                if (!$modelClass) {
                    Log::warning("Sync push ignored unknown table: " . $change['table_name']);
                    continue;
                }

                $payload = is_array($change['payload']) ? $change['payload'] : json_decode($change['payload'], true);
                
                // Strip client-only state flags that should never reach the DB
                if (isset($payload['_synced'])) {
                    unset($payload['_synced']);
                }
                
                // Apply ID mappings for foreign keys (if a previous record was merged due to conflict)
                foreach ($payload as $key => $value) {
                    if (is_string($value) && isset($idMap[$value])) {
                        $payload[$key] = $idMap[$value];
                    }
                }

                $context = ['user_id' => $currentUser ? $currentUser->id : null, 'store_id' => $currentStoreId];
                $payload = SyncPayloadMapper::map($change['table_name'], $payload, $context);

                $now = now();

                // Ensure staff users get associated with the store
                if ($change['table_name'] === 'users' && $currentStoreId) {
                    if (($payload['role'] ?? null) !== 'store_owner' && ($payload['role'] ?? null) !== 'admin') {
                        $payload['store_id'] = $payload['store_id'] ?? $currentStoreId;
                    }
                }

                // Map user_id to cashier_id for sales table coming from client
                if ($change['table_name'] === 'sales' && isset($payload['user_id'])) {
                    $payload['cashier_id'] = $payload['user_id'];
                    unset($payload['user_id']);
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

                // Inject user_id for core tables if missing
                $tablesWithUserId = [
                    'sales', 'customers', 'products', 'stock_batches',
                    'subscriptions', 'payment_transactions', 'categories',
                    'suppliers', 'prescriptions', 'stores',
                    'loyalty_tiers', 'loyalty_redemption_options'
                ];
                if (in_array($change['table_name'], $tablesWithUserId)) {
                    if (!isset($payload['user_id']) || empty($payload['user_id'])) {
                        if ($currentUser) {
                            $payload['user_id'] = $currentUser->id;
                        }
                    }

                // Inject device_id for stores if missing
                if ($change['table_name'] === 'stores') {
                    if (empty($payload['device_id'])) {
                        $payload['device_id'] = $request->header('X-Device-Id') ?? 'web-client';
                    }
                }
                }

                // Inject store_id if missing and table supports it
                $tablesWithStoreId = ['requested_products', 'payment_accounts'];
                if (in_array($change['table_name'], $tablesWithStoreId) && $currentStoreId) {
                    if (empty($payload['store_id'])) {
                        $payload['store_id'] = $currentStoreId;
                    }
                }

                // Prevent NULL constraint violations for products
                if ($change['table_name'] === 'products') {
                    if (empty($payload['pack_size'])) {
                        $payload['pack_size'] = 1;
                    }
                    if (empty($payload['unit_of_measure'])) {
                        $payload['unit_of_measure'] = 'piece';
                    }
                }

                // Prevent NULL constraint violations for suppliers/vendors
                if ($change['table_name'] === 'suppliers') {
                    if (empty($payload['payment_terms']) || $payload['payment_terms'] === 'null') {
                        $payload['payment_terms'] = 30; // Default fallback
                    }
                }

                // Handle audit_logs specific mappings
                if ($change['table_name'] === 'audit_logs') {
                    if (empty($payload['user_id']) && $currentUser) {
                        $payload['user_id'] = $currentUser->id;
                    }
                    $payload['description'] = "Action: " . ($payload['action'] ?? 'Unknown') . " on " . ($payload['table_name'] ?? 'unknown');
                    $payload['properties'] = [
                        'client_id' => $payload['id'] ?? null,
                        'table_name' => $payload['table_name'] ?? null,
                        'record_id' => $payload['record_id'] ?? null,
                        'details' => $payload['details'] ?? null,
                    ];
                    $payload['ip_address'] = $request->ip();
                    $payload['user_agent'] = $request->userAgent();
                    unset($payload['table_name']);
                    unset($payload['record_id']);
                    unset($payload['details']);
                    unset($payload['id']);
                }

                $recordId = $change['record_id'] ?? ($payload['id'] ?? null);

                if ($change['operation'] === 'INSERT' && $recordId) {
                    if ($change['table_name'] === 'audit_logs') {
                        $exists = $modelClass::where('properties->client_id', $recordId)->exists();
                    } else {
                        // Use withTrashed to catch soft-deleted items so we don't get Duplicate Entry crashes
                        $exists = \method_exists($modelClass, 'trashed') 
                            ? $modelClass::withTrashed()->where('id', $recordId)->exists() 
                            : $modelClass::where('id', $recordId)->exists();
                    }

                    if ($exists) {
                        // If it exists (even if soft-deleted), we should treat it as an UPDATE
                        // to restore it and apply the new payload instead of crashing on INSERT
                        $change['operation'] = 'UPDATE';
                        Log::info("Sync push: Overriding INSERT to UPDATE for existing record {$recordId} in {$change['table_name']}");
                    }
                }

                if ($change['operation'] === 'INSERT') {
                    // Re-calculate exists for normal INSERT flow just in case
                    $exists = false;

                    // Prevent duplicate email/username crashes for users
                    if (!$exists && $change['table_name'] === 'users') {
                        $conflict = $modelClass::where('email', $payload['email'])
                                             ->orWhere(function ($q) use ($payload) {
                                                 $q->where('username', $payload['username'] ?? null)
                                                   ->where('store_id', $payload['store_id'] ?? null);
                                             })
                                             ->first();
                        if ($conflict) {
                            Log::warning("Sync push skipped user insert due to duplicate email/username: {$payload['email']}");
                            $exists = true; // Pretend it exists to skip insertion
                            $idMap[$recordId] = $conflict->id;
                        }
                    }

                    // Prevent duplicate category name crashes
                    if (!$exists && $change['table_name'] === 'categories' && !empty($payload['name'])) {
                        $conflict = $modelClass::where('name', $payload['name'])->first();
                        if ($conflict) {
                            Log::warning("Sync push skipped category insert due to duplicate name: {$payload['name']}");
                            $exists = true; // Pretend it exists to skip insertion
                            $idMap[$recordId] = $conflict->id;
                        }
                    }
                    
                    // Prevent duplicate supplier name crashes
                    if (!$exists && $change['table_name'] === 'suppliers' && !empty($payload['name'])) {
                        $conflict = $modelClass::where('name', $payload['name'])->first();
                        if ($conflict) {
                            Log::warning("Sync push skipped supplier insert due to duplicate name: {$payload['name']}");
                            $exists = true; // Pretend it exists to skip insertion
                            $idMap[$recordId] = $conflict->id;
                        }
                    }

                    if (!$exists) {
                        $model = new $modelClass();
                        $model->forceFill($payload);
                        
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
                        
                        if ($change['table_name'] === 'audit_logs') {
                            if (isset($payload['created_at'])) {
                                $model->created_at = $payload['created_at'];
                            }
                        } else {
                            $model->id = $recordId;
                        }
                        
                        $isDeleted = null;
                        if (isset($payload['_deleted'])) {
                            $isDeleted = $payload['_deleted'];
                            unset($payload['_deleted']);
                        }

                        $model->forceFill($payload);

                        $table = $model->getTable();
                        if (!isset($hasSyncedAtCache[$table])) {
                            $hasSyncedAtCache[$table] = \Illuminate\Support\Facades\Schema::hasColumn($table, '_synced_at');
                        }
                        if ($hasSyncedAtCache[$table]) {
                            $model->_synced_at = $now;
                        }
                        
                        if ($change['table_name'] === 'suppliers') {
                            if (empty($model->payment_terms) || $model->payment_terms === 'null') {
                                $model->payment_terms = 30;
                            }
                        }
                        if ($change['table_name'] === 'products') {
                            if (empty($model->pack_size) || $model->pack_size === 'null') $model->pack_size = 1;
                            if (empty($model->unit_of_measure) || $model->unit_of_measure === 'null') $model->unit_of_measure = 'piece';
                        }
                        
                        if ($change['table_name'] === 'stores') {
                            if (empty($model->device_id)) {
                                $model->device_id = $request->header('X-Device-Id') ?? 'web-client';
                            }
                        }
                        
                        $model->save();

                        // Note: stock_movements rows are a pure audit log from the client's
                        // perspective — every caller that inserts one (procurement receiving,
                        // sales, returns, POS checkout) has already applied the real quantity
                        // change to stock_batches itself (via its own INSERT/UPDATE, which is
                        // pushed and applied separately). Re-applying the movement's quantity
                        // as a delta here double-counted every stock change on sync — this used
                        // to live here but was removed for exactly that reason.

                        // Handle _deleted flag for soft deletes
                        if ($isDeleted) {
                            if (\method_exists($model, 'trashed')) {
                                $model->delete();
                            }
                        }
                    }
                } elseif ($change['operation'] === 'UPDATE') {
                    $recordId = $change['record_id'] ?? ($payload['id'] ?? null);
                    // Use withTrashed to ensure we can find soft-deleted items to restore them if needed
                    $model = \method_exists($modelClass, 'trashed') ? $modelClass::withTrashed()->find($recordId) : $modelClass::find($recordId);
                    
                    if ($model) {
                        // Conflict Resolution: Use _version if available, fallback to updated_at
                        $payloadVersion = isset($payload['_version']) ? (int)$payload['_version'] : null;
                        $modelVersion = isset($model->_version) ? (int)$model->_version : null;
                        
                        $isOlder = false;
                        if ($payloadVersion !== null && $modelVersion !== null && $payloadVersion !== $modelVersion) {
                            $isOlder = $payloadVersion < $modelVersion;
                        } elseif ($model->updated_at && isset($payload['updated_at'])) {
                            // Fallback to updated_at if versions are equal or missing
                            $modelUpdatedAt = \Carbon\Carbon::parse($model->updated_at);
                            $payloadUpdatedAt = \Carbon\Carbon::parse($payload['updated_at']);
                            $isOlder = $payloadUpdatedAt->lt($modelUpdatedAt);
                        }

                        if ($isOlder) {
                            Log::info("Sync push: Ignored older update for {$change['table_name']} {$recordId}");
                            continue;
                        }

                        // Pre-process payload before forceFill
                        $isDeleted = null;
                        if (isset($payload['_deleted'])) {
                            $isDeleted = $payload['_deleted'];
                            unset($payload['_deleted']);
                        }

                        // Inventory Reconciliation: Ignore quantity updates for stock_batches, rely on stock_movements
                        if ($change['table_name'] === 'stock_batches') {
                            if (isset($payload['quantity'])) {
                                unset($payload['quantity']);
                            }
                        }

                        $model->forceFill($payload);
                        
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

                        if ($change['table_name'] === 'suppliers') {
                            if (empty($model->payment_terms) || $model->payment_terms === 'null') {
                                $model->payment_terms = 30;
                            }
                        }
                        if ($change['table_name'] === 'products') {
                            if (empty($model->pack_size) || $model->pack_size === 'null') $model->pack_size = 1;
                            if (empty($model->unit_of_measure) || $model->unit_of_measure === 'null') $model->unit_of_measure = 'piece';
                        }

                        if ($change['table_name'] === 'stores') {
                            if (empty($model->device_id)) {
                                $model->device_id = $request->header('X-Device-Id') ?? 'web-client';
                            }
                        }
                        
                        $model->save();

                        // Handle _deleted flag for soft deletes on update
                        if ($isDeleted !== null) {
                            if (\method_exists($model, 'trashed')) {
                                if ($isDeleted && !$model->trashed()) {
                                    $model->delete();
                                } elseif (!$isDeleted && $model->trashed()) {
                                    $model->restore();
                                }
                            }
                        }
                    }
                } elseif ($change['operation'] === 'DELETE') {
                    $modelClass::where('id', $change['record_id'])->delete();
                }

                $processed++;
            }

            // Update the last sync time for the user's store
            if ($request->user()) {
                $user = $request->user();
                $store = null;
                if ($user->store_id) {
                    $store = Store::where('id', $user->store_id)->first();
                } else {
                    $store = Store::where('user_id', $user->id)->first();
                }

                if ($store) {
                    $isFirstSync = is_null($store->last_sync_at);
                    $store->last_sync_at = now();
                    $store->save();

                    if ($isFirstSync) {
                        try {
                            \App\Services\AdminAlertService::send(
                                'First-Time Sync Completed: ' . $store->name,
                                [
                                    "A user has just successfully completed their first local sync with the DumosRx Cloud.",
                                    "Store: {$store->name}",
                                    "User: {$user->first_name} {$user->last_name} ({$user->email})"
                                ]
                            );
                        } catch (\Exception $e) {
                            Log::error("Failed to send super admin alert for sync: " . $e->getMessage());
                        }
                    }
                }
            }

            DB::commit();
            return response()->json(['success' => true, 'processed' => $processed]);

        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('Sync push failed: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Sync failed', 'error' => $e->getMessage()], 500);
        }
    }

    #[OA\Post(
        path: '/app/sync/pull',
        summary: 'Pull server-side changes down to the client',
        description: 'Returns, per table, every row changed since the client\'s last-known sync timestamp for that table (max 500 rows/table/call — clients should loop until a response comes back empty). Soft-deleted rows are included with `_deleted: 1` so the client can remove them locally too.',
        tags: ['Sync'],
        security: [['sanctum' => []]],
        parameters: [new OA\HeaderParameter(name: 'X-Store-Id', description: 'Which of the caller\'s stores to sync (defaults to their primary store)', schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(
                property: 'last_synced',
                type: 'object',
                description: 'Map of table_name -> ISO8601 timestamp of the last successful pull for that table. Omit/empty to do a full initial sync.',
                additionalProperties: new OA\AdditionalProperties(type: 'string', format: 'date-time'),
            ),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Changed rows per table', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'server_timestamp', type: 'string', format: 'date-time'),
                new OA\Property(property: 'changes', type: 'object', description: 'Keyed by table name, each value an array of row objects', additionalProperties: new OA\AdditionalProperties(type: 'array', items: new OA\Items(type: 'object'))),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 403, description: 'Cloud sync disabled on current plan, or store count exceeds plan limit'),
            new OA\Response(response: 429, description: 'Sync-interval throttle not yet elapsed for this plan'),
        ],
    )]
    public function pull(Request $request)
    {
        $validation = $this->validateSync($request, false);
        if (!$validation['valid']) {
            return response()->json([
                'success' => false,
                'message' => $validation['message'],
                'code' => $validation['code']
            ], $validation['status']);
        }

        $lastSyncedMap = $request->input('last_synced', []);
        $changes = [];
        $serverTimestamp = now()->toIso8601String();
        $tables = ['products', 'stock_batches', 'categories', 'customers', 'suppliers', 'sales', 'sale_items', 'sale_item_batches', 'stores', 'users', 'stock_movements', 'purchase_orders', 'purchase_order_items', 'expenses', 'payment_accounts', 'requested_products', 'supplier_payments', 'returns', 'return_items', 'prescriptions', 'prescription_items', 'loyalty_tiers', 'loyalty_redemption_options'];

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
                $ownerId = $user->store_id 
                    ? Store::where('id', $user->store_id)->value('user_id') 
                    : $user->id;
                
                $requestedStoreId = $request->header('X-Store-Id') ?? $request->input('store_id');
                if ($requestedStoreId) {
                    $ownsStore = Store::where('id', $requestedStoreId)->where('user_id', $ownerId)->exists();
                    if ($ownsStore) {
                        $storeIds = [$requestedStoreId];
                    } else {
                        $storeIds = [];
                    }
                } else {
                    $storeIds = $user->store_id 
                        ? [$user->store_id] 
                        : Store::where('user_id', $ownerId)->pluck('id')->toArray();
                }
                    
                $userIds = User::whereIn('store_id', $storeIds)->pluck('id')->push($ownerId)->toArray();

                match ($table) {
                    'users' => $query->whereIn('id', $userIds),
                    'stores' => $query->whereIn('id', $storeIds)->with(['user.subscriptions']),
                    'sales' => $query->whereIn('cashier_id', $userIds),
                    'sale_items' => $query->whereIn('sale_id', Sale::whereIn('cashier_id', $userIds)->pluck('id')),
                    'returns' => $query->whereIn('user_id', $userIds),
                    'return_items' => $query->whereIn('return_id', \App\Models\SaleReturn::whereIn('user_id', $userIds)->pluck('id')),
                    'prescriptions' => $query->whereIn('customer_id', Customer::where('user_id', $ownerId)->pluck('id')),
                    'prescription_items' => $query->whereIn('prescription_id', \App\Models\Prescription::whereIn('customer_id', Customer::where('user_id', $ownerId)->pluck('id'))->pluck('id')),
                    'purchase_orders' => $query->whereIn('ordered_by', $userIds),
                    'purchase_order_items' => $query->whereIn('purchase_order_id', PurchaseOrder::whereIn('ordered_by', $userIds)->pluck('id')),
                    'stock_movements' => $query->whereIn('performed_by', $userIds),
                    'stock_batches' => $query->whereIn('product_id', Product::where('user_id', $ownerId)->pluck('id')),
                    'supplier_payments' => $query->whereIn('supplier_id', Supplier::where('user_id', $ownerId)->pluck('id')),
                    'requested_products' => $query->whereIn('store_id', $storeIds),
                    'loyalty_tiers' => $query->where('user_id', $ownerId),
                    'loyalty_redemption_options' => $query->where('user_id', $ownerId),
                    'sale_item_batches' => $query->whereIn('sale_item_id', SaleItem::whereIn('sale_id', Sale::whereIn('cashier_id', $userIds)->pluck('id'))->pluck('id')),
                    default => $query->where('user_id', $ownerId),
                };
            }

            $lastSynced = $lastSyncedMap[$table] ?? null;
            if ($lastSynced && $table !== 'stores') {
                $parsedLastSynced = \Carbon\Carbon::parse($lastSynced)->setTimezone('UTC')->format('Y-m-d H:i:s');
                if (\Illuminate\Support\Facades\Schema::hasColumn($table, '_synced_at')) {
                    $query->where(function($q) use ($parsedLastSynced) {
                        $q->where('_synced_at', '>', $parsedLastSynced)
                          ->orWhere('updated_at', '>', $parsedLastSynced);
                    });
                } else {
                    $query->where('updated_at', '>', $parsedLastSynced);
                }
            }

            $records = $query->limit(500)->get();

            $changes[$table] = $records->map(function ($item) use ($table) {
                $array = $item->toArray();
                $array['_deleted'] = (\method_exists($item, 'trashed') && $item->trashed()) ? 1 : 0;

                if ($table === 'stores') {
                    $plan = 'free';
                    $expiry = null;
                    $isTrial = false;
                    if ($item->user && $item->user->subscriptions->isNotEmpty()) {
                        $sub = $item->user->subscriptions()
                            ->where('status', 'active')
                            ->where('end_date', '>', now())
                            ->latest()
                            ->first();
                        if ($sub) {
                            $plan = $sub->plan_name;
                            $expiry = $sub->end_date;
                            $isTrial = $sub->is_trial;
                        }
                    }
                    $array['subscription_tier'] = $plan;
                    // Generate license token for offline validation
                    if (($plan !== 'free' || $isTrial) && !empty($expiry)) {
                        $array['license_token'] = json_encode([
                            'tier' => $plan,
                            'expiry' => \Carbon\Carbon::parse($expiry)->toIso8601String(),
                            'is_trial' => (bool) $isTrial
                        ]);
                    } else {
                        $array['license_token'] = null;
                    }
                }

                // Map users fields for SQLite
                if ($table === 'users') {
                    if (empty($array['username'])) {
                        $array['username'] = $array['email'] ?: 'user_' . substr($array['id'], 0, 8);
                    }
                    if (!isset($array['name']) && isset($array['first_name'])) {
                        $array['name'] = trim(($array['first_name'] ?? '') . ' ' . ($array['last_name'] ?? ''));
                    }
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
            'products' => Product::class,
            'customers' => Customer::class,
            'suppliers' => Supplier::class,
            'sales' => Sale::class,
            'sale_items' => SaleItem::class,
            'stores' => Store::class,
            'users' => User::class,
            'stock_batches' => StockBatch::class,
            'activity_logs' => ActivityLog::class,
            'audit_logs' => ActivityLog::class,
            'categories' => \App\Models\Category::class,
            'expenses' => Expense::class,
            'feedback' => \App\Models\Feedback::class,
            'stock_movements' => StockMovement::class,
            'purchase_orders' => PurchaseOrder::class,
            'purchase_order_items' => PurchaseOrderItem::class,
            'payment_accounts' => \App\Models\PaymentAccount::class,
            'returns' => \App\Models\SaleReturn::class,
            'return_items' => \App\Models\SaleReturnItem::class,
            'requested_products' => RequestedProduct::class,
            'supplier_payments' => \App\Models\SupplierPayment::class,
            'prescriptions' => \App\Models\Prescription::class,
            'prescription_items' => \App\Models\PrescriptionItem::class,
            'loyalty_tiers' => \App\Models\LoyaltyTier::class,
            'loyalty_redemption_options' => \App\Models\LoyaltyRedemptionOption::class,
            'sale_item_batches' => \App\Models\SaleItemBatch::class,
        ];
        return $map[$tableName] ?? null;
    }

    private function validateSync(Request $request, $isPush = true)
    {
        $user = $request->user();
        if ($user && $user->role !== 'super_admin') {
            $subscriptionService = app(\App\Services\SubscriptionService::class);
            $owner = $subscriptionService->getSubscriptionOwner($user);
            
            // Check active subscription
            $sub = $owner->subscriptions()->where('status', 'active')->where('end_date', '>', now())->latest()->first();
            $plan = $sub ? strtolower($sub->plan_name) : 'free';
            
            $systemConfig = \App\Models\SystemConfig::getVal('subscription_plans', []);
            $canSync = $systemConfig['tiers'][$plan]['features']['cloud_sync'] ?? false;
            
            $isManual = $request->boolean('manual');
            $isSetup = $request->boolean('setup') || (!$isPush && empty($request->input('last_synced', [])));
            
            if (!$isSetup) {
                if (!$canSync) {
                    return [
                        'valid' => false,
                        'message' => 'Cloud sync is disabled on your current plan. Please upgrade to a premium plan to backup your data.',
                        'code' => 'SYNC_DISABLED',
                        'status' => 403
                    ];
                }

                $syncIntervalMinutes = $systemConfig['tiers'][$plan]['limits']['sync_interval'] ?? 0;
                
                if ($syncIntervalMinutes > 0 && !$isManual) {
                    $store = Store::where('user_id', $owner->id)->first() ?? Store::where('id', $user->store_id)->first();
                    if ($store && $store->last_sync_at) {
                        $minutesSinceLastSync = abs((int)$store->last_sync_at->diffInMinutes(now()));
                        if ($minutesSinceLastSync < $syncIntervalMinutes) {
                            // Allow pull requests that happen immediately after a push (in the same minute)
                            if (!$isPush && $minutesSinceLastSync === 0) {
                                // Skip throttling for this immediate paired pull
                            } else {
                                $intervalText = $syncIntervalMinutes >= 60 
                                    ? floor($syncIntervalMinutes / 60) . ' hours' 
                                    : $syncIntervalMinutes . ' minutes';
                                    
                                return [
                                    'valid' => false,
                                    'message' => "Sync limit reached. Your current plan synchronizes once every {$intervalText}. Last sync: " . $store->last_sync_at->diffForHumans() . '. Please upgrade your plan for faster sync.',
                                    'code' => 'SYNC_THROTTLED',
                                    'status' => 429
                                ];
                            }
                        }
                    }
                }
            }
            
            // Enforce staff limits
            $subscriptionService->enforceStaffLimits($owner);

            // Enforce store limits for syncing
            $storeLimit = \App\Models\SystemConfig::getVal('subscription_plans')['tiers'][$plan]['limits']['stores'] ?? 0;
            if ($storeLimit !== -1) {
                $allowedStoreIds = Store::where('user_id', $owner->id)->orderBy('created_at', 'asc')->limit($storeLimit)->pluck('id')->toArray();
                
                $syncStoreId = $user->store_id ?? Store::where('user_id', $user->id)->value('id');
                
                if ($syncStoreId && !in_array($syncStoreId, $allowedStoreIds)) {
                    return [
                        'valid' => false,
                        'message' => "Sync rejected. Your " . ucfirst($plan) . " plan limits you to {$storeLimit} store(s). This store exceeds your limit and has been temporarily paused from cloud syncing.",
                        'code' => 'STORE_LIMIT_EXCEEDED',
                        'status' => 403
                    ];
                }
            }
        }
        
        return ['valid' => true];
    }
}
