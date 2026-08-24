<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\User;
use App\Mail\AdminCustomMail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use OpenApi\Attributes as OA;

class MailController extends Controller
{
    #[OA\Post(
        path: '/admin/mail/send',
        summary: 'Send a one-off custom email to all users or a specific set',
        description: 'Queued (not sent synchronously); `target_type: all` chunks through every user 100 at a time.',
        tags: ['Admin: Mail'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['subject', 'message', 'target_type'],
            properties: [
                new OA\Property(property: 'subject', type: 'string', maxLength: 255),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'target_type', type: 'string', enum: ['all', 'specific']),
                new OA\Property(property: 'user_ids', type: 'array', items: new OA\Items(type: 'string'), description: 'Required when target_type=specific'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Queued', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'message', type: 'string'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function send(Request $request)
    {
        $request->validate([
            'subject' => 'required|string|max:255',
            'message' => 'required|string',
            'target_type' => 'required|in:all,specific',
            'user_ids' => 'required_if:target_type,specific|array',
            'user_ids.*' => 'exists:users,id',
        ]);

        $subject = $request->input('subject');
        $message = $request->input('message');
        $targetType = $request->input('target_type');

        try {
            if ($targetType === 'all') {
                // Queue for all users in chunks to avoid memory/timeout issues
                User::chunk(100, function ($users) use ($subject, $message) {
                    foreach ($users as $user) {
                        Mail::to($user->email)->queue(new AdminCustomMail($subject, $message));
                    }
                });
            } else {
                // Specific users
                $users = User::whereIn('id', $request->input('user_ids'))->get();
                foreach ($users as $user) {
                    Mail::to($user->email)->queue(new AdminCustomMail($subject, $message));
                }
            }

            return response()->json(['success' => true, 'message' => 'Emails have been queued for sending.']);
        } catch (\Exception $e) {
            Log::error('Failed to send admin emails: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Failed to send emails.'], 500);
        }
    }
}
