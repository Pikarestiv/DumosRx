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
        description: 'Gated behind the `daily_summary_email` feature flag for the caller\'s plan (falls back to pro/enterprise if the flag is unset).',
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

        // Check subscription tier. Mirrors SubscriptionService::hasFeature()'s
        // own owner-resolution (a staff member calling this must resolve to
        // their store owner's subscription, not their own — they have none)
        // and active/not-expired-with-grace-period logic, instead of a raw
        // `Subscription::where('user_id', $user->id)->where('status',
        // 'active')->first()` with no end_date filter/ordering at all, which
        // could pick an arbitrary EXPIRED subscription row.
        $subscriptionService = app(\App\Services\SubscriptionService::class);
        $owner = $subscriptionService->getSubscriptionOwner($user);
        $subscription = $subscriptionService->resolveEffectiveSubscription($owner);

        // Gates the end-of-day summary email — the flag name matches what
        // it actually does now (it never gated backups; that was a stale
        // name carried over from an earlier iteration). Delegated to
        // SubscriptionService::hasFeature() (which owns the
        // absent-flag-key pro/enterprise fallback) rather than duplicating
        // that logic here, so this endpoint and the nightly
        // SendEndOfDaySummaries cron always agree on who gets emailed.
        if (!$subscriptionService->hasFeature($user, 'daily_summary_email')) {
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
