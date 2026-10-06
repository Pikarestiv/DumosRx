<?php

namespace App\Support;

final class CurrencyTotals
{
    public const FALLBACK_CURRENCY = 'NGN';

    /**
     * @param  iterable<array{currency: ?string, amount: mixed}>  $pairs
     * @return array<string, float>
     */
    public static function fromPairs(iterable $pairs): array
    {
        $totals = [];

        foreach ($pairs as $pair) {
            $currency = self::normalise($pair['currency'] ?? null);
            $totals[$currency] = ($totals[$currency] ?? 0.0) + (float) ($pair['amount'] ?? 0);
        }

        arsort($totals);

        return $totals;
    }

    private static function normalise(?string $currency): string
    {
        $trimmed = strtoupper(trim((string) $currency));

        return $trimmed === '' ? self::FALLBACK_CURRENCY : $trimmed;
    }
}
