<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use App\Models\Store;

class CheckAccountStatus
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user) {
            return $next($request);
        }

        if ($user->hasRole('super_admin')) {
            return $next($request);
        }

        if (!$user->is_active) {
            return response()->json([
                'success' => false,
                'message' => 'ACCOUNT_SUSPENDED',
                'reason' => 'Your user account has been deactivated/suspended. Please contact administrative support.'
            ], 403);
        }

        $store = $this->resolveRequestStore($request, $user);

        if ($store) {
            return $this->blockedResponse($store) ?? $next($request);
        }

        return $this->checkEveryOwnedStore($user) ?? $next($request);
    }

    /**
     * The store this request is acting on, resolved the same way
     * SyncController::resolvePushStoreId() does so that enforcement and
     * scoping never disagree: X-Store-Id (or a store_id input) when the
     * caller's tenant owns it, else the caller's own store_id. Returns null
     * for an owner who named no store — that case is decided by
     * checkEveryOwnedStore() instead. withTrashed() throughout, because an
     * archived store must still answer "is this account blocked?".
     */
    private function resolveRequestStore(Request $request, $user): ?Store
    {
        $requestedStoreId = $request->header('X-Store-Id') ?? $request->input('store_id');

        if ($requestedStoreId && is_string($requestedStoreId)) {
            $store = Store::withTrashed()->find($requestedStoreId);

            if ($store && $store->user_id === $this->tenantOwnerId($user)) {
                return $store;
            }
        }

        if ($user->store_id) {
            return Store::withTrashed()->find($user->store_id);
        }

        return null;
    }

    /**
     * An owner who named no store is only blocked when there is nothing left
     * to work with: if any owned store is still in good standing the request
     * proceeds and per-store scoping rejects the rest.
     */
    private function checkEveryOwnedStore($user): ?Response
    {
        $stores = Store::withTrashed()
            ->where('user_id', $this->tenantOwnerId($user))
            ->get();

        if ($stores->isEmpty()) {
            return null;
        }

        $blocked = $stores->filter(fn (Store $store) => $store->isSuspended() || $store->trashed());

        if ($blocked->count() < $stores->count()) {
            return null;
        }

        $suspended = $blocked->first(fn (Store $store) => $store->isSuspended());

        return $this->blockedResponse($suspended ?: $blocked->first());
    }

    private function blockedResponse(Store $store): ?Response
    {
        if ($store->isSuspended()) {
            return response()->json([
                'success' => false,
                'message' => 'ACCOUNT_SUSPENDED',
                'reason' => $store->suspension_reason ?: 'Your business account has been suspended for violating our terms of usage. Please contact administrative support.'
            ], 403);
        }

        if ($store->trashed()) {
            return response()->json([
                'success' => false,
                'message' => 'STORE_ARCHIVED',
                'reason' => 'This store has been archived by an administrator and can no longer sync or record data. Please contact administrative support.'
            ], 403);
        }

        return null;
    }

    private function tenantOwnerId($user): ?string
    {
        if (!$user->store_id) {
            return $user->id;
        }

        return Store::withTrashed()->where('id', $user->store_id)->value('user_id');
    }
}
