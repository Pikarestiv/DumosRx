<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Feedback;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class FeedbackController extends Controller
{
    /**
     * Store a public support request.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255',
            'subject' => 'required|string|max:255',
            'message' => 'required|string'
        ]);

        $feedback = new Feedback();
        $feedback->id = (string) \Illuminate\Support\Str::uuid();
        $feedback->type = 'support_ticket';
        $feedback->contact_email = $request->input('email');
        $feedback->content = "Name: " . $request->input('name') . "\nSubject: " . $request->input('subject') . "\n\n" . $request->input('message');
        $feedback->status = 'pending';
        $feedback->save();

        return response()->json([
            'message' => 'Support request submitted successfully',
            'success' => true
        ]);
    }

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
