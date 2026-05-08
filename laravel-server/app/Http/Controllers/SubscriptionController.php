<?php

namespace App\Http\Controllers;

use App\Models\Subscription;
use App\Models\PaymentTransaction;
use Illuminate\Http\Request;
use Carbon\Carbon;

class SubscriptionController extends Controller
{
    public function status(Request $request)
    {
        // Get active subscription
        $sub = Subscription::where('status', 'active')
            ->where('end_date', '>', now())
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

        // Logic to bind machine_id to license if not already bound would go here
        
        return response()->json(['valid' => true, 'expires_at' => $sub->end_date]);
    }

    public function initiatePayment(Request $request)
    {
        $request->validate([
            'amount' => 'required|numeric',
            'provider' => 'required|in:paystack,flutterwave',
        ]);

        $ref = 'DRX-' . strtoupper($request->provider) . '-' . uniqid();

        $txn = PaymentTransaction::create([
            'user_id' => $request->user()->id,
            'provider' => $request->provider,
            'provider_reference' => $ref,
            'amount' => $request->amount,
            'currency' => 'NGN',
            'status' => 'pending',
        ]);

        // In production, this would return the actual provider's checkout URL
        // via their API (e.g. Paystack::getAuthorizationUrl())
        $baseUrl = $request->provider === 'paystack' 
            ? "https://checkout.paystack.com" 
            : "https://checkout.flutterwave.com";

        return response()->json([
            'message' => 'Payment session created',
            'transaction_reference' => $txn->provider_reference,
            'payment_url' => "{$baseUrl}/v1/pay/{$ref}", 
        ]);
    }
}
