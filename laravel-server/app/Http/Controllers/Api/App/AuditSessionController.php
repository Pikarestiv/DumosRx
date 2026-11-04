<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Concerns\ScopesToTenant;
use App\Http\Controllers\Controller;
use App\Models\AuditSession;
use App\Models\Store;
use App\Services\Audit\AuditSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditSessionController extends Controller
{
    use ScopesToTenant;

    public function __construct(private AuditSessionService $auditSessions) {}

    private function resolveStoreId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $ownerId = $this->tenantOwnerId($request);
        $requestedStoreId = $request->header('X-Store-Id') ?? $request->input('store_id');

        if ($requestedStoreId) {
            $owns = Store::where('id', $requestedStoreId)->where('user_id', $ownerId)->exists();
            if ($owns) {
                return $requestedStoreId;
            }
        }

        return $user->store_id ?? Store::where('user_id', $ownerId)->value('id');
    }

    private function resolveTill(Request $request): array
    {
        $tillId = $request->input('till_id') ?? $request->header('X-Device-Id');
        $tillName = $request->input('till_name') ?? $request->header('X-Device-Label') ?? 'Unnamed Till';

        return [$tillId, $tillName];
    }

    private function ensureSessionStoreScope(Request $request, AuditSession $session): void
    {
        $storeId = $this->resolveStoreId($request);
        if (! $storeId || $session->store_id !== $storeId) {
            abort(403, 'Unauthorized access to this store audit session.');
        }
    }

    public function active(Request $request): JsonResponse
    {
        $storeId = $this->resolveStoreId($request);
        if (! $storeId) {
            return response()->json(['success' => false, 'message' => 'No store associated.'], 400);
        }

        $includeItems = $request->boolean('include_items', true);
        $session = $this->auditSessions->getActiveSession($storeId, $includeItems);

        return response()->json([
            'success' => true,
            'session' => $session,
        ]);
    }

    public function start(Request $request): JsonResponse
    {
        $storeId = $this->resolveStoreId($request);
        if (! $storeId) {
            return response()->json(['success' => false, 'message' => 'No store associated.'], 400);
        }

        [$tillId, $tillName] = $this->resolveTill($request);
        if (! $tillId) {
            return response()->json(['success' => false, 'message' => 'Missing device or till identifier.'], 400);
        }

        $request->validate([
            'name' => 'nullable|string|max:255',
            'notes' => 'nullable|string|max:1000',
            'items' => 'present|array',
            'items.*.product_id' => 'required|string',
            'items.*.system_quantity' => 'nullable|numeric',
            'items.*.counted_quantity' => 'nullable|numeric',
            'items.*.cost_price' => 'nullable|numeric',
            'items.*.counted_cost_price' => 'nullable|numeric',
            'items.*.selling_price' => 'nullable|numeric',
            'items.*.counted_selling_price' => 'nullable|numeric',
            'items.*.counted' => 'nullable|boolean',
            'items.*.notes' => 'nullable|string|max:500',
            'items.*.counted_at' => 'nullable|string',
        ]);

        $session = $this->auditSessions->startSession(
            $storeId,
            $request->user()->id,
            $tillId,
            $tillName,
            $request->input('name'),
            $request->input('notes'),
            $request->input('items', [])
        );

        return response()->json([
            'success' => true,
            'session' => $session,
        ], 201);
    }

    public function heartbeat(Request $request, AuditSession $session): JsonResponse
    {
        $this->ensureSessionStoreScope($request, $session);

        [$tillId] = $this->resolveTill($request);
        $leaseVersion = (int) $request->input('lease_version');

        if (! $tillId || ! $leaseVersion) {
            return response()->json(['success' => false, 'message' => 'Missing till_id or lease_version.'], 400);
        }

        $updated = $this->auditSessions->heartbeat($session, $tillId, $leaseVersion, $request->user()->id);

        return response()->json([
            'success' => true,
            'lease_expires_at' => $updated->lease_expires_at,
            'lease_version' => $updated->lease_version,
        ]);
    }

    public function syncItems(Request $request, AuditSession $session): JsonResponse
    {
        $this->ensureSessionStoreScope($request, $session);

        [$tillId] = $this->resolveTill($request);
        $leaseVersion = (int) $request->input('lease_version');

        if (! $tillId || ! $leaseVersion) {
            return response()->json(['success' => false, 'message' => 'Missing till_id or lease_version.'], 400);
        }

        $request->validate([
            'items' => 'required|array',
            'items.*.product_id' => 'required|string',
            'items.*.system_quantity' => 'nullable|numeric',
            'items.*.counted_quantity' => 'nullable|numeric',
            'items.*.cost_price' => 'nullable|numeric',
            'items.*.counted_cost_price' => 'nullable|numeric',
            'items.*.selling_price' => 'nullable|numeric',
            'items.*.counted_selling_price' => 'nullable|numeric',
            'items.*.counted' => 'nullable|boolean',
            'items.*.notes' => 'nullable|string|max:500',
            'items.*.counted_at' => 'nullable|string',
        ]);

        $updated = $this->auditSessions->syncBatchItems($session, $tillId, $leaseVersion, $request->input('items'));

        return response()->json([
            'success' => true,
            'total_items_count' => $updated->total_items_count,
            'counted_items_count' => $updated->counted_items_count,
            'last_synced_at' => $updated->last_synced_at,
            'lease_expires_at' => $updated->lease_expires_at,
        ]);
    }

    public function takeover(Request $request, AuditSession $session): JsonResponse
    {
        $this->ensureSessionStoreScope($request, $session);

        [$tillId, $tillName] = $this->resolveTill($request);
        if (! $tillId) {
            return response()->json(['success' => false, 'message' => 'Missing till_id.'], 400);
        }

        $updated = $this->auditSessions->takeoverSession(
            $session,
            $request->user()->id,
            $tillId,
            $tillName,
            $request->input('reason')
        );

        return response()->json([
            'success' => true,
            'session' => $updated,
        ]);
    }

    public function complete(Request $request, AuditSession $session): JsonResponse
    {
        $this->ensureSessionStoreScope($request, $session);

        [$tillId] = $this->resolveTill($request);
        $leaseVersion = (int) $request->input('lease_version');

        if (! $tillId || ! $leaseVersion) {
            return response()->json(['success' => false, 'message' => 'Missing till_id or lease_version.'], 400);
        }

        $updated = $this->auditSessions->completeSession(
            $session,
            $tillId,
            $leaseVersion,
            $request->input('submitted_stock_audit_id')
        );

        return response()->json([
            'success' => true,
            'session' => $updated,
        ]);
    }

    public function abandon(Request $request, AuditSession $session): JsonResponse
    {
        $this->ensureSessionStoreScope($request, $session);

        $updated = $this->auditSessions->abandonSession(
            $session,
            $request->user()->id,
            $request->input('reason')
        );

        return response()->json([
            'success' => true,
            'session' => $updated,
        ]);
    }
}

