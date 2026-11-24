<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Services\Admin\AdminStorefrontRebuildService;
use App\Services\Storefront\StorefrontEntitlements;
use App\Services\Storefront\StorefrontRebuildDispatcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class StorefrontOwnerRebuildController extends Controller
{
    public function __construct(
        private readonly AdminStorefrontRebuildService $rebuilds,
        private readonly StorefrontEntitlements $entitlements,
    ) {}

    #[OA\Post(
        path: '/app/storefront/rebuild',
        summary: "Publish the owner's storefront changes now (Enterprise)",
        description: 'Needs the rebuild_mode on_demand storefront entitlement; a super admin is always allowed. One build publishes every storefront, so pending changes of other stores ship with it. Limited to 3 an hour per user. 202 means GitHub accepted the dispatch, not that the deploy finished.',
        tags: ['Storefront'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 202, description: 'Rebuild requested'),
            new OA\Response(response: 403, description: 'Staff, or a plan that rebuilds on the daily schedule (code UPGRADE_REQUIRED)'),
            new OA\Response(response: 422, description: 'Rebuilds are not configured, or GitHub refused the dispatch'),
            new OA\Response(response: 429, description: 'Too many rebuilds this hour'),
        ],
    )]
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user->hasRole('super_admin')) {
            if ($user->store_id) {
                return response()->json(['message' => 'Only the store owner can publish storefront changes.'], 403);
            }

            if ($this->entitlements->forOwner($user)['rebuild_mode'] !== 'on_demand') {
                return response()->json([
                    'success' => false,
                    'message' => 'Publishing changes on demand is part of the Enterprise plan. Your storefront updates every night.',
                    'code' => 'UPGRADE_REQUIRED',
                ], 403);
            }
        }

        $failure = $this->rebuilds->rebuildNow('Requested a rebuild of every storefront from the store app');

        return match (true) {
            $failure === StorefrontRebuildDispatcher::NOT_CONFIGURED => response()->json(['message' => 'Storefront publishing is not available right now. Try again later.'], 422),
            $failure !== null => response()->json(['message' => 'The storefront could not be published right now. Try again in a few minutes.'], 422),
            default => response()->json(['message' => 'Publishing now. Your storefront updates in a few minutes.'], 202),
        };
    }
}
