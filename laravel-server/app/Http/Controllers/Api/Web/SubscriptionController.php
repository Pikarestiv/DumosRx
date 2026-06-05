<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\PaymentTransaction;
use App\Models\User;
use App\Models\License;
use App\Models\SystemConfig;
use App\Models\Coupon;
use App\Models\ReferralCreditTransaction;
use App\Services\SubscriptionService;
use App\Services\Payment\PaymentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Exception;

class SubscriptionController extends Controller
{
    public function status()
    {
        /** @var User $user */
        $user = Auth::user();
        $sub = Subscription::where('user_id', $user->id)
            ->where('status', 'active')
            ->where('end_date', '>', now())
            ->latest()
            ->first();

        if (!$sub) {
            return response()->json(['status' => 'inactive', 'message' => 'No active subscription found.']);
        }

        return response()->json([
            'status' => 'active',
            'plan' => $sub->plan_name,
            'expires_at' => $sub->end_date,
            'days_remaining' => now()->diffInDays($sub->end_date),
            'license_key' => $sub->license_key,
        ]);
    }

    public function verifyLicense(Request $request)
    {
        $request->validate([
            'license_key' => 'required|string',
            'machine_id' => 'required|string',
        ]);

        $sub = Subscription::where('license_key', $request->license_key)->first();

        if (!$sub) {
            return response()->json(['valid' => false, 'message' => 'Invalid license key.'], 404);
        }

        if ($sub->status !== 'active' || $sub->end_date < now()) {
            return response()->json(['valid' => false, 'message' => 'Subscription expired.'], 403);
        }

        $license = License::firstOrCreate(
            [
                'subscription_id' => $sub->id,
                'machine_id' => $request->machine_id,
            ],
            [
                'machine_name' => $request->machine_name ?? 'Unknown Device',
                'is_active' => true,
            ]
        );

        $license->update(['last_check_in' => now()]);

        if (!$license->is_active) {
            return response()->json(['valid' => false, 'message' => 'This device has been deactivated.'], 403);
        }

        return response()->json([
            'valid' => true,
            'expires_at' => $sub->end_date,
            'plan' => $sub->plan_name,
        ]);
    }

    public function billingHistory(Request $request)
    {
        $userId = Auth::id();

        // Get transactions linked directly to the user's subscriptions
        $subscriptionIds = Subscription::where('user_id', $userId)->pluck('id');

        $transactions = PaymentTransaction::whereIn('subscription_id', $subscriptionIds)
            ->orWhere('metadata->user_id', $userId)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($txn) {
                return [
                    'id' => $txn->id,
                    'date' => $txn->created_at->format('M j, Y'),
                    'desc' => ($txn->metadata['plan_name'] ?? 'Subscription') . ' Plan',
                    'amount' => '₦' . number_format($txn->amount, 0),
                    'status' => ucfirst($txn->status),
                    'reference' => $txn->provider_reference,
                    'receipt_url' => $txn->metadata['verification_data']['receipt_url'] ?? null,
                ];
            });

