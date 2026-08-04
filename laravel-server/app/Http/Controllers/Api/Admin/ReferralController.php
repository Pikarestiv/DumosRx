<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\ReferralCreditTransaction;
use App\Models\SystemConfig;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use OpenApi\Attributes as OA;

class ReferralController extends Controller
{
    #[OA\Get(
        path: '/admin/referrals/summary',
        summary: 'Platform-wide referral program totals',
        tags: ['Admin: Referrals'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Summary', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'total_referrals', type: 'integer'),
                new OA\Property(property: 'total_credits_earned', type: 'number'),
                new OA\Property(property: 'total_credits_spent', type: 'number'),
                new OA\Property(property: 'active_referrers', type: 'integer'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function getSummary()
    {
        $totalReferrals = User::whereNotNull('referred_by_id')->count();
        
        $totalCreditsEarned = ReferralCreditTransaction::where('type', 'earned')->sum('amount');
        $totalCreditsSpent = ReferralCreditTransaction::where('type', 'spent')->sum('amount');

        $activeReferrersCount = User::whereHas('referrals')->count();

        return response()->json([
            'total_referrals' => $totalReferrals,
            'total_credits_earned' => (float) $totalCreditsEarned,
            'total_credits_spent' => (float) $totalCreditsSpent,
            'active_referrers' => $activeReferrersCount,
        ]);
    }

    #[OA\Get(
        path: '/admin/referrals',
        summary: 'List users who were referred by someone',
        tags: ['Admin: Referrals'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Paginated referred users, with referrer/store eager-loaded', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function getReferrals()
    {
        $referrals = User::whereNotNull('referred_by_id')
            ->with(['referredBy', 'store'])
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($referrals);
    }

    #[OA\Get(
        path: '/admin/referrals/transactions',
        summary: 'List referral credit transactions',
        tags: ['Admin: Referrals'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Paginated transactions', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function getTransactions()
    {
        $txns = ReferralCreditTransaction::with(['user', 'referredUser'])
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($txns);
    }

    #[OA\Post(
        path: '/admin/referrals/adjust-credits',
        summary: "Manually adjust a user's referral credit balance",
        tags: ['Admin: Referrals'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['user_id', 'amount', 'type', 'description'],
            properties: [
                new OA\Property(property: 'user_id', type: 'string', format: 'uuid'),
                new OA\Property(property: 'amount', type: 'number'),
                new OA\Property(property: 'type', type: 'string', enum: ['earned', 'spent', 'admin_adjustment']),
                new OA\Property(property: 'description', type: 'string', maxLength: 255),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Adjusted', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'referral_credits', type: 'number'),
            ])),
            new OA\Response(response: 400, description: 'Insufficient credits to deduct', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function adjustCredits(Request $request)
    {
        $request->validate([
            'user_id' => 'required|uuid|exists:users,id',
            'amount' => 'required|numeric',
            'type' => 'required|in:earned,spent,admin_adjustment',
            'description' => 'required|string|max:255',
        ]);

        /** @var User $user */
        $user = User::findOrFail($request->user_id);
        $amount = (float) $request->amount;

        if ($request->type === 'spent') {
            if ($user->referral_credits < $amount) {
                return response()->json(['message' => 'User does not have enough credits to deduct.'], 400);
            }
            $user->deductCredits($amount, "[Admin Adjustment] " . $request->description);
        } else {
            // Earned or general admin adjustment
            $user->addCredits($amount, "[Admin Adjustment] " . $request->description, null, $request->type);
        }

        return response()->json([
            'message' => 'Credits adjusted successfully.',
            'referral_credits' => $user->referral_credits
        ]);
    }

    #[OA\Get(
        path: '/admin/referrals/settings',
        summary: 'Get referral program configuration',
        tags: ['Admin: Referrals'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Settings', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'enabled', type: 'boolean'),
                new OA\Property(property: 'reward_percentage', type: 'number'),
                new OA\Property(property: 'reward_trigger', type: 'string', enum: ['first', 'recurring']),
                new OA\Property(property: 'allow_full_credit_payment', type: 'boolean'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function getSettings()
    {
        $config = SystemConfig::getVal('referral_program', [
            'enabled' => true,
            'reward_percentage' => 10.0,
            'reward_trigger' => 'recurring',
            'allow_full_credit_payment' => true
        ]);

        return response()->json($config);
    }

    #[OA\Put(
        path: '/admin/referrals/settings',
        summary: 'Update referral program configuration',
        tags: ['Admin: Referrals'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['enabled', 'reward_percentage', 'reward_trigger', 'allow_full_credit_payment'],
            properties: [
                new OA\Property(property: 'enabled', type: 'boolean'),
                new OA\Property(property: 'reward_percentage', type: 'number', minimum: 0, maximum: 100),
                new OA\Property(property: 'reward_trigger', type: 'string', enum: ['first', 'recurring']),
                new OA\Property(property: 'allow_full_credit_payment', type: 'boolean'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'settings', type: 'object'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function updateSettings(Request $request)
    {
        $request->validate([
            'enabled' => 'required|boolean',
            'reward_percentage' => 'required|numeric|min:0|max:100',
            'reward_trigger' => 'required|in:first,recurring',
            'allow_full_credit_payment' => 'required|boolean',
        ]);

        $config = SystemConfig::setVal('referral_program', [
            'enabled' => $request->boolean('enabled'),
            'reward_percentage' => (float) $request->reward_percentage,
            'reward_trigger' => $request->reward_trigger,
            'allow_full_credit_payment' => $request->boolean('allow_full_credit_payment'),
        ]);

        return response()->json([
            'message' => 'Referral settings updated successfully.',
            'settings' => $config->value
        ]);
    }
}
