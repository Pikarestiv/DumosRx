<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use App\Services\SubscriptionService;

class CheckSubscription
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     * @param  string  $feature
     */
    public function handle(Request $request, Closure $next, ?string $feature = null): Response
    {
        $user = $request->user();

        if (!$user) {
            return $next($request);
        }

        // Super Admin bypasses all checks
        if ($user->role === 'super_admin') {
            return $next($request);
        }

        $subscriptionService = app(SubscriptionService::class);

        // If a specific feature is requested
        if ($feature) {
            if (!$subscriptionService->hasFeature($user, $feature)) {
                return response()->json([
                    'success' => false,
                    'message' => "The '{$feature}' feature is not available on your current plan. Please upgrade.",
                    'code' => 'UPGRADE_REQUIRED'
                ], 403);
            }
        } else {
            // General subscription check
            $sub = $user->subscriptions()->where('status', 'active')->where('end_date', '>', now())->latest()->first();
            if (!$sub) {
                // Check grace period
                $graceDays = config('plans.grace_period_days', 3);
                $expiredSub = $user->subscriptions()->where('status', 'active')->where('end_date', '>', now()->subDays($graceDays))->latest()->first();
                
                if (!$expiredSub) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Your subscription has expired. Please renew to continue using the platform.',
                        'code' => 'SUBSCRIPTION_EXPIRED'
                    ], 402); // 402 Payment Required
                }
            }
        }

        return $next($request);
    }
}
