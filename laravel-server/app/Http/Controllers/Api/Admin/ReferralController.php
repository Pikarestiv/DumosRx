<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\ReferralCreditTransaction;
use App\Models\SystemConfig;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReferralController extends Controller
{
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

    public function getReferrals()
    {
        $referrals = User::whereNotNull('referred_by_id')
            ->with(['referredBy', 'store'])
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($referrals);
    }

    public function getTransactions()
    {
        $txns = ReferralCreditTransaction::with(['user', 'referredUser'])
            ->orderBy('created_at', 'desc')
            ->paginate(20);

        return response()->json($txns);
    }

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
