<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Store;
use App\Models\Subscription;
use App\Mail\EndOfDaySummaryMail;
use Illuminate\Support\Facades\Mail;
use OpenApi\Attributes as OA;

class StoreSummaryController extends Controller
{
    #[OA\Post(
        path: '/dashboard/send-summary',
        summary: 'Manually trigger the end-of-day summary email',
        description: 'Gated behind the `auto_backup` feature flag for the caller\'s plan (falls back to pro/enterprise if the flag is unset).',
        tags: ['Dashboard'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Sent', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 403, description: 'Not available on the caller\'s plan', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
        ],
    )]
    public function sendSummary(Request $request)
    {
        $user = $request->user();

        // Check subscription tier
        $subscription = Subscription::where('user_id', $user->id)
            ->where('status', 'active')
            ->first();

        $systemConfig = \App\Models\SystemConfig::getVal('subscription_plans', []);
        $plan = $subscription ? $subscription->plan_name : 'free';
        
        // We link end-of-day summary to auto_backup / smart_suggestions feature tiers
        $hasFeature = isset($systemConfig['tiers'][$plan]['features']['auto_backup']) 
            ? $systemConfig['tiers'][$plan]['features']['auto_backup'] 
            : in_array($plan, ['pro', 'enterprise']);

        if (!$hasFeature) {
            return response()->json([
                'message' => 'This is a premium feature. Please upgrade your plan to access it.'
            ], 403);
        }

        // Send email
        Mail::to($user->email)->send(new EndOfDaySummaryMail($user, $subscription));

        return response()->json([
            'message' => 'End of day summary generated and sent to ' . $user->email,
        ]);
    }
}
