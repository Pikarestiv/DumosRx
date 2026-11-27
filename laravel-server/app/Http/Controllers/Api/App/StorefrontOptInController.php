<?php

namespace App\Http\Controllers\Api\App;

use App\Exceptions\StoreActionBlockedException;
use App\Http\Controllers\Controller;
use App\Services\Storefront\StorefrontEntitlements;
use App\Services\Storefront\StorefrontOptInService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class StorefrontOptInController extends Controller
{
    public function __construct(
        private readonly StorefrontOptInService $optIns,
        private readonly StorefrontEntitlements $entitlements,
    ) {}

    #[OA\Post(
        path: '/app/storefront/opt-in',
        summary: "Switch on the owner's opt-in storefront (Starter)",
        description: 'A Starter storefront stays off until the owner opts in. Idempotent: the first opt-in time is kept. Publishing still needs the store switched on by the account manager.',
        tags: ['Storefront'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: '{opted_in: true, entitlements}'),
            new OA\Response(response: 403, description: 'Staff, or a plan without a storefront (code UPGRADE_REQUIRED)'),
            new OA\Response(response: 422, description: 'The store has no storefront address yet'),
        ],
    )]
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->store_id) {
            return response()->json(['message' => 'Only the store owner can switch on the online store.'], 403);
        }

        if (! $this->entitlements->planOffersStorefront($user)) {
            return response()->json([
                'success' => false,
                'message' => 'An online store is not part of your plan. Upgrade to put your products online.',
                'code' => 'UPGRADE_REQUIRED',
            ], 403);
        }

        try {
            $this->optIns->optIn($user);
        } catch (StoreActionBlockedException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['opted_in' => true, 'entitlements' => $this->entitlements->forOwner($user)]);
    }
}
