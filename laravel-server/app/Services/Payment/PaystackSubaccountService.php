<?php

namespace App\Services\Payment;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Wraps the Paystack endpoints a store's online-payment subaccount needs:
 * looking up banks, resolving an account number to a name, creating the
 * subaccount, updating its platform-fee percentage, and refunding a
 * transaction. Same house style as PaymentService - plain Http calls, no
 * SDK - deliberately kept separate from it since PaymentService is about
 * charging a customer, this is about paying a store owner.
 *
 * percentage_charge on Paystack's subaccount API is the percentage the MAIN
 * (platform) account receives, not the subaccount's share - confirmed
 * against Paystack's docs before building this.
 */
class PaystackSubaccountService
{
    protected string $secretKey;

    /**
     * Paystack's documented `country` values for GET /bank. Rwanda and Côte
     * d'Ivoire are supported countries for Paystack generally but not
     * confirmed for this specific endpoint - listBanks() below degrades to
     * [] for them rather than guessing at an unconfirmed value, and the
     * onboarding UI (Task 4) falls back to a plain text bank-name field when
     * this returns empty.
     */
    private const BANK_LIST_COUNTRIES = ['nigeria', 'ghana', 'kenya', 'south africa'];

    public function __construct()
    {
        $this->secretKey = (string) config('payment.paystack.secret_key');
    }

    public function listBanks(string $countryCode): array
    {
        if (!in_array($countryCode, self::BANK_LIST_COUNTRIES, true)) {
            return [];
        }

        try {
            $response = Http::withToken($this->secretKey)
                ->get('https://api.paystack.co/bank', ['country' => $countryCode]);
        } catch (\Throwable $e) {
            Log::warning('Paystack listBanks failed: ' . $e->getMessage());
            return [];
        }

        if (!$response->successful()) {
            return [];
        }

        return $response->json('data', []);
    }

    public function resolveAccount(string $accountNumber, string $bankCode, string $countryCode): ?array
    {
        try {
            $response = Http::withToken($this->secretKey)
                ->get('https://api.paystack.co/bank/resolve', [
                    'account_number' => $accountNumber,
                    'bank_code' => $bankCode,
                ]);
        } catch (\Throwable $e) {
            Log::warning('Paystack resolveAccount failed: ' . $e->getMessage());
            return null;
        }

        if (!$response->successful()) {
            return null;
        }

        $data = $response->json('data');
        if (!is_array($data) || empty($data['account_name'])) {
            return null;
        }

        return $data;
    }

    public function createSubaccount(
        string $businessName,
        string $bankCode,
        string $accountNumber,
        float $percentageCharge,
    ): string {
        $response = Http::withToken($this->secretKey)
            ->post('https://api.paystack.co/subaccount', [
                'business_name' => $businessName,
                'settlement_bank' => $bankCode,
                'account_number' => $accountNumber,
                'percentage_charge' => $percentageCharge,
            ]);

        if (!$response->successful()) {
            throw new \Exception('Paystack subaccount creation failed: ' . $response->body());
        }

        $code = $response->json('data.subaccount_code');
        if (!$code) {
            throw new \Exception('Paystack subaccount creation returned no subaccount_code.');
        }

        return $code;
    }

    public function updateSubaccountFee(string $subaccountCode, float $percentageCharge): void
    {
        $response = Http::withToken($this->secretKey)
            ->put("https://api.paystack.co/subaccount/{$subaccountCode}", [
                'percentage_charge' => $percentageCharge,
            ]);

        if (!$response->successful()) {
            throw new \Exception('Paystack subaccount fee update failed: ' . $response->body());
        }
    }

    /**
     * @param ?int $amountInSubunit Omit for a full refund; Paystack refuses
     *   an amount greater than the original transaction.
     */
    public function refund(string $reference, ?int $amountInSubunit = null): array
    {
        $payload = ['transaction' => $reference];
        if ($amountInSubunit !== null) {
            $payload['amount'] = $amountInSubunit;
        }

        try {
            $response = Http::withToken($this->secretKey)
                ->post('https://api.paystack.co/refund', $payload);
        } catch (\Throwable $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }

        $body = $response->json();

        return [
            'success' => $response->successful() && ($body['status'] ?? false),
            'message' => $body['message'] ?? ($response->successful() ? 'Refund processed' : 'Refund failed'),
        ];
    }
}
