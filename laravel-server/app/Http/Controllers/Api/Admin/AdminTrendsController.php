<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Admin\AdminTrendsService;
use App\Support\TimeSeries;
use Illuminate\Http\Request;

class AdminTrendsController extends AdminBaseController
{
    public function __construct(private AdminTrendsService $trends) {}

    public function index(Request $request)
    {
        $validated = $request->validate([
            'window' => 'nullable|string|in:'.implode(',', TimeSeries::WINDOWS),
        ]);

        return response()->json($this->trends->trends($validated['window'] ?? '6m'));
    }
}
