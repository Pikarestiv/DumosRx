<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\User;
use App\Mail\AdminCustomMail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;

class MailController extends Controller
{
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
