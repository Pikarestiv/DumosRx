<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Broadcast;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class BroadcastController extends Controller
{
    /**
     * Get all active broadcasts (for clients)
     */
    public function index()
    {
        $broadcasts = Broadcast::active()
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $broadcasts
        ]);
    }

    /**
     * Get all broadcasts (for admin)
     */
    public function adminIndex()
    {
        $broadcasts = Broadcast::orderBy('created_at', 'desc')->get();

        return response()->json([
            'success' => true,
            'data' => $broadcasts
        ]);
    }

    /**
     * Store a new broadcast
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'title' => 'required|string|max:255',
            'message' => 'required|string',
            'type' => 'required|string|in:info,warning,danger,success',
            'target_type' => 'required|string|in:all,pharmacies,stores',
            'expires_at' => 'nullable|date',
            'is_active' => 'boolean'
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $broadcast = Broadcast::create($request->all());

        return response()->json([
            'success' => true,
            'message' => 'Broadcast created successfully',
            'data' => $broadcast
        ]);
    }

    /**
     * Update an existing broadcast
     */
    public function update(Request $request, $id)
    {
        $broadcast = Broadcast::find($id);

        if (!$broadcast) {
            return response()->json(['success' => false, 'message' => 'Broadcast not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'title' => 'string|max:255',
            'message' => 'string',
            'type' => 'string|in:info,warning,danger,success',
            'target_type' => 'string|in:all,pharmacies,stores',
            'expires_at' => 'nullable|date',
            'is_active' => 'boolean'
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $broadcast->update($request->all());

        return response()->json([
            'success' => true,
            'message' => 'Broadcast updated successfully',
            'data' => $broadcast
        ]);
    }

    /**
     * Toggle active status
     */
    public function toggle($id)
    {
        $broadcast = Broadcast::find($id);

        if (!$broadcast) {
            return response()->json(['success' => false, 'message' => 'Broadcast not found'], 404);
        }

        $broadcast->is_active = !$broadcast->is_active;
        $broadcast->save();

        return response()->json([
            'success' => true,
            'message' => 'Broadcast status toggled',
            'data' => $broadcast
        ]);
    }

    /**
     * Remove a broadcast
     */
    public function destroy($id)
    {
        $broadcast = Broadcast::find($id);

        if (!$broadcast) {
            return response()->json(['success' => false, 'message' => 'Broadcast not found'], 404);
        }

        $broadcast->delete();

        return response()->json([
            'success' => true,
            'message' => 'Broadcast deleted successfully'
        ]);
    }
}
