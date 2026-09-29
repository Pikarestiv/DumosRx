<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Admin\AdminStoreDeletionService;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

/**
 * Archive / restore / purge for a store. Separate from AdminStoreController
 * so the irreversible endpoint is not buried among the routine ones, and so
 * neither file grows past the repo's 350-line rule.
 *
 * Every route here is super_admin-only in routes/api.php, and the purge
 * additionally requires the caller to echo back the literal confirmation
 * phrase. The phrase is validated server-side, not only in the dialog, so a
 * direct API call cannot skip the friction the UI imposes.
 */
class AdminStoreDeletionController extends AdminBaseController
{
    public const PURGE_CONFIRMATION = 'DumosRx';

    public function __construct(private AdminStoreDeletionService $deletionService)
    {
    }

    #[OA\Delete(
        path: '/admin/stores/{id}',
        summary: 'Archive (soft delete) a store',
        description: 'Sets stores.deleted_at. No data is removed; the store drops out of every normal listing until it is restored.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Archived', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 404, description: 'Store not found or already archived'),
        ],
    )]
    public function archiveStore(Request $request, string $id)
    {
        $validated = $request->validate([
            'reason' => 'nullable|string|max:1000',
        ]);

        return $this->withErrorResponse('Archive Store', 'Failed to archive store', function () use ($request, $id, $validated) {
            $store = $this->deletionService->archiveStore($id, $validated['reason'] ?? null, $request->user());

            if (!$store) {
                return response()->json(['error' => 'Store not found or already archived'], 404);
            }

            return response()->json(['message' => 'Store archived successfully']);
        });
    }

    #[OA\Post(
        path: '/admin/stores/{id}/restore',
        summary: 'Restore an archived store',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Restored', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 404, description: 'No archived store with this id'),
        ],
    )]
    public function restoreStore(Request $request, string $id)
    {
        return $this->withErrorResponse('Restore Store', 'Failed to restore store', function () use ($request, $id) {
            $store = $this->deletionService->restoreStore($id, $request->user());

            if (!$store) {
                return response()->json(['error' => 'No archived store with this id'], 404);
            }

            return response()->json(['message' => 'Store restored successfully']);
        });
    }

    #[OA\Delete(
        path: '/admin/stores/{id}/purge',
        summary: 'Permanently delete a store and every record scoped to it',
        description: 'Irreversible. Requires `confirmation` to equal the literal string "DumosRx".',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['confirmation'],
            properties: [new OA\Property(property: 'confirmation', type: 'string', example: 'DumosRx')],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Purged', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 404, description: 'Store not found'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'Confirmation phrase missing or wrong'),
        ],
    )]
    public function purgeStore(Request $request, string $id)
    {
        $request->validate([
            'confirmation' => 'required|string|in:'.self::PURGE_CONFIRMATION,
        ], [
            'confirmation.in' => 'Type '.self::PURGE_CONFIRMATION.' exactly to confirm this permanent deletion.',
        ]);

        return $this->withErrorResponse('Purge Store', 'Failed to permanently delete store', function () use ($request, $id) {
            $removed = $this->deletionService->purgeStore($id, $request->user());

            if ($removed === null) {
                return response()->json(['error' => 'Store not found'], 404);
            }

            return response()->json([
                'message' => 'Store permanently deleted',
                'removed' => $removed,
            ]);
        });
    }
}
