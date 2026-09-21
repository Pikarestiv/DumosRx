<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Admin\AdminRevenueService;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class RevenueController extends AdminBaseController
{
    protected $adminRevenueService;

    public function __construct(AdminRevenueService $adminRevenueService)
    {
        $this->adminRevenueService = $adminRevenueService;
    }

    #[OA\Get(
        path: '/admin/marketing/revenue',
        summary: 'Subscription payment revenue overview (Marketing > Revenue tab)',
        description: 'Aggregates PaymentTransaction rows: total revenue, revenue by plan tier, manual (bank transfer) vs automated split, and a filterable/paginated transaction list.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'page', in: 'query', schema: new OA\Schema(type: 'integer', default: 1)),
            new OA\Parameter(name: 'search', in: 'query', description: 'Matches customer name/email or the payment reference', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'provider', in: 'query', description: 'e.g. bank_transfer, paystack', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'plan', in: 'query', schema: new OA\Schema(type: 'string', enum: ['starter', 'pro', 'enterprise'])),
            new OA\Parameter(name: 'date_from', in: 'query', schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'date_to', in: 'query', schema: new OA\Schema(type: 'string', format: 'date')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Revenue overview', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function overview(Request $request)
    {
        return $this->withErrorResponse('Revenue Overview', 'Failed to fetch revenue overview', function () use ($request) {
            $data = $this->adminRevenueService->getOverview(
                $request->query('page', 1),
                $request->query('search'),
                $request->query('provider'),
                $request->query('plan'),
                $request->query('date_from'),
                $request->query('date_to'),
            );

            return response()->json($data);
        });
    }
}
