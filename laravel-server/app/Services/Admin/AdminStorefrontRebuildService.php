<?php

namespace App\Services\Admin;

use App\Console\Commands\RebuildStorefrontIfDirty;
use App\Models\ActivityLog;
use App\Models\Storefront;
use App\Models\SystemConfig;
use App\Services\Storefront\StorefrontRebuildDispatcher;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/** The admin's manual rebuild; rationale in laravel-server/AGENTS.md. */
class AdminStorefrontRebuildService
{
    public function __construct(private StorefrontRebuildDispatcher $dispatcher) {}

    /**
     * @return string|null null when the rebuild was dispatched, otherwise why not
     */
    public function rebuildNow(): ?string
    {
        $requestedAt = now();
        $failure = $this->dispatcher->dispatch();

        if ($failure !== null) {
            return $failure;
        }

        if (config('dumos.storefront.rebuild_token')) {
            $this->recordRequest($requestedAt);
        } else {
            DB::table('stores')
                ->whereNotNull('storefront_dirty_at')
                ->where('storefront_dirty_at', '<=', $requestedAt)
                ->update(['storefront_dirty_at' => null]);
            Storefront::clearStyleDirty($requestedAt);
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'STOREFRONT_REBUILD_REQUESTED',
            'description' => 'Requested a rebuild of every storefront from the admin panel',
        ]);

        return null;
    }

    private function recordRequest(Carbon $requestedAt): void
    {
        $outstanding = SystemConfig::getVal(RebuildStorefrontIfDirty::REQUESTED_AT_KEY);
        $timeout = max(1, (int) config('dumos.storefront.rebuild_confirmation_timeout', 45));

        if ($outstanding && now()->lt(Carbon::parse($outstanding)->addMinutes($timeout))) {
            return;
        }

        SystemConfig::setVal(
            RebuildStorefrontIfDirty::REQUESTED_AT_KEY,
            $requestedAt->toIso8601String(),
            'When the last storefront rebuild was dispatched; cleared by the workflow\'s success callback.',
        );
    }
}
