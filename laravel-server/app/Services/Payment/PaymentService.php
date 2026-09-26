<?php

namespace App\Services\Payment;

use App\Models\PaymentTransaction;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PaymentService
{
    protected $paystackKey;
    protected $flutterwaveKey;

    public function __construct()
    {
        $this->paystackKey = config('payment.paystack.secret_key');
        $this->flutterwaveKey = config('payment.flutterwave.secret_key');
    }

    /**
     * Initialize a transaction with Paystack (Primary) or Flutterwave (Fallback)
     */
    public function initializeTransaction($amount, $email, $metadata = [], ?string $callbackUrl = null, ?string $subaccount = null, ?string $currency = null)
    {
        $systemConfig = \App\Models\SystemConfig::getVal('subscription_plans', []);
        $paystackEnabled = $systemConfig['enable_paystack'] ?? true;
        $flutterwaveEnabled = $systemConfig['enable_flutterwave'] ?? true;

        if (!$paystackEnabled && !$flutterwaveEnabled) {
            throw new \Exception("No payment gateways are currently enabled by the administrator.");
        }

        if ($paystackEnabled && !$flutterwaveEnabled) {
            // Only Paystack is enabled
            return $this->initializePaystack($amount, $email, $metadata, $callbackUrl, $subaccount, $currency);
        }

        if (!$paystackEnabled && $flutterwaveEnabled) {
            // Only Flutterwave is enabled
            return $this->initializeFlutterwave($amount, $email, $metadata, $callbackUrl);
        }

        // Both are enabled: Try Paystack first
        try {
            return $this->initializePaystack($amount, $email, $metadata, $callbackUrl, $subaccount, $currency);
        } catch (\Exception $e) {
            Log::warning("Paystack initialization failed, falling back to Flutterwave: " . $e->getMessage());

            // Fallback to Flutterwave
            try {
                return $this->initializeFlutterwave($amount, $email, $metadata, $callbackUrl);
            } catch (\Exception $fe) {
                Log::error("Both payment gateways failed: " . $fe->getMessage());
                throw new \Exception("Unable to initialize payment gateway. Please try again later.");
            }
        }
    }

    protected function initializePaystack($amount, $email, $metadata, ?string $callbackUrl = null, ?string $subaccount = null, ?string $currency = null)
    {
        $payload = [
            'amount' => (int) round($amount * 100), // Paystack uses kobo
            'email' => $email,
            'metadata' => $metadata,
            // Every caller previously got the subscription-verify page
            // regardless of what they were actually paying for - a
            // storefront checkout redirected a paying customer into a
            // page that 404s on their reference, so the order never got
            // created despite the charge succeeding. Callers now pass
            // their own return URL; the subscription flow's callers omit
            // it and keep the original default.
            'callback_url' => $callbackUrl ?? (config('app.frontend_url') . '/dashboard/subscription/verify'),
        ];

        // Only ever set by the storefront checkout path (Task 7) - the
        // subscription flow's call sites pass neither, and must keep
        // charging DumosRx's own main account exactly as today.
        if ($subaccount !== null) {
            $payload['subaccount'] = $subaccount;
        }
        if ($currency !== null) {
            $payload['currency'] = $currency;
        }

        $response = Http::withToken($this->paystackKey)
            ->post('https://api.paystack.co/transaction/initialize', $payload);

        if (!$response->successful()) {
            throw new \Exception("Paystack Error: " . $response->body());
        }

        $data = $response->json();

        return [
            'provider' => 'paystack',
            'reference' => $data['data']['reference'],
            'checkout_url' => $data['data']['authorization_url']
        ];
    }

    protected function initializeFlutterwave($amount, $email, $metadata, ?string $callbackUrl = null)
    {
        // Flutterwave's POST /v3/payments response body only carries
        // {"data": {"link": ...}} - it does NOT echo tx_ref back. Reading it
        // out of the response therefore stored a NULL reference on the
        // PaymentTransaction, so no webhook or verify call could ever match
        // it again. Keep the locally generated ref and return that.
        $txRef = 'DRX-FW-' . uniqid();

        $response = Http::withToken($this->flutterwaveKey)
            ->post('https://api.flutterwave.com/v3/payments', [
                'tx_ref' => $txRef,
                'amount' => $amount,
                'currency' => 'NGN',
                'redirect_url' => $callbackUrl ?? (config('app.frontend_url') . '/dashboard/subscription/verify'),
                'customer' => [
                    'email' => $email,
                ],
                'meta' => $metadata,
                'customizations' => [
                    'title' => 'DumosRx Subscription',
                    'description' => 'Payment for medical inventory platform',
                ]
            ]);

        if (!$response->successful()) {
            throw new \Exception("Flutterwave Error: " . $response->body());
        }

        $data = $response->json();

        return [
            'provider' => 'flutterwave',
            'reference' => $txRef, // Note: FW uses tx_ref for tracking
            'checkout_url' => $data['data']['link']
        ];
    }

    /**
     * Verify a transaction with the respective provider
     */
    public function verifyTransaction($reference, $provider)
    {
        if ($provider === 'paystack') {
            return $this->verifyPaystack($reference);
        } else {
            return $this->verifyFlutterwave($reference);
        }
    }

    protected function verifyPaystack($reference)
    {
        $response = Http::withToken($this->paystackKey)
            ->get("https://api.paystack.co/transaction/verify/{$reference}");

        if (!$response->successful()) {
            return ['success' => false, 'message' => 'Paystack verification failed'];
        }

        $data = $response->json();
        return [
            'success' => $data['data']['status'] === 'success',
            'amount' => $data['data']['amount'] / 100,
            // Paystack returns the currency the charge actually settled in.
            // Callers must assert it, otherwise a charge in a weaker unit
            // (e.g. 5000 of some other currency) can satisfy a naira amount.
            'currency' => $data['data']['currency'] ?? null,
            'data' => $data['data']
        ];
    }

    /**
     * Provider-agnostic refund, dispatched the same way verifyTransaction()
     * already dispatches by provider. Flutterwave refund is out of scope for
     * this pass (no storefront checkout reaches Flutterwave today) - fails
     * closed with success=false rather than silently no-opping.
     */
    public function refundTransaction(string $reference, string $provider, ?int $amountInSubunit = null): array
    {
        if ($provider === 'paystack') {
            return app(\App\Services\Payment\PaystackSubaccountService::class)
                ->refund($reference, $amountInSubunit);
        }

        return ['success' => false, 'message' => "Refunds are not supported for provider '{$provider}'."];
    }

    protected function verifyFlutterwave($reference)
    {
        // FW verification usually needs the ID or tx_ref
        // We'll use the verify by tx_ref if possible or standard verify
        $response = Http::withToken($this->flutterwaveKey)
            ->get("https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref={$reference}");

        if (!$response->successful()) {
            return ['success' => false, 'message' => 'Flutterwave verification failed'];
        }

        $data = $response->json();
        return [
            'success' => $data['data']['status'] === 'successful',
            'amount' => $data['data']['amount'],
            'currency' => $data['data']['currency'] ?? null,
            'data' => $data['data']
        ];
    }
}
