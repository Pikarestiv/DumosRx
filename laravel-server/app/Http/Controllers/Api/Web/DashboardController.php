<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Services\Web\DashboardService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class DashboardController extends Controller
{
    protected $dashboardService;

    public function __construct(DashboardService $dashboardService)
    {
        $this->dashboardService = $dashboardService;
    }

    /**
     * Get dashboard summary.
     */
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

    /**
     * Reset account data.
     */
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
