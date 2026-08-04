<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Services\Web\DashboardService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use OpenApi\Attributes as OA;

class DashboardController extends Controller
{
    protected $dashboardService;

    public function __construct(DashboardService $dashboardService)
    {
        $this->dashboardService = $dashboardService;
    }

    #[OA\Get(
        path: '/dashboard/summary',
        summary: 'Store dashboard summary metrics',
        tags: ['Dashboard'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'period', in: 'query', description: 'Lookback window', schema: new OA\Schema(type: 'string', default: '7d', enum: ['7d', '30d', 'this_month', 'this_year', 'all_time']))],
        responses: [
            new OA\Response(response: 200, description: 'Dashboard data', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function summary(Request $request)
    {
        try {
            $period = $request->query('period', '7d');
            $data = $this->dashboardService->getSummary($request->user(), $period);
            return response()->json($data);
        } catch (\Exception $e) {
            Log::critical("Dashboard Controller Error: " . $e->getMessage());
            return response()->json([
                'error' => 'Internal Server Error',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    #[OA\Post(
        path: '/dashboard/reset',
        summary: "Reset (wipe) the store's data",
        description: 'Destructive — irreversible. Exact scope of what gets wiped depends on `type`.',
        tags: ['Dashboard'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'type', type: 'string', default: 'all', description: 'What to reset — see DashboardService::resetData'),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Reset result', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function resetData(Request $request)
    {
        try {
            $type = $request->input('type', 'all');
            $result = $this->dashboardService->resetData($request->user(), $type);
            return response()->json($result);
        } catch (\Exception $e) {
            Log::error("Dashboard Reset Error: " . $e->getMessage());
            return response()->json([
                'error' => 'Reset Failed',
                'message' => $e->getMessage()
            ], 500);
        }
    }
}
