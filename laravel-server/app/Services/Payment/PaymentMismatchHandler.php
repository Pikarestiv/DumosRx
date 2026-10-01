<?php

namespace App\Services\Payment;

use App\Models\PaymentTransaction;
use App\Models\User;
use App\Services\AdminAlertService;
use Illuminate\Support\Facades\Log;

/**
 * "The provider says this reference was paid, but not for what the
 * transaction was created for." Shared by the two observers of that
 * condition — PaymentController's webhook and SubscriptionController::
 * verifyPayment() — so neither can quietly keep the money.
 *
 * See laravel-server/AGENTS.md's subscription-payment section for why the
 * refund is attempted and the alert is sent only after failTransaction()'s
 * own transaction has committed.
 */
class PaymentMismatchHandler
{
    public function __construct(private PaymentService $paymentService)
    {
    }

    public function handle(PaymentTransaction $txn, float $reportedAmount, string $reportedCurrency, array $providerData = []): void
    {
        // A concurrent observer may already have activated this transaction
        // legitimately; never refund a charge that bought a live subscription.
        if (($txn->fresh()?->status ?? null) !== 'pending') {
            return;
        }

        $expectedCurrency = strtoupper((string) ($txn->currency ?: 'NGN'));
        $reference = (string) $txn->provider_reference;

        Log::warning('Payment amount/currency mismatch; refusing to activate and refunding.', [
            'reference' => $reference,
            'provider' => $txn->provider,
            'reported_amount' => $reportedAmount,
            'reported_currency' => $reportedCurrency,
            'expected_amount' => (float) $txn->amount,
            'expected_currency' => $expectedCurrency,
        ]);

        $refund = $this->refund($reference, (string) $txn->provider);

        app(\App\Http\Controllers\Api\Web\SubscriptionController::class)->failTransaction($txn, [
            'suspicious_webhook' => [
                'reason' => 'amount_or_currency_mismatch',
                'reported_amount' => $reportedAmount,
                'reported_currency' => $reportedCurrency,
                'webhook_data' => $providerData,
            ],
            'mismatch_refund' => $refund,
        ]);

        $this->alert($txn, $reportedAmount, $reportedCurrency, $expectedCurrency, $refund);
    }

    private function refund(string $reference, string $provider): array
    {
        if ($reference === '') {
            return ['success' => false, 'message' => 'No provider reference recorded for this transaction.'];
        }

        try {
            $result = $this->paymentService->refundTransaction($reference, $provider);
        } catch (\Throwable $e) {
            $result = ['success' => false, 'message' => $e->getMessage()];
        }

        return [
            'success' => (bool) ($result['success'] ?? false),
            'message' => (string) ($result['message'] ?? ''),
            'attempted_at' => now()->toIso8601String(),
        ];
    }

    private function alert(PaymentTransaction $txn, float $reportedAmount, string $reportedCurrency, string $expectedCurrency, array $refund): void
    {
        $user = User::find($txn->metadata['user_id'] ?? null);
        $refunded = $refund['success']
            ? 'Refund: SUCCEEDED automatically.'
            : 'Refund: FAILED — refund this by hand. ' . ($refund['message'] ?: 'no provider message');

        try {
            AdminAlertService::send('Payment mismatch: ' . ($txn->metadata['plan_name'] ?? 'unknown plan'), [
                'A payment was confirmed by the provider for an amount or currency that does not match the transaction it was created for. The subscription was NOT activated.',
                'Reference: ' . $txn->provider_reference,
                'Provider: ' . $txn->provider,
                'User: ' . ($user ? "{$user->first_name} {$user->last_name} ({$user->email})" : 'unknown'),
                'Expected: ' . number_format((float) $txn->amount, 2) . ' ' . $expectedCurrency,
                'Reported: ' . number_format($reportedAmount, 2) . ' ' . ($reportedCurrency ?: 'unknown'),
                $refunded,
            ]);
        } catch (\Throwable $e) {
            Log::error('Failed to send the payment-mismatch admin alert: ' . $e->getMessage());
        }
    }
}
