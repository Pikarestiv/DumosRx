<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Admin\AdminSyncHealthService;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class AdminSyncHealthController extends AdminBaseController
{
    public function queueState(string $id)
    {
        return response()->json(
            app(\App\Services\Admin\DeviceQueueReportService::class)->forStore($id)
        );
    }

    public function stockDivergence(string $id)
    {
        return response()->json(
            app(\App\Services\Admin\StockDivergenceService::class)->forStore($id)
        );
    }

    protected $syncHealthService;

    public function __construct(AdminSyncHealthService $syncHealthService)
    {
        $this->syncHealthService = $syncHealthService;
    }

    #[OA\Get(
        path: '/admin/sync/health',
        summary: 'Platform-wide sync health: success rate, failure reasons, worst-affected stores',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Sync health summary', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function summary(Request $request)
    {
        return $this->withErrorResponse('Sync Health', 'Failed to fetch sync health', function () {
            return response()->json($this->syncHealthService->platformSummary());
        });
    }

    #[OA\Get(
        path: '/admin/sync/stores/{id}',
        summary: "One store's recent sync failures and daily accepted/refused series",
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'page', in: 'query', schema: new OA\Schema(type: 'integer', default: 1)),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Store sync health', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
        ],
    )]
    public function store(Request $request, string $id)
    {
        return $this->withErrorResponse('Sync Health', 'Failed to fetch store sync health', function () use ($request, $id) {
            return response()->json(
                $this->syncHealthService->storeHealth($id, (int) $request->query('page', 1))
            );
        });
    }
}
