<?php

namespace App\Services;

use App\Models\Subscription;
use App\Models\User;
use Illuminate\Support\Str;

class SubscriptionService
{
    /**
     * Create a trial subscription for a user
     */
    public function createTrial(User $user)
    {
        $trialDays = config('plans.trial_days', 14);
        
        return Subscription::create([
            'user_id' => $user->id,
            'plan_name' => 'Starter',
            'start_date' => now(),
            'end_date' => now()->addDays($trialDays),
            'status' => 'active',
            'license_key' => 'DRX-TRIAL-' . strtoupper(Str::random(12)),
        ]);
    }

    /**
     * Check if a user has access to a specific feature
     */
    public function hasFeature(User $user, $feature)
    {
        $sub = $user->subscriptions()->where('status', 'active')->where('end_date', '>', now())->latest()->first();
        
        if (!$sub) {
            // Check if within grace period
            $graceDays = config('plans.grace_period_days', 3);
            $sub = $user->subscriptions()->where('status', 'active')->where('end_date', '>', now()->subDays($graceDays))->latest()->first();
            
            if (!$sub) return false;
        }

        $plan = strtolower($sub->plan_name);
        $config = config("plans.tiers.{$plan}.features", []);
        
        return $config[$feature] ?? false;
    }

    /**
     * Check if a user is within their limits
     */
    public function checkLimit(User $user, $type)
    {
        $sub = $user->subscriptions()->where('status', 'active')->where('end_date', '>', now())->latest()->first();
        
        if (!$sub) return false;

        $plan = strtolower($sub->plan_name);
        $limit = config("plans.tiers.{$plan}.limits.{$type}", 0);

        if ($limit === -1) return true; // unlimited

        $current = 0;
        switch ($type) {
            case 'stores':
                $current = $user->store()->count();
                break;
            case 'staff':
                $storeIds = \App\Models\Store::where('user_id', $user->id)->pluck('id');
                $current = User::whereIn('store_id', $storeIds)->count();
                break;
        }

        return $current < $limit;
    }
}
