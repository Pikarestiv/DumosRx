<?php

namespace App\Services\Admin\Concerns;

/**
 * Shared by AdminStoreService::grantTrial() and AdminUserService::
 * grantUserTrial() - both need to turn an admin-picked duration preset (or
 * an explicit end date) into an absolute end instant the same way.
 */
trait ResolvesTrialDuration
{
    /** Resolves an admin-picked trial duration string (e.g. "3 months") into
     * an absolute end Carbon instant. An explicit $endDate always wins when
     * present, used for exact-date grants instead of a preset window. */
    private function resolveTrialEndDate(?string $durationString, ?string $endDate)
    {
        if ($endDate) {
            return \Carbon\Carbon::parse($endDate)->endOfDay();
        }

        $daysByDuration = [
            '1 day' => 1,
            '3 days' => 3,
            '7 days' => 7,
            '14 days' => 14,
            '21 days' => 21,
            '30 days' => 30,
            '1 month' => 30,
            '3 months' => 90,
            '6 months' => 180,
            '1 year' => 365,
        ];

        $days = $daysByDuration[$durationString] ?? 14; // Default
        return now()->addDays($days);
    }
}
