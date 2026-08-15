<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use App\Services\SubscriptionService;
use App\Models\SystemConfig;

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
        if ($user->hasRole('super_admin')) {
            return $next($request);
        }

        $subscriptionService = app(SubscriptionService::class);
        $owner = $subscriptionService->getSubscriptionOwner($user);


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
            $sub = $owner->subscriptions()->where('status', 'active')->where('end_date', '>', now())->latest()->first();
            if (!$sub) {
                // Check grace period
                $systemConfig = SystemConfig::getVal('subscription_plans', []);
                $graceDays = $systemConfig['grace_period_days'] ?? 3;
                $expiredSub = $owner->subscriptions()->where('status', 'active')->where('end_date', '>', now()->subDays($graceDays))->latest()->first();
                
                if (!$expiredSub) {
                    // Under the 4-tier model, if they don't have an active paid subscription,
                    // they are downgraded to 'free'. So we allow general API access, 
                    // and let the sync/feature gates handle specific restrictions.
                    return $next($request);
                }
            }
        }

        return $next($request);
    }
}
