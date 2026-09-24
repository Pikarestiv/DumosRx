<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\PaymentTransaction;
use App\Models\Subscription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
        // An unset PAYSTACK_SECRET_KEY makes config() return null, which
        // hash_hmac() silently coerces to an empty key - anyone could then
        // compute a "valid" signature themselves. Refuse to verify at all
        // rather than verify against nothing.
        $secret = (string) config('payment.paystack.secret_key');
        if ($secret === '') {
            Log::error('Paystack webhook received but payment.paystack.secret_key is not configured; rejecting.');
            return response()->json(['message' => 'Webhook not configured'], 500);
        }

        // Validate signature
        $signature = $request->header('x-paystack-signature');
        if (!$signature || !hash_equals(hash_hmac('sha512', $request->getContent(), $secret), $signature)) {
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
        description: 'Verifies the `verif-hash` header against the configured Flutterwave webhook secret hash (`FLUTTERWAVE_SECRET_HASH`) before processing. On a `successful` status, and only if the reported amount/currency match the recorded transaction, activates the pending subscription tied to `tx_ref`.',
        tags: ['Webhooks'],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(type: 'object')),
        responses: [
            new OA\Response(response: 200, description: 'Acknowledged', content: new OA\JsonContent(properties: [new OA\Property(property: 'status', type: 'string', example: 'ok')])),
            new OA\Response(response: 400, description: 'Invalid/missing signature', content: new OA\JsonContent(ref: '#/components/schemas/MessageOnly')),
        ],
    )]
    public function handleFlutterwave(Request $request)
    {
        // Flutterwave authenticates webhooks with the "Secret Hash" set in
        // the dashboard's webhook settings - a value distinct from the
        // Encryption Key (which only encrypts card payloads). Comparing
        // against the encryption key meant genuine webhooks never
        // authenticated (and the credential in use was the wrong one).
        $secretHash = (string) config('payment.flutterwave.secret_hash');
        if ($secretHash === '') {
            Log::error('Flutterwave webhook received but payment.flutterwave.secret_hash is not configured; rejecting.');
            return response()->json(['message' => 'Webhook not configured'], 500);
        }

        // Validate signature/secret hash
        $signature = $request->header('verif-hash');
        if (!$signature || !hash_equals($secretHash, $signature)) {
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

        // A valid signature only proves the payload came from the provider -
        // it says nothing about WHAT was paid. Without this check a genuine
        // ₦100 charge (or a charge in another currency) could activate a
        // ₦100,000 plan. Both providers report the settled amount and
        // currency in the webhook body, so compare them against what this
        // transaction was created for before activating anything.
        //
        // Unit: Paystack reports `amount` in the currency's minor unit
        // (kobo), matching its initialize payload (`$amount * 100` in
        // PaymentService::initializePaystack) and its verify response
        // (divided by 100 in verifyPaystack). Flutterwave reports the major
        // unit (naira), matching the un-multiplied `amount` it is sent.
        // PaymentTransaction::amount is stored in naira (SubscriptionController
        // writes $finalAmount directly), so only Paystack needs converting.
        $reportedAmount = (float) ($data['amount'] ?? 0);
        if ($provider === 'paystack') {
            $reportedAmount = $reportedAmount / 100;
        }

        $reportedCurrency = strtoupper((string) ($data['currency'] ?? ''));
        $expectedCurrency = strtoupper((string) ($txn->currency ?: 'NGN'));

        // Same 1-kobo tolerance SubscriptionController::verifyPayment uses:
        // $txn->amount can carry sub-kobo precision from coupon-percentage
        // arithmetic while the provider only ever settles whole kobo.
        if ($reportedCurrency !== $expectedCurrency || $reportedAmount < (float) $txn->amount - 0.01) {
            Log::warning('Payment webhook amount/currency mismatch; refusing to activate.', [
                'reference' => $reference,
                'provider' => $provider,
                'reported_amount' => $reportedAmount,
                'reported_currency' => $reportedCurrency,
                'expected_amount' => (float) $txn->amount,
                'expected_currency' => $expectedCurrency,
            ]);

            // Mark failed under the same lock/re-check pattern
            // activateSubscriptionFromTransaction uses, so a mismatched
            // webhook arriving after a legitimate activation can't stomp a
            // live subscription's transaction back to 'failed'.
            DB::transaction(function () use ($txn, $data, $reportedAmount, $reportedCurrency) {
                $locked = PaymentTransaction::where('id', $txn->id)->lockForUpdate()->first();
                if ($locked && $locked->status === 'pending') {
                    $locked->update([
                        'status' => 'failed',
                        'metadata' => array_merge($locked->metadata ?? [], [
                            'suspicious_webhook' => [
                                'reason' => 'amount_or_currency_mismatch',
                                'reported_amount' => $reportedAmount,
                                'reported_currency' => $reportedCurrency,
                                'webhook_data' => $data,
                            ],
                        ]),
                    ]);
                }
            });

            // Deliberately not an error response: the payload was genuinely
            // signed, so there is nothing for the provider to retry. Erroring
            // would just make it redeliver this forever.
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
