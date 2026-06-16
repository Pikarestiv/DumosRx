<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Store;
use App\Models\Subscription;
use App\Mail\EndOfDaySummaryMail;
use Illuminate\Support\Facades\Mail;

class StoreSummaryController extends Controller
{
    /**
     * Generate and send the end of day summary manually.
     */
    public function sendSummary(Request $request)
    {
        $user = $request->user();

        // Check subscription tier
        $subscription = Subscription::where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        if (!$subscription || !in_array($subscription->plan_name, ['pro', 'enterprise'])) {
            return response()->json([
                'message' => 'This feature is only available on Pro and Enterprise plans.'
            ], 403);
        }

        // Send email
        Mail::to($user->email)->send(new EndOfDaySummaryMail($user, $subscription));

        return response()->json([
            'message' => 'End of day summary generated and sent to ' . $user->email,
        ]);
    }
}
