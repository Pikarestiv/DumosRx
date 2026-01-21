<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Models\Medicine;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Customer;
use App\Models\Supplier;
use App\Models\Inventory; // Using generic table if model not split yet, or specific models

class SyncController extends Controller
{
    /**
     * Push changes from client to server
     * 
     * Payload: { changes: [{ table_name, record_id, operation, payload: {} }] }
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
        $errors = [];

        DB::beginTransaction();

        try {
            foreach ($changes as $change) {
                // Table mapping whitelist for security
                $modelClass = $this->getModelForTable($change['table_name']);
                
                if (!$modelClass) {
                    Log::warning("Sync push ignored unknown table: " . $change['table_name']);
                    continue;
                }

                $payload = is_array($change['payload']) ? $change['payload'] : json_decode($change['payload'], true);
                
                // Add authoritative timestamp from server
                $now = now();

                if ($change['operation'] === 'INSERT') {
                    // Check if exists to avoid dupes (idempotency)
                    $exists = $modelClass::where('id', $payload['id'])->exists();
                    if (!$exists) {
                        // Create
                        $model = new $modelClass();
                        $model->fill($payload);
                        $model->id = $payload['id']; // Force UUID from client
                        $model->_synced_at = $now;
                        $model->save();
                    }
                } elseif ($change['operation'] === 'UPDATE') {
                    $model = $modelClass::find($payload['id']);
                    if ($model) {
                         // Simple Last-Write-Wins (LWW)
                         // Ideally check _version or updated_at, but for now server accepts client absolute truth for that record
                         $model->fill($payload);
                         $model->_synced_at = $now;
                         $model->save();
                    }
                } elseif ($change['operation'] === 'DELETE') {
                    // Soft delete
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
     * 
     * Payload: { last_synced: { medicines: '2024-01-01...', sales: '...' } }
     */
    public function pull(Request $request)
    {
        $lastSyncedMap = $request->input('last_synced', []);
        $changes = [];
        $serverTimestamp = now()->toIso8601String(); // Anchor timestamp for next sync

        // List of syncable tables
        $tables = ['medicines', 'customers', 'suppliers', 'sales'];

        foreach ($tables as $table) {
            $lastSynced = $lastSyncedMap[$table] ?? null;
            $modelClass = $this->getModelForTable($table);
            
            if (!$modelClass) continue;

            $query = $modelClass::withTrashed(); // Include soft deleted to propagate deletions

            if ($lastSynced) {
                // Fetch where updated_at > last_synced OR _synced_at > last_synced
                // (Server changes might set updated_at, but we need to capture any change we haven't seen)
                $query->where(function($q) use ($lastSynced) {
                    $q->where('updated_at', '>', $lastSynced)
                      ->orWhere('_synced_at', '>', $lastSynced);
                });
            }

            // Limit pull size per table to prevent huge payloads
            $records = $query->limit(500)->get(); 
            
            // Map records to include _deleted flag if soft deleted
            $changes[$table] = $records->map(function($item) {
                $array = $item->toArray();
                $array['_deleted'] = $item->trashed() ? 1 : 0;
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
             // Add others...
        ];
        return $map[$tableName] ?? null;
    }
}
