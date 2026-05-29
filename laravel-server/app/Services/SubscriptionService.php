<?php

namespace App\Services;

use App\Models\Subscription;
use App\Models\User;
use App\Models\SystemConfig;
use Illuminate\Support\Str;

class SubscriptionService
{
    /**
     * Create a trial subscription for a user
     */
    public function createTrial(User $user)
    {
        $config = SystemConfig::getVal('subscription_plans', []);
        $trialDays = $config['trial_days'] ?? 14;
        
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
     * Get the owner of the subscription for a user (staff inherit from store owner)
     */
    public function getSubscriptionOwner(User $user)
    {
        // If the user owns a store, they are an owner
        if ($user->store()->exists()) {
            return $user;
        }
        
        // If the user is staff, they have a store_id
        if ($user->store_id) {
            $store = \App\Models\Store::find($user->store_id);
            if ($store && $store->user_id) {
                return \App\Models\User::find($store->user_id) ?? $user;
            }
        }
        
        return $user;
    }

    /**
     * Check if a user has access to a specific feature
     */
    public function hasFeature(User $user, $feature)
    {
        $owner = $this->getSubscriptionOwner($user);
        $sub = $owner->subscriptions()->where('status', 'active')->where('end_date', '>', now())->latest()->first();
        
        if (!$sub) {
            // Check if within grace period
            $systemConfig = SystemConfig::getVal('subscription_plans', []);
            $graceDays = $systemConfig['grace_period_days'] ?? 3;
            $sub = $owner->subscriptions()->where('status', 'active')->where('end_date', '>', now()->subDays($graceDays))->latest()->first();
            
            if (!$sub) return false;
        }

        $plan = strtolower($sub->plan_name);
        
        // Map old plan names if needed, or assume they are local/pro/enterprise
        $systemConfig = SystemConfig::getVal('subscription_plans', []);
        $features = $systemConfig['tiers'][$plan]['features'] ?? [];
        
        return $features[$feature] ?? false;
    }

    /**
     * Check if a user is within their limits
     */
    public function checkLimit(User $user, $type)
    {
        $owner = $this->getSubscriptionOwner($user);
        $sub = $owner->subscriptions()->where('status', 'active')->where('end_date', '>', now())->latest()->first();
        
        if (!$sub) return false;

        $plan = strtolower($sub->plan_name);
        $systemConfig = SystemConfig::getVal('subscription_plans', []);
        $limit = $systemConfig['tiers'][$plan]['limits'][$type] ?? 0;

        if ($limit === -1) return true; // unlimited

        $current = 0;
        switch ($type) {
            case 'stores':
                $current = $owner->store()->count();
                break;
            case 'staff':
                $storeIds = \App\Models\Store::where('user_id', $owner->id)->pluck('id');
                $current = User::whereIn('store_id', $storeIds)->count();
                break;
        }

        return $current < $limit;
    }

    /**
     * Validate a coupon code for a user and plan
     */
    public function validateCoupon(User $user, string $code, ?string $planName = null, ?string $interval = null)
    {
        $coupon = \App\Models\Coupon::where('code', $code)->first();
        
        if (!$coupon) {
            return ['valid' => false, 'message' => 'Invalid coupon code'];
        }

        $owner = $this->getSubscriptionOwner($user);

        if (!$coupon->isValidForUser($owner)) {
            return ['valid' => false, 'message' => 'Coupon is not valid or has exceeded usage limits'];
        }

        if ($planName && $interval) {
            if (!$coupon->isValidForPlan($planName, $interval)) {
                return ['valid' => false, 'message' => 'Coupon is not valid for this plan or billing interval'];
            }
        }

        return [
            'valid' => true,
            'coupon' => clone $coupon,
        ];
    }

    /**
     * Record a coupon usage
     */
    public function recordCouponUsage(\App\Models\Coupon $coupon, User $user, ?Subscription $subscription = null)
    {
        $owner = $this->getSubscriptionOwner($user);
        
        \App\Models\CouponUsage::create([
            'coupon_id' => $coupon->id,
            'user_id' => $owner->id,
            'subscription_id' => $subscription ? $subscription->id : null,
            'used_at' => now(),
        ]);
    }
}
