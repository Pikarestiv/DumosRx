<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Feedback;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class FeedbackController extends Controller
{
    /**
     * Display a listing of the feedback.
     */
    public function index(Request $request): JsonResponse
    {
        $status = $request->query('status');

        $query = Feedback::query()->where('_deleted', false);

        if ($status && $status !== 'all') {
            $query->where('status', $status);
        }

        $feedback = $query->orderBy('created_at', 'desc')->paginate(50);

        return response()->json($feedback);
    }

    /**
     * Update the specified feedback status.
     */
    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $request->validate([
            'status' => 'required|string|in:pending,resolved,dismissed'
        ]);

        $feedback = Feedback::findOrFail($id);
        $feedback->status = $request->input('status');
        $feedback->save();

        return response()->json([
            'message' => 'Feedback status updated successfully',
            'data' => $feedback
        ]);
    }
}
