<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Admin\AdminSubscriptionLifecycleService;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class AdminSubscriptionController extends AdminBaseController
{
    private const ALLOWED_DAYS = [7, 14, 30];

    protected $lifecycle;

    public function __construct(AdminSubscriptionLifecycleService $lifecycle)
    {
        $this->lifecycle = $lifecycle;
    }

    #[OA\Get(
        path: '/admin/subscriptions/lifecycle',
        summary: 'Subscription lifecycle figures and worklist counts',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Figures', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
        ],
    )]
    public function lifecycle(Request $request)
    {
        return $this->withErrorResponse('Subscriptions', 'Failed to fetch subscription figures', function () use ($request) {
            return response()->json($this->lifecycle->figures($this->days($request)));
        });
    }

    #[OA\Get(
        path: '/admin/subscriptions/{bucket}',
        summary: 'One subscription worklist: expiring, trials, lapsed or payments',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'bucket', in: 'path', required: true, schema: new OA\Schema(type: 'string', enum: ['expiring', 'trials', 'lapsed', 'payments'])),
            new OA\Parameter(name: 'days', in: 'query', schema: new OA\Schema(type: 'integer', enum: [7, 14, 30], default: 7)),
            new OA\Parameter(name: 'page', in: 'query', schema: new OA\Schema(type: 'integer', default: 1)),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Worklist', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 422, description: 'Unknown bucket or window'),
        ],
    )]
    public function bucket(Request $request, string $bucket)
    {
        $days = $this->days($request);
        $page = max(1, (int) $request->query('page', 1));

        $result = match ($bucket) {
            'expiring' => $this->lifecycle->expiringSoon($days, $page),
            'trials' => $this->lifecycle->trialsEnding($days, $page),
            'lapsed' => $this->lifecycle->lapsed($page),
            'payments' => $this->lifecycle->paymentsNeedingAttention($days, $page),
            default => abort(422, 'Unknown subscription worklist.'),
        };

        return response()->json($result);
    }

    private function days(Request $request): int
    {
        $days = (int) $request->query('days', 7);

        if (! in_array($days, self::ALLOWED_DAYS, true)) {
            abort(422, 'Unsupported window.');
        }

        return $days;
    }
}
