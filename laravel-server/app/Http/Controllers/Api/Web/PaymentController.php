<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\PaymentTransaction;
use App\Models\Subscription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use OpenApi\Attributes as OA;
use App\Http\Controllers\Api\Web\SubscriptionController;

class PaymentController extends Controller
{
    #[OA\Post(
        path: '/webhooks/paystack',
        summary: 'Paystack payment webhook (not for manual use)',
        description: 'Verifies the `x-paystack-signature` header (HMAC-SHA512 of the raw body using the Paystack secret key) before processing. On `charge.success`, activates the pending subscription tied to the transaction reference.',
        tags: ['Webhooks'],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(type: 'object')),
        responses: [
            new OA\Response(response: 200, description: 'Acknowledged', content: new OA\JsonContent(properties: [new OA\Property(property: 'status', type: 'string', example: 'ok')])),
            new OA\Response(response: 400, description: 'Invalid/missing signature', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
        ],
    )]
    public function handlePaystack(Request $request)
    {
        // Validate signature
        $signature = $request->header('x-paystack-signature');
        if (!$signature || !hash_equals(hash_hmac('sha512', $request->getContent(), config('payment.paystack.secret_key')), $signature)) {
            return response()->json(['message' => 'Invalid signature'], 400);
        }

        $event = $request->input('event');
        $data = $request->input('data');

        if ($event === 'charge.success' && is_array($data) && !empty($data['reference'])) {
            $this->processSuccessfulPayment($data['reference'], 'paystack', $data);
        }

        return response()->json(['status' => 'ok']);
    }

    #[OA\Post(
        path: '/webhooks/flutterwave',
        summary: 'Flutterwave payment webhook (not for manual use)',
        description: 'Verifies the `verif-hash` header against the configured encryption key before processing. On a `successful` status, activates the pending subscription tied to `tx_ref`.',
        tags: ['Webhooks'],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(type: 'object')),
        responses: [
            new OA\Response(response: 200, description: 'Acknowledged', content: new OA\JsonContent(properties: [new OA\Property(property: 'status', type: 'string', example: 'ok')])),
            new OA\Response(response: 400, description: 'Invalid/missing signature', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
        ],
    )]
    public function handleFlutterwave(Request $request)
    {
        // Validate signature/secret hash
        $signature = $request->header('verif-hash');
        if (!$signature || !hash_equals((string) config('payment.flutterwave.encryption_key'), $signature)) {
             return response()->json(['message' => 'Invalid signature'], 400);
        }

        $event = $request->input('event');
        $data = $request->input('data');

        if (is_array($data) && ($data['status'] ?? null) === 'successful' && !empty($data['tx_ref'])) {
            $this->processSuccessfulPayment($data['tx_ref'], 'flutterwave', $data);
        }

        return response()->json(['status' => 'ok']);
    }

    protected function processSuccessfulPayment($reference, $provider, $data)
    {
        $txn = PaymentTransaction::where('provider_reference', $reference)->first();

        if (!$txn || $txn->status === 'success') {
            return;
        }

        // Delegates to the same "activate subscription from a successful
        // transaction" logic SubscriptionController::verifyPayment() uses,
        // so the webhook path can no longer diverge from it (wrong end_date
        // for yearly plans, or skipping credit/referral/coupon accounting)
        // depending on which of the two arrives first for a given reference.
        // The shared method is itself lock-guarded, so if verifyPayment gets
        // there first this just short-circuits.
        $result = app(SubscriptionController::class)->activateSubscriptionFromTransaction($txn, ['webhook_data' => $data]);

        if ($result['already']) {
            return;
        }

        $txn->refresh();

        try {
            $user = \App\Models\User::find($txn->metadata['user_id']);
            \App\Services\AdminAlertService::send(
                'Payment Successful: ' . ($txn->metadata['plan_name'] ?? 'Unknown Plan'),
                [
                    "A successful payment has been processed.",
                    "User: " . ($user ? "{$user->first_name} {$user->last_name} ({$user->email})" : "Unknown (ID: {$txn->metadata['user_id']})"),
                    "Amount: ₦" . number_format($txn->amount ?? 0, 2),
                    "Provider: {$provider}",
                    "Reference: {$reference}"
                ]
            );
        } catch (\Exception $e) {
            Log::error("Failed to send super admin alert for payment: " . $e->getMessage());
        }
    }
}