        return response()->json(['transactions' => $transactions]);
    }

    public function validateCoupon(Request $request, SubscriptionService $subscriptionService)
    {
        $request->validate([
            'code' => 'required|string',
            'plan_name' => 'nullable|string',
            'interval' => 'nullable|in:monthly,yearly',
        ]);

        /** @var User $user */
        $user = $request->user();

        $result = $subscriptionService->validateCoupon(
            $user, 
            $request->code, 
            $request->plan_name, 
            $request->interval
        );

        if (!$result['valid']) {
            return response()->json(['valid' => false, 'message' => $result['message']], 400);
        }

        return response()->json([
            'valid' => true,
            'coupon' => [
                'code' => $result['coupon']->code,
                'type' => $result['coupon']->type,
                'value' => $result['coupon']->value,
                'target_plan' => $result['coupon']->target_plan,
                'target_interval' => $result['coupon']->target_interval,
            ]
        ]);
    }

    public function initiatePayment(Request $request, PaymentService $paymentService, SubscriptionService $subscriptionService)
    {
        $request->validate([
            'amount' => 'required|numeric',
            'plan_name' => 'required|string',
            'coupon_code' => 'nullable|string',
            'interval' => 'nullable|string',
            'use_credits' => 'nullable|boolean',
        ]);

        /** @var User $user */
        $user = Auth::user();

        $useCredits = $request->boolean('use_credits');
        $availableCredits = (float) $user->referral_credits;
        $creditsApplied = 0.00;

        if ($useCredits && $availableCredits > 0) {
            $creditsApplied = min($availableCredits, $request->amount);
        }

        $finalAmount = $request->amount - $creditsApplied;

        // Handle 100% discounts / Free Trials / Paid fully by credits directly
        if ($finalAmount <= 0) {
            // Deduct credits if applied
            if ($creditsApplied > 0) {
                $user->deductCredits($creditsApplied, "Applied credits to offset subscription to " . $request->plan_name);
            }

            $daysToAdd = 30; // default for monthly
            if ($request->interval === 'yearly') {
                $daysToAdd = 365;
            }

            $coupon = null;
            if ($request->coupon_code) {
                $couponResult = $subscriptionService->validateCoupon($user, $request->coupon_code, $request->plan_name, $request->interval ?? 'monthly');
                if ($couponResult['valid']) {
                    $coupon = $couponResult['coupon'];
                    if ($coupon->type === 'trial_extension') {
                        $daysToAdd = $coupon->value;
                    }
                }
            }

            $sub = Subscription::create([
                'user_id' => $user->id,
                'plan_name' => $request->plan_name,
                'start_date' => now(),
                'end_date' => now()->addDays($daysToAdd),
                'status' => 'active',
                'license_key' => 'DRX-' . strtoupper(bin2hex(random_bytes(8))),
            ]);

            if ($coupon) {
                $subscriptionService->recordCouponUsage($coupon, $user, $sub);
            }

            return response()->json([
                'success' => true,
                'message' => 'Subscription activated successfully.',
                'subscription' => $sub,
                'payment_url' => null // No payment needed
            ]);
        }

        try {
            $payment = $paymentService->initializeTransaction(
                $finalAmount,
                $user->email,
                [
                    'plan_name' => $request->plan_name,
                    'user_id' => $user->id,
                    'coupon_code' => $request->coupon_code,
                    'credits_applied' => $creditsApplied,
                    'interval' => $request->interval ?? 'monthly'
                ]
            );

            $txn = PaymentTransaction::create([
                'subscription_id' => null, // Will be linked after success
                'provider' => $payment['provider'],
                'provider_reference' => $payment['reference'],
                'amount' => $finalAmount,
                'currency' => 'NGN',
                'status' => 'pending',
                'metadata' => [
                    'plan_name' => $request->plan_name,
                    'user_id' => $user->id,
                    'coupon_code' => $request->coupon_code,
                    'credits_applied' => $creditsApplied,
                    'interval' => $request->interval ?? 'monthly'
                ]
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Payment session created',
                'transaction_reference' => $txn->provider_reference,
                'payment_url' => $payment['checkout_url'],
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function verifyPayment(Request $request, PaymentService $paymentService)
    {
        $request->validate([
            'reference' => 'required|string',
        ]);

        $txn = PaymentTransaction::where('provider_reference', $request->reference)->first();

        if (!$txn) {
            return response()->json(['success' => false, 'message' => 'Transaction not found.'], 404);
        }

        if ($txn->status === 'success') {
            return response()->json(['success' => true, 'message' => 'Payment already verified.']);
        }

        try {
            $verification = $paymentService->verifyTransaction($txn->provider_reference, $txn->provider);

            if ($verification['success']) {
                $txn->update(['status' => 'success', 'metadata' => array_merge($txn->metadata ?? [], ['verification_data' => $verification['data']])]);

                $user = User::find($txn->metadata['user_id'] ?? Auth::id());

                // Create or Update Subscription
                $interval = $txn->metadata['interval'] ?? 'monthly';
                $sub = Subscription::create([
                    'user_id' => $user ? $user->id : Auth::id(),
                    'plan_name' => $txn->metadata['plan_name'],
                    'start_date' => now(),
                    'end_date' => ($interval === 'yearly') ? now()->addYear() : now()->addMonth(),
                    'status' => 'active',
                    'license_key' => 'DRX-' . strtoupper(bin2hex(random_bytes(8))),
                ]);

                $txn->update(['subscription_id' => $sub->id]);

                // Deduct applied credits
                $creditsApplied = (float) ($txn->metadata['credits_applied'] ?? 0);
                if ($creditsApplied > 0 && $user) {
                    $user->deductCredits($creditsApplied, "Applied credits to offset subscription to " . $txn->metadata['plan_name']);
                }

                // Award referral credits
                if ($user && $user->referred_by_id) {
                    $referralConfig = SystemConfig::getVal('referral_program', []);
                    if ($referralConfig && ($referralConfig['enabled'] ?? false)) {
                        $trigger = $referralConfig['reward_trigger'] ?? 'recurring';
                        $isFirstTime = Subscription::where('user_id', $user->id)->count() <= 1;

                        if ($trigger === 'recurring' || ($trigger === 'first' && $isFirstTime)) {
                            $rewardPercentage = (float) ($referralConfig['reward_percentage'] ?? 10.0);
                            $rewardAmount = (float) $txn->amount * ($rewardPercentage / 100);
                            
                            $referrer = $user->referredBy;
                            if ($referrer && $rewardAmount > 0) {
                                $referrer->addCredits(
                                    $rewardAmount,
                                    "Referral reward from " . $user->name . " subscribing to " . $txn->metadata['plan_name'],
                                    $user->id
                                );
                            }
                        }
                    }
                }

                // Record coupon usage if present
                if (!empty($txn->metadata['coupon_code'])) {
                    $coupon = Coupon::where('code', $txn->metadata['coupon_code'])->first();
                    if ($coupon && $user) {
                        $subscriptionService = app(SubscriptionService::class);
                        $subscriptionService->recordCouponUsage($coupon, $user, $sub);
                    }
                }

                return response()->json([
                    'success' => true,
                    'message' => 'Payment verified and subscription activated.',
                    'subscription' => $sub
                ]);
            }

            $txn->update(['status' => 'failed']);
            return response()->json(['success' => false, 'message' => 'Payment verification failed.'], 400);

        } catch (Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }

    public function getReferralStats(Request $request)
    {
        /** @var User $user */
        $user = Auth::user();

        // Backfill referral code for users created before auto-generation was added
        if (!$user->referral_code) {
            $user->referral_code = User::generateUniqueReferralCode();
            $user->save();
        }

        // Get referred users
        $referrals = User::where('referred_by_id', $user->id)
            ->with(['store'])
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($referredUser) {
                $hasActiveSub = Subscription::where('user_id', $referredUser->id)
                    ->where('status', 'active')
                    ->where('end_date', '>', now())
                    ->exists();

                return [
                    'id' => $referredUser->id,
                    'name' => $referredUser->name,
                    'store_name' => $referredUser->store ? $referredUser->store->name : 'N/A',
                    'created_at' => $referredUser->created_at,
                    'status' => $hasActiveSub ? 'active' : 'pending',
                ];
            });

        $transactions = ReferralCreditTransaction::where('user_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'referral_code' => $user->referral_code,
            'referral_credits' => (float) $user->referral_credits,
            'referrals' => $referrals,
            'transactions' => $transactions,
        ]);
    }
}
