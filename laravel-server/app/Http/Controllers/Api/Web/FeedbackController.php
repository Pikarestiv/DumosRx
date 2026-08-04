<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Feedback;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use OpenApi\Attributes as OA;

class FeedbackController extends Controller
{
    #[OA\Post(
        path: '/support',
        summary: 'Submit a public support request',
        description: 'Public, unauthenticated. Notifies platform admins.',
        tags: ['Feedback'],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['name', 'email', 'subject', 'message'],
            properties: [
                new OA\Property(property: 'name', type: 'string', maxLength: 255),
                new OA\Property(property: 'email', type: 'string', format: 'email'),
                new OA\Property(property: 'subject', type: 'string', maxLength: 255),
                new OA\Property(property: 'message', type: 'string'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Submitted', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'success', type: 'boolean'),
            ])),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
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

        try {
            \App\Services\AdminAlertService::send(
                'New Support Request: ' . $request->input('subject'),
                [
                    'A new support request has been submitted.',
                    '',
                    'Name: ' . $request->input('name'),
                    'Email: ' . $request->input('email'),
                    'Subject: ' . $request->input('subject'),
                    '',
                    'Message:',
                    nl2br(e($request->input('message'))),
                ]
            );
        } catch (\Exception $e) {
            // Log but don't fail the request
            \Illuminate\Support\Facades\Log::error('Failed to send admin alert for feedback: ' . $e->getMessage());
        }

        return response()->json([
            'message' => 'Support request submitted successfully',
            'success' => true
        ]);
    }

    #[OA\Get(
        path: '/admin/feedback',
        summary: 'List support/feedback tickets',
        tags: ['Feedback'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'status', in: 'query', schema: new OA\Schema(type: 'string', enum: ['all', 'pending', 'resolved', 'dismissed']))],
        responses: [
            new OA\Response(response: 200, description: 'Paginated tickets', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
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

    #[OA\Post(
        path: '/admin/feedback/{id}/status',
        summary: 'Update a feedback ticket status',
        tags: ['Feedback'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['status'],
            properties: [new OA\Property(property: 'status', type: 'string', enum: ['pending', 'resolved', 'dismissed'])],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'data', type: 'object'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
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
