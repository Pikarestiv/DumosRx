<?php

namespace Tests\Feature\Admin;

use App\Models\PaymentTransaction;
use App\Models\Subscription;
use App\Models\User;
use App\Services\Admin\AdminRevenueService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminRevenueCurrencyBreakdownTest extends TestCase
{
    use RefreshDatabase;

    private function makeTransaction(string $currency, float $amount, string $provider = 'paystack'): PaymentTransaction
    {
        $user = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $subscription = Subscription::create([
            'user_id' => $user->id,
            'plan_name' => 'premium',
            'status' => 'active',
            'is_trial' => false,
            'start_date' => now()->subMonth(),
            'end_date' => now()->addMonth(),
            'license_key' => 'LIC-'.uniqid(),
        ]);

        return PaymentTransaction::create([
            'subscription_id' => $subscription->id,
            'provider' => $provider,
            'provider_reference' => 'ref-'.uniqid(),
            'amount' => $amount,
            'currency' => $currency,
            'status' => 'success',
        ]);
    }

    public function test_it_reports_revenue_broken_down_per_currency(): void
    {
        $this->makeTransaction('NGN', 10000);
        $this->makeTransaction('NGN', 5000);
        $this->makeTransaction('GHS', 300);

        $overview = app(AdminRevenueService::class)->getOverview();

        $this->assertSame(['NGN' => 15000.0, 'GHS' => 300.0], $overview['totals_by_currency']);
    }

    public function test_it_splits_manual_and_automated_revenue_per_currency(): void
    {
        $this->makeTransaction('NGN', 10000, 'paystack');
        $this->makeTransaction('NGN', 2000, 'bank_transfer');
        $this->makeTransaction('KES', 400, 'bank_transfer');

        $overview = app(AdminRevenueService::class)->getOverview();

        $this->assertSame(['NGN' => 10000.0], $overview['automated_by_currency']);
        $this->assertSame(['NGN' => 2000.0, 'KES' => 400.0], $overview['manual_by_currency']);
    }

    public function test_it_buckets_a_transaction_with_a_blank_currency_under_ngn(): void
    {
        $txn = $this->makeTransaction('NGN', 700);
        $txn->forceFill(['currency' => ''])->save();

        $overview = app(AdminRevenueService::class)->getOverview();

        $this->assertSame(['NGN' => 700.0], $overview['totals_by_currency']);
    }

    public function test_it_returns_empty_breakdowns_when_there_are_no_payments(): void
    {
        $overview = app(AdminRevenueService::class)->getOverview();

        $this->assertSame([], $overview['totals_by_currency']);
        $this->assertSame([], $overview['automated_by_currency']);
        $this->assertSame([], $overview['manual_by_currency']);
    }
}
