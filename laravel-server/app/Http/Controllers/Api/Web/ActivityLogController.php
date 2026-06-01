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

    public function logClientError(Request $request)
    {
        $request->validate([
            'method' => 'required|string',
            'url' => 'required|string',
            'status' => 'nullable',
            'message' => 'required|string',
            'details' => 'nullable|array'
        ]);

        $user = $request->user();

        // Log to laravel.log
        \Log::error("Client API Error [User: {$user->id} ({$user->email})]: {$request->input('method')} {$request->input('url')} - Status: {$request->input('status')} - Message: {$request->input('message')}", [
            'details' => $request->input('details'),
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent()
        ]);

        // Log to ActivityLog table
        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'CLIENT_API_ERROR',
            'description' => "Failed: {$request->input('method')} {$request->input('url')} ({$request->input('status')})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'properties' => [
                'error_message' => $request->input('message'),
                'details' => $request->input('details')
            ]
        ]);

        return response()->json(['status' => 'logged']);
    }
}
