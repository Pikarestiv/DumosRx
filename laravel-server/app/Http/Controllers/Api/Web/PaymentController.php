<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\PaymentTransaction;
use App\Models\Subscription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class PaymentController extends Controller
{
    /**
     * Handle Paystack Webhook
     */
    public function handlePaystack(Request $request)
    {
        // Validate signature
        $signature = $request->header('x-paystack-signature');
        if (!$signature || $signature !== hash_hmac('sha512', $request->getContent(), config('payment.paystack.secret_key'))) {
            return response()->json(['message' => 'Invalid signature'], 400);
        }

        $event = $request->input('event');
        $data = $request->input('data');

        if ($event === 'charge.success') {
            $this->processSuccessfulPayment($data['reference'], 'paystack', $data);
        }

        return response()->json(['status' => 'ok']);
    }

    /**
     * Handle Flutterwave Webhook
     */
    public function handleFlutterwave(Request $request)
    {
        // Validate signature/secret hash
        $signature = $request->header('verif-hash');
        if (!$signature || $signature !== config('payment.flutterwave.encryption_key')) {
             return response()->json(['message' => 'Invalid signature'], 400);
        }

        $event = $request->input('event');
        $data = $request->input('data');

        if ($data['status'] === 'successful') {
            $this->processSuccessfulPayment($data['tx_ref'], 'flutterwave', $data);
        }

        return response()->json(['status' => 'ok']);
    }

    protected function processSuccessfulPayment($reference, $provider, $data)
    {
        $txn = PaymentTransaction::where('provider_reference', $reference)->first();

        if ($txn && $txn->status !== 'success') {
            $txn->update([
                'status' => 'success',
                'metadata' => array_merge($txn->metadata ?? [], ['webhook_data' => $data])
            ]);

            // Create or update subscription
            if (!$txn->subscription_id) {
                $sub = Subscription::create([
                    'user_id' => $txn->metadata['user_id'],
                    'plan_name' => $txn->metadata['plan_name'],
                    'start_date' => now(),
                    'end_date' => now()->addMonth(),
                    'status' => 'active',
                    'license_key' => 'DRX-' . strtoupper(bin2hex(random_bytes(8))),
                ]);
                $txn->update(['subscription_id' => $sub->id]);
            }
        }
    }
}
