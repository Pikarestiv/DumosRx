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
use OpenApi\Attributes as OA;

class SubscriptionController extends Controller
{
    #[OA\Get(
        path: '/subscription/status',
        summary: "Get the caller's current subscription status",
        tags: ['Subscription'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Status', content: new OA\JsonContent(oneOf: [
                new OA\Schema(properties: [
                    new OA\Property(property: 'status', type: 'string', example: 'inactive'),
                    new OA\Property(property: 'message', type: 'string'),
                ]),
                new OA\Schema(properties: [
                    new OA\Property(property: 'status', type: 'string', example: 'active'),
                    new OA\Property(property: 'plan', type: 'string'),
                    new OA\Property(property: 'expires_at', type: 'string', format: 'date-time'),
                    new OA\Property(property: 'days_remaining', type: 'integer'),
                    new OA\Property(property: 'is_trial', type: 'boolean'),
                    new OA\Property(property: 'license_key', type: 'string'),
                    new OA\Property(property: 'limits', type: 'object', nullable: true),
                    new OA\Property(property: 'features', type: 'object', nullable: true),
                ]),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
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

        $systemConfig = SystemConfig::getVal('subscription_plans', []);
        $limits = $systemConfig['tiers'][$sub->plan_name]['limits'] ?? null;
        $features = $systemConfig['tiers'][$sub->plan_name]['features'] ?? null;

        return response()->json([
            'status' => 'active',
            'plan' => $sub->plan_name,
            'expires_at' => $sub->end_date,
            'days_remaining' => now()->diffInDays($sub->end_date),
            'is_trial' => $sub->is_trial,
            'license_key' => $sub->license_key,
            'limits' => $limits,
            'features' => $features,
        ]);
    }

    #[OA\Post(
        path: '/subscription/verify-license',
        summary: 'Verify a license key for offline/desktop activation and register the device',
        description: 'First call for a given `machine_id` registers it (device-level licensing); subsequent calls just check in.',
        tags: ['Subscription'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['license_key', 'machine_id'],
            properties: [
                new OA\Property(property: 'license_key', type: 'string'),
                new OA\Property(property: 'machine_id', type: 'string'),
                new OA\Property(property: 'machine_name', type: 'string', nullable: true),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Valid', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'valid', type: 'boolean'),
                new OA\Property(property: 'expires_at', type: 'string', format: 'date-time'),
                new OA\Property(property: 'plan', type: 'string'),
            ])),
            new OA\Response(response: 403, description: 'Subscription expired, or device deactivated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'valid', type: 'boolean', example: false),
                new OA\Property(property: 'message', type: 'string'),
            ])),
            new OA\Response(response: 404, description: 'Unknown license key', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'valid', type: 'boolean', example: false),
                new OA\Property(property: 'message', type: 'string'),
            ])),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
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

    #[OA\Get(
        path: '/subscription/billing-history',
        summary: "List the caller's payment transaction history",
        tags: ['Subscription'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Formatted transaction list', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'transactions', type: 'array', items: new OA\Items(properties: [
                    new OA\Property(property: 'id', type: 'string'),
                    new OA\Property(property: 'date', type: 'string', example: 'Jan 5, 2026'),
                    new OA\Property(property: 'desc', type: 'string'),
                    new OA\Property(property: 'amount', type: 'string', example: '₦15,000'),
                    new OA\Property(property: 'status', type: 'string'),
                    new OA\Property(property: 'reference', type: 'string'),
                    new OA\Property(property: 'receipt_url', type: 'string', nullable: true),
                ])),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
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

    #[OA\Post(
        path: '/subscription/validate-coupon',
        summary: 'Validate a coupon code before checkout',
        tags: ['Subscription'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['code'],
            properties: [
                new OA\Property(property: 'code', type: 'string'),
                new OA\Property(property: 'plan_name', type: 'string', nullable: true),
                new OA\Property(property: 'interval', type: 'string', enum: ['monthly', 'yearly'], nullable: true),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Valid', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'valid', type: 'boolean', example: true),
                new OA\Property(property: 'coupon', type: 'object', properties: [
                    new OA\Property(property: 'code', type: 'string'),
                    new OA\Property(property: 'type', type: 'string'),
                    new OA\Property(property: 'value', type: 'integer'),
                    new OA\Property(property: 'target_plan', type: 'string', nullable: true),
                    new OA\Property(property: 'target_interval', type: 'string', nullable: true),
                ]),
            ])),
            new OA\Response(response: 400, description: 'Invalid/expired/inapplicable coupon', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'valid', type: 'boolean', example: false),
                new OA\Property(property: 'message', type: 'string'),
            ])),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
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

    #[OA\Post(
        path: '/subscription/pay',
        summary: 'Start a subscription checkout, or activate directly if fully covered by credits/coupon',
        description: 'If `amount` minus applied referral credits (and any 100%-off coupon) resolves to <= 0, the subscription is activated immediately with no payment provider involved and `payment_url` is null. Otherwise a payment session is created and `payment_url` is where to redirect the user.',
        tags: ['Subscription'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['amount', 'plan_name'],
            properties: [
                new OA\Property(property: 'amount', type: 'number'),
                new OA\Property(property: 'plan_name', type: 'string'),
                new OA\Property(property: 'coupon_code', type: 'string', nullable: true),
                new OA\Property(property: 'interval', type: 'string', enum: ['monthly', 'yearly'], nullable: true),
                new OA\Property(property: 'use_credits', type: 'boolean', nullable: true, description: 'Apply available referral credits toward this payment'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Activated directly, or payment session created', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'subscription', type: 'object', nullable: true, description: 'Present only when activated directly (no payment needed)'),
                new OA\Property(property: 'payment_url', type: 'string', nullable: true),
                new OA\Property(property: 'transaction_reference', type: 'string', nullable: true),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
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

            // Immediately enforce limits since the plan has changed
            $subscriptionService->enforceStaffLimits($user);

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

    #[OA\Post(
        path: '/subscription/verify',
        summary: 'Verify a payment provider transaction reference and activate the subscription',
        description: 'Called after redirect back from Paystack/Flutterwave checkout. Idempotent: calling again after success just returns "already verified". On success, also awards referral credit to the referrer if applicable and records coupon usage.',
        tags: ['Subscription'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['reference'],
            properties: [new OA\Property(property: 'reference', type: 'string')],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Verified and subscription activated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'subscription', type: 'object', nullable: true),
            ])),
            new OA\Response(response: 400, description: 'Verification failed at the payment provider', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean', example: false),
                new OA\Property(property: 'message', type: 'string'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, description: 'No transaction found for that reference'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
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

    #[OA\Get(
        path: '/subscription/referral-stats',
        summary: "Get the caller's referral code, credit balance, referred users, and credit transaction history",
        description: 'Backfills a `referral_code` for the user if they don\'t have one yet (accounts created before auto-generation was added).',
        tags: ['Subscription'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Referral stats', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'referral_code', type: 'string'),
                new OA\Property(property: 'referral_credits', type: 'number'),
                new OA\Property(property: 'referrals', type: 'array', items: new OA\Items(properties: [
                    new OA\Property(property: 'id', type: 'string'),
                    new OA\Property(property: 'name', type: 'string'),
                    new OA\Property(property: 'store_name', type: 'string'),
                    new OA\Property(property: 'created_at', type: 'string', format: 'date-time'),
                    new OA\Property(property: 'status', type: 'string', enum: ['active', 'pending']),
                ])),
                new OA\Property(property: 'transactions', type: 'array', items: new OA\Items(type: 'object')),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
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
