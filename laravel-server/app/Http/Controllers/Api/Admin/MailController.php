<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\Admin\AdminMailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use OpenApi\Attributes as OA;

class MailController extends Controller
{
    #[OA\Post(
        path: '/admin/mail/send',
        summary: 'Send a one-off custom email to all users or a specific set',
        description: 'Sent synchronously (no queue worker runs in production), 100 recipients per chunk. Placeholder staff addresses (@local.dumosrx.com) are never mailed. With `is_html: true` the message is sanitised (scripts, event handlers and javascript: URLs removed) and sent as HTML.',
        tags: ['Admin: Mail'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['subject', 'message', 'target_type'],
            properties: [
                new OA\Property(property: 'subject', type: 'string', maxLength: 255),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'target_type', type: 'string', enum: ['all', 'store_owners', 'staff', 'platform_admins', 'specific']),
                new OA\Property(property: 'is_html', type: 'boolean', description: 'Send the message as sanitised HTML instead of escaped plain text'),
                new OA\Property(property: 'user_ids', type: 'array', items: new OA\Items(type: 'string'), description: 'Required when target_type=specific'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Sent', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'message', type: 'string'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function recipientCount(Request $request, AdminMailService $mail)
    {
        $request->validate(['target_type' => ['required', Rule::in(array_diff(AdminMailService::AUDIENCES, ['specific']))]]);

        return response()->json(['count' => $mail->recipientCount($request->input('target_type'))]);
    }

    public function send(Request $request, AdminMailService $mail)
    {
        $request->validate([
            'subject' => 'required|string|max:255',
            'message' => 'required|string',
            'is_html' => 'sometimes|boolean',
            'target_type' => ['required', Rule::in(AdminMailService::AUDIENCES)],
            'user_ids' => 'required_if:target_type,specific|array',
            'user_ids.*' => 'exists:users,id',
        ]);

        try {
            $sent = $mail->send(
                $request->input('subject'),
                $request->input('message'),
                $request->input('target_type'),
                $request->input('user_ids', []),
                $request->boolean('is_html'),
            );

            return response()->json(['success' => true, 'message' => "Emails have been sent to {$sent} recipient(s)."]);
        } catch (\Exception $e) {
            Log::error('Failed to send admin emails: '.$e->getMessage());

            return response()->json(['success' => false, 'message' => 'Failed to send emails.'], 500);
        }
    }
}
