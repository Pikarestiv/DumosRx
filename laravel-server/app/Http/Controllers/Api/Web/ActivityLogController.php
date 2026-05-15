<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $userId = $request->user()->id;
        $logs = ActivityLog::where('user_id', $userId)
            ->latest()
            ->paginate(50);

        return response()->json($logs);
    }
}
