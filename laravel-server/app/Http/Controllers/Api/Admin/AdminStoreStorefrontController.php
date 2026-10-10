<?php

namespace App\Http\Controllers\Api\Admin;

use App\Exceptions\StoreActionBlockedException;
use App\Services\Admin\AdminStoreStorefrontService;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

/**
 * Publish / unpublish a store's public storefront from the admin panel.
 * Separate from AdminStoreController, which is already past the repo's
 * 350-line rule.
 */
class AdminStoreStorefrontController extends AdminBaseController
{
    public function __construct(private AdminStoreStorefrontService $storefrontService) {}

    #[OA\Put(
        path: '/admin/stores/{id}/storefront',
        summary: "Publish or unpublish a store's online storefront, and optionally set its slug",
        description: 'Sets stores.online_store_enabled, and stores.store_slug when `store_slug` is sent. The public endpoints additionally require a slug and the owner\'s current store_url entitlement, so enabling this is necessary but not sufficient for a reachable page. Enabling a store with no slug is still refused. A slug is refused (422) if it slugifies to nothing or over 100 characters, if any other store (including an archived one) already holds it, or if the store\'s 6-month slug-change cooldown is live.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['enabled'],
            properties: [
                new OA\Property(property: 'enabled', type: 'boolean'),
                new OA\Property(property: 'store_slug', type: 'string', description: 'Slugified before storing. Omit to leave the current slug alone.'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'online_store_enabled', type: 'boolean'),
                new OA\Property(property: 'store_slug', type: 'string', nullable: true),
            ])),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Missing the manage_account_status permission'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'Enabling a store that has no storefront slug, or a slug that is malformed, taken, or inside the change cooldown'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function update(Request $request, string $id)
    {
        $validated = $request->validate([
            'enabled' => 'required|boolean',
            'store_slug' => 'sometimes|string|max:255',
        ]);

        return $this->withErrorResponse('Storefront Toggle', 'Failed to update the storefront', function () use ($id, $validated) {
            try {
                $store = $this->storefrontService->setEnabled(
                    $id,
                    (bool) $validated['enabled'],
                    $validated['store_slug'] ?? null,
                );
            } catch (StoreActionBlockedException $e) {
                // `message`, not the admin controllers' usual `error` key:
                // base-client.ts only lifts `data.message` onto the thrown
                // Error, so this is the one shape the toast can actually read.
                return response()->json(['message' => $e->getMessage()], 422);
            }

            return response()->json([
                'message' => $store->online_store_enabled
                    ? 'Storefront published'
                    : 'Storefront unpublished',
                'online_store_enabled' => (bool) $store->online_store_enabled,
                'store_slug' => $store->store_slug,
            ]);
        });
    }
}
