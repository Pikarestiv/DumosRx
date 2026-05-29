<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\PaymentTransaction;
use Illuminate\Http\Request;

class SubscriptionController extends Controller
{
    public function status()
    {
        /** @var \App\Models\User $user */
        $user = \Illuminate\Support\Facades\Auth::user();
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

        $license = \App\Models\License::firstOrCreate(
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
        $userId = \Illuminate\Support\Facades\Auth::id();

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

    public function validateCoupon(Request $request, \App\Services\SubscriptionService $subscriptionService)
    {
        $request->validate([
            'code' => 'required|string',
            'plan_name' => 'nullable|string',
            'interval' => 'nullable|in:monthly,yearly',
        ]);

        /** @var \App\Models\User $user */
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

    public function initiatePayment(Request $request, \App\Services\Payment\PaymentService $paymentService, \App\Services\SubscriptionService $subscriptionService)
    {
        $request->validate([
            'amount' => 'required|numeric',
            'plan_name' => 'required|string',
            'coupon_code' => 'nullable|string',
            'interval' => 'nullable|string',
        ]);

        /** @var \App\Models\User $user */
        $user = \Illuminate\Support\Facades\Auth::user();

        // Handle 100% discounts / Free Trials directly
        if ($request->amount <= 0 && $request->coupon_code) {
            $couponResult = $subscriptionService->validateCoupon($user, $request->coupon_code, $request->plan_name, $request->interval ?? 'monthly');
            if (!$couponResult['valid']) {
                return response()->json(['success' => false, 'message' => $couponResult['message']], 400);
            }

            $coupon = $couponResult['coupon'];
            $daysToAdd = 30; // default for monthly

            if ($coupon->type === 'trial_extension') {
                $daysToAdd = $coupon->value;
            } else if ($request->interval === 'yearly') {
                $daysToAdd = 365;
            }

            $sub = Subscription::create([
                'user_id' => $user->id,
                'plan_name' => $request->plan_name,
                'start_date' => now(),
                'end_date' => now()->addDays($daysToAdd),
                'status' => 'active',
                'license_key' => 'DRX-' . strtoupper(bin2hex(random_bytes(8))),
            ]);

            $subscriptionService->recordCouponUsage($coupon, $user, $sub);

            return response()->json([
                'success' => true,
                'message' => 'Subscription activated successfully with coupon.',
                'subscription' => $sub,
                'payment_url' => null // No payment needed
            ]);
        }

        try {
            $payment = $paymentService->initializeTransaction(
                $request->amount,
                $user->email,
                ['plan_name' => $request->plan_name, 'user_id' => $user->id, 'coupon_code' => $request->coupon_code]
            );

            $txn = PaymentTransaction::create([
                'subscription_id' => null, // Will be linked after success
                'provider' => $payment['provider'],
                'provider_reference' => $payment['reference'],
                'amount' => $request->amount,
                'currency' => 'NGN',
                'status' => 'pending',
                'metadata' => ['plan_name' => $request->plan_name, 'user_id' => $user->id, 'coupon_code' => $request->coupon_code]
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Payment session created',
                'transaction_reference' => $txn->provider_reference,
                'payment_url' => $payment['checkout_url'],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function verifyPayment(Request $request, \App\Services\Payment\PaymentService $paymentService)
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

                // Create or Update Subscription
                $sub = Subscription::create([
                    'user_id' => $txn->metadata['user_id'] ?? \Illuminate\Support\Facades\Auth::id(),
                    'plan_name' => $txn->metadata['plan_name'],
                    'start_date' => now(),
                    'end_date' => now()->addMonth(), // Assuming monthly for now
                    'status' => 'active',
                    'license_key' => 'DRX-' . strtoupper(bin2hex(random_bytes(8))),
                ]);

                $txn->update(['subscription_id' => $sub->id]);

                // Record coupon usage if present
                if (!empty($txn->metadata['coupon_code'])) {
                    $coupon = \App\Models\Coupon::where('code', $txn->metadata['coupon_code'])->first();
                    if ($coupon) {
                        $subscriptionService = app(\App\Services\SubscriptionService::class);
                        $user = \App\Models\User::find($txn->metadata['user_id'] ?? \Illuminate\Support\Facades\Auth::id());
                        if ($user) {
                            $subscriptionService->recordCouponUsage($coupon, $user, $sub);
                        }
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

        } catch (\Exception $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}
