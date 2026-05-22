<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request)
    {
        $admin = $request->user();
        
        // Get all stores owned by the admin
        $storeIds = Store::where('user_id', $admin->id)->pluck('id');
        
        // Get all staff users in those stores
        $userIds = clone $storeIds; // wait, storeIds is a collection of UUIDs
        $staffIds = User::whereIn('store_id', $storeIds)->pluck('id');
        
        // Include the admin's own ID
        $staffIds->push($admin->id);

        $logs = ActivityLog::with('user')
            ->whereIn('user_id', $staffIds)
            ->latest()
            ->paginate(50);

        return response()->json($logs);
    }
}
