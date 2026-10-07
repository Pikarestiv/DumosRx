<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * Bucket labels for a trend window, generated in PHP so the server clock
 * decides the range rather than MySQL's (AGENTS.md §7), and so a bucket with
 * no rows is still present in the output.
 */
class TimeSeries
{
    public const WINDOWS = ['30d', '6m', '12m'];

    public static function isDaily(string $window): bool
    {
        return $window === '30d';
    }

    /** @return array<int, string> oldest first */
    public static function buckets(string $window): array
    {
        if (! in_array($window, self::WINDOWS, true)) {
            throw new \InvalidArgumentException("Unsupported trend window: {$window}");
        }

        return self::isDaily($window)
            ? self::dailyBuckets(30)
            : self::monthlyBuckets($window === '6m' ? 6 : 12);
    }

    public static function startOf(string $window): Carbon
    {
        $first = self::buckets($window)[0];

        return self::isDaily($window)
            ? Carbon::parse($first)->startOfDay()
            : Carbon::parse($first.'-01')->startOfMonth();
    }

    public static function labelFor(string $window, Carbon $moment): string
    {
        return self::isDaily($window) ? $moment->format('Y-m-d') : $moment->format('Y-m');
    }

    /**
     * Fills every bucket in the window, so "we looked and there was nothing"
     * renders as zero rather than as a gap the chart draws straight through.
     *
     * @param  array<string, array<string, float|int>>  $found  keyed by bucket label
     * @return array<int, array{bucket: string, values: array<string, float|int>}>
     */
    public static function fill(string $window, array $found, array $empty): array
    {
        $points = [];

        foreach (self::buckets($window) as $label) {
            $points[] = [
                'bucket' => $label,
                'values' => array_merge($empty, $found[$label] ?? []),
            ];
        }

        return $points;
    }

    /** @return array<int, string> */
    private static function dailyBuckets(int $days): array
    {
        $buckets = [];

        for ($i = $days - 1; $i >= 0; $i--) {
            $buckets[] = now()->subDays($i)->format('Y-m-d');
        }

        return $buckets;
    }

    /** @return array<int, string> */
    private static function monthlyBuckets(int $months): array
    {
        $buckets = [];

        for ($i = $months - 1; $i >= 0; $i--) {
            $buckets[] = now()->startOfMonth()->subMonths($i)->format('Y-m');
        }

        return $buckets;
    }
}
