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
    public function initializeTransaction($amount, $email, $metadata = [])
    {
        // Try Paystack first
        try {
            return $this->initializePaystack($amount, $email, $metadata);
        } catch (\Exception $e) {
            Log::warning("Paystack initialization failed, falling back to Flutterwave: " . $e->getMessage());
            
            // Fallback to Flutterwave
            try {
                return $this->initializeFlutterwave($amount, $email, $metadata);
            } catch (\Exception $fe) {
                Log::error("Both payment gateways failed: " . $fe->getMessage());
                throw new \Exception("Unable to initialize payment gateway. Please try again later.");
            }
        }
    }

    protected function initializePaystack($amount, $email, $metadata)
    {
        $response = Http::withToken($this->paystackKey)
            ->post('https://api.paystack.co/transaction/initialize', [
                'amount' => $amount * 100, // Paystack uses kobo
                'email' => $email,
                'metadata' => $metadata,
                'callback_url' => config('app.frontend_url') . '/dashboard/subscription/verify',
            ]);

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

    protected function initializeFlutterwave($amount, $email, $metadata)
    {
        $response = Http::withToken($this->flutterwaveKey)
            ->post('https://api.flutterwave.com/v3/payments', [
                'tx_ref' => 'DRX-FW-' . uniqid(),
                'amount' => $amount,
                'currency' => 'NGN',
                'redirect_url' => config('app.frontend_url') . '/dashboard/subscription/verify',
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
            'reference' => $data['data']['tx_ref'], // Note: FW uses tx_ref for tracking
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
            'data' => $data['data']
        ];
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
            'data' => $data['data']
        ];
    }
}
