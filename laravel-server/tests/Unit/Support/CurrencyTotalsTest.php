<?php

namespace Tests\Unit\Support;

use App\Support\CurrencyTotals;
use PHPUnit\Framework\TestCase;

class CurrencyTotalsTest extends TestCase
{
    public function test_it_sums_amounts_per_currency(): void
    {
        $totals = CurrencyTotals::fromPairs([
            ['currency' => 'NGN', 'amount' => 1000],
            ['currency' => 'GHS', 'amount' => 50],
            ['currency' => 'NGN', 'amount' => 500],
        ]);

        $this->assertSame(['NGN' => 1500.0, 'GHS' => 50.0], $totals);
    }

    public function test_it_sorts_currencies_by_amount_descending(): void
    {
        $totals = CurrencyTotals::fromPairs([
            ['currency' => 'KES', 'amount' => 10],
            ['currency' => 'NGN', 'amount' => 900],
            ['currency' => 'GHS', 'amount' => 400],
        ]);

        $this->assertSame(['NGN', 'GHS', 'KES'], array_keys($totals));
    }

    public function test_it_normalises_currency_case(): void
    {
        $totals = CurrencyTotals::fromPairs([
            ['currency' => 'ngn', 'amount' => 100],
            ['currency' => 'NGN', 'amount' => 100],
        ]);

        $this->assertSame(['NGN' => 200.0], $totals);
    }

    public function test_it_buckets_null_and_blank_currencies_under_the_fallback(): void
    {
        $totals = CurrencyTotals::fromPairs([
            ['currency' => null, 'amount' => 100],
            ['currency' => '', 'amount' => 25],
            ['currency' => '   ', 'amount' => 25],
        ]);

        $this->assertSame([CurrencyTotals::FALLBACK_CURRENCY => 150.0], $totals);
        $this->assertArrayNotHasKey('', $totals);
    }

    public function test_it_returns_an_empty_array_for_no_rows(): void
    {
        $this->assertSame([], CurrencyTotals::fromPairs([]));
    }
}
