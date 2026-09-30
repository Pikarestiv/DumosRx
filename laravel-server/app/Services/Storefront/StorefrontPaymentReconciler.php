<?php

namespace App\Services\Storefront;

use App\Models\StorefrontPaymentIntent;
use App\Services\AdminAlertService;
use App\Services\Payment\PaymentService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Everything that observes a storefront payment WITHOUT the customer's
 * browser: the provider's webhook and the scheduled stale-intent sweep.
 *
 * Deliberately does not create the order — see laravel-server/AGENTS.md
 * (PG-2) for why an intent that has been paid for is marked `paid` and left
 * for whichever confirmation arrives, rather than having an order invented
 * for it from details the webhook does not carry.
 */
class StorefrontPaymentReconciler
{
    private const AMOUNT_TOLERANCE = 0.01;

    public function __construct(private PaymentService $paymentService)
    {
    }

    /**
     * A provider says this reference was paid. Records that against the
     * intent, or refunds it when what was paid isn't what was asked for.
     */
    public function recordProviderPayment(StorefrontPaymentIntent $intent, float $reportedAmount, string $reportedCurrency, array $providerData = []): string
    {
        $claimed = $this->claim($intent);
        if (!$claimed) {
            return 'skipped';
        }

        if ($this->matches($claimed, $reportedAmount, $reportedCurrency)) {
            $claimed->update(['status' => 'paid']);

            return 'paid';
        }

        return $this->refundMismatch($claimed, $reportedAmount, $reportedCurrency, $providerData);
    }

    /**
     * Intents left unclaimed past $minutes: re-verify a `pending` one against
     * the provider, and escalate a `paid` one nobody ever turned into an order.
     *
     * @return array{verified: int, paid: int, abandoned: int, refunded: int, alerted: int, unreachable: int}
     */
    public function sweep(int $minutes): array
    {
        $cutoff = now()->subMinutes($minutes);
        $counts = ['verified' => 0, 'paid' => 0, 'abandoned' => 0, 'refunded' => 0, 'alerted' => 0, 'unreachable' => 0];

        StorefrontPaymentIntent::where('status', 'pending')
            ->where('created_at', '<', $cutoff)
            ->orderBy('created_at')
            ->each(function (StorefrontPaymentIntent $intent) use (&$counts) {
                $counts['verified']++;
                $outcome = $this->reverify($intent);
                if (isset($counts[$outcome])) {
                    $counts[$outcome]++;
                }
            });

        StorefrontPaymentIntent::where('status', 'paid')
            ->whereNull('reconciliation_alerted_at')
            ->where('created_at', '<', $cutoff)
            ->orderBy('created_at')
            ->each(function (StorefrontPaymentIntent $intent) use (&$counts) {
                $this->alertUnclaimed($intent);
                $counts['alerted']++;
            });

        return $counts;
    }

    private function reverify(StorefrontPaymentIntent $intent): string
    {
        $verification = $this->paymentService->verifyTransaction($intent->reference, $intent->provider);

        if ($verification['unknown'] ?? false) {
            return 'unreachable';
        }

        if (!($verification['success'] ?? false)) {
            $this->claim($intent)?->update(['status' => 'abandoned']);

            return 'abandoned';
        }

        $outcome = $this->recordProviderPayment(
            $intent,
            (float) ($verification['amount'] ?? 0),
            strtoupper((string) ($verification['currency'] ?? '')),
            $verification['data'] ?? [],
        );

        if ($outcome === 'paid') {
            $this->alertUnclaimed($intent->fresh());
        }

        return $outcome;
    }

    /**
     * Re-reads the row under a lock and hands it back only while it is still
     * claimable, so a confirmation racing this sweep or webhook wins cleanly.
     */
    private function claim(StorefrontPaymentIntent $intent): ?StorefrontPaymentIntent
    {
        return DB::transaction(function () use ($intent) {
            $locked = StorefrontPaymentIntent::where('id', $intent->id)->lockForUpdate()->first();

            return $locked && in_array($locked->status, StorefrontPaymentIntent::CLAIMABLE_STATUSES, true)
                ? $locked
                : null;
        });
    }

