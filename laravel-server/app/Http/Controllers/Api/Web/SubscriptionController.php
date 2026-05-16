<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Subscription;
use App\Models\PaymentTransaction;
use Illuminate\Http\Request;
use Carbon\Carbon;

class SubscriptionController extends Controller
{
    public function status()
    {
        $user = auth()->user();
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

    public function initiatePayment(Request $request, \App\Services\Payment\PaymentService $paymentService)
    {
        $request->validate([
            'amount' => 'required|numeric',
            'plan_name' => 'required|string',
        ]);

        $user = auth()->user();
        
        try {
            $payment = $paymentService.initializeTransaction(
                $request->amount,
                $user->email,
                ['plan_name' => $request->plan_name, 'user_id' => $user->id]
            );

            $txn = PaymentTransaction::create([
                'subscription_id' => null, // Will be linked after success
                'provider' => $payment['provider'],
                'provider_reference' => $payment['reference'],
                'amount' => $request->amount,
                'currency' => 'NGN',
                'status' => 'pending',
                'metadata' => ['plan_name' => $request->plan_name]
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
                    'user_id' => $txn->metadata['user_id'],
                    'plan_name' => $txn->metadata['plan_name'],
                    'start_date' => now(),
                    'end_date' => now()->addMonth(), // Assuming monthly for now
                    'status' => 'active',
                    'license_key' => 'DRX-' . strtoupper(bin2hex(random_bytes(8))),
                ]);

                $txn->update(['subscription_id' => $sub->id]);

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