    private function matches(StorefrontPaymentIntent $intent, float $reportedAmount, string $reportedCurrency): bool
    {
        $expectedCurrency = strtoupper((string) ($intent->currency ?: config('payment.currency', 'NGN')));

        return $reportedCurrency === $expectedCurrency
            && $reportedAmount >= (float) $intent->amount - self::AMOUNT_TOLERANCE;
    }

    private function refundMismatch(StorefrontPaymentIntent $intent, float $reportedAmount, string $reportedCurrency, array $providerData): string
    {
        Log::warning('Storefront payment amount/currency mismatch; refunding.', [
            'reference' => $intent->reference,
            'store_id' => $intent->store_id,
            'reported_amount' => $reportedAmount,
            'reported_currency' => $reportedCurrency,
            'expected_amount' => (float) $intent->amount,
            'expected_currency' => $intent->currency,
            'provider_data' => $providerData,
        ]);

        $refund = $this->refund($intent);

        if ($refund['success']) {
            $intent->update(['status' => 'refunded']);
        }

        $this->alert('Storefront payment mismatch: ' . $intent->reference, [
            'A storefront payment was confirmed by the provider for an amount or currency that does not match the cart it was minted for. No order was created.',
            'Reference: ' . $intent->reference,
            'Store: ' . ($intent->store?->name ?? $intent->store_id),
            'Customer email: ' . ($intent->customer_email ?: 'unknown'),
            'Expected: ' . number_format((float) $intent->amount, 2) . ' ' . $intent->currency,
            'Reported: ' . number_format($reportedAmount, 2) . ' ' . ($reportedCurrency ?: 'unknown'),
            $refund['success']
                ? 'Refund: SUCCEEDED automatically.'
                : 'Refund: FAILED — refund this by hand. ' . ($refund['message'] ?: 'no provider message'),
        ], $intent);

        return 'refunded';
    }

    private function alertUnclaimed(?StorefrontPaymentIntent $intent): void
    {
        if (!$intent) {
            return;
        }

        $this->alert('Storefront payment with no order: ' . $intent->reference, [
            'A storefront customer paid but never returned to place the order, so the payment is settled with no order against it. Either contact the customer to complete it or refund the reference.',
            'Reference: ' . $intent->reference,
            'Store: ' . ($intent->store?->name ?? $intent->store_id),
            'Customer email: ' . ($intent->customer_email ?: 'unknown'),
            'Amount: ' . number_format((float) $intent->amount, 2) . ' ' . $intent->currency,
            'Paid for: ' . $this->describeItems($intent),
        ], $intent);
    }

    private function describeItems(StorefrontPaymentIntent $intent): string
    {
        $lines = collect($intent->items ?? [])
            ->map(fn ($item) => ($item['product_id'] ?? '?') . ' x' . ($item['quantity'] ?? '?'))
            ->all();

        return $lines ? implode(', ', $lines) : 'unknown';
    }

    private function refund(StorefrontPaymentIntent $intent): array
    {
        try {
            $result = $this->paymentService->refundTransaction($intent->reference, (string) $intent->provider);
        } catch (\Throwable $e) {
            $result = ['success' => false, 'message' => $e->getMessage()];
        }

        return [
            'success' => (bool) ($result['success'] ?? false),
            'message' => (string) ($result['message'] ?? ''),
        ];
    }

    /**
     * AdminAlertService::send() is synchronous mail, so it is only ever
     * called here — after every status write has committed (A-110).
     */
    private function alert(string $title, array $lines, StorefrontPaymentIntent $intent): void
    {
        try {
            AdminAlertService::send($title, $lines);
        } catch (\Throwable $e) {
            Log::error('Failed to send the storefront reconciliation alert: ' . $e->getMessage());
        }

        $intent->forceFill(['reconciliation_alerted_at' => now()])->save();
    }
}
