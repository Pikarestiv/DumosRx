<?php

namespace App\Console\Commands;

use App\Models\Storefront;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Storefront\StorefrontEntitlements;
use App\Services\Storefront\StorefrontPlanWatcher;
use App\Services\Storefront\StorefrontRebuildDispatcher;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** The debounced storefront rebuild trigger; see laravel-server/AGENTS.md, "Model boot() hooks" and "Storefront plan entitlements". */
class RebuildStorefrontIfDirty extends Command
{
    public const REQUESTED_AT_KEY = 'storefront_rebuild_requested_at';

    protected $signature = 'storefront:rebuild-if-dirty {--include-scheduled : Also rebuild for stores whose plan only rebuilds on the daily schedule}';

    protected $description = 'Trigger a storefront rebuild via GitHub Actions if any store\'s published storefront data changed since the last check.';

    public function handle(StorefrontRebuildDispatcher $dispatcher, StorefrontPlanWatcher $watcher, StorefrontEntitlements $entitlements)
    {
        $watcher->reconcile();

        $dirtyStores = DB::table('stores')
            ->whereNotNull('storefront_dirty_at')
            ->get(['id', 'user_id']);

        if ($dirtyStores->isEmpty()) {
            $this->info('No dirty stores - nothing to rebuild.');

            return;
        }

        if (! $this->option('include-scheduled') && ! $this->anyRebuildsOnDemand($dirtyStores, $entitlements)) {
            $this->info('Only stores on a daily-rebuild plan are dirty - leaving them for the scheduled run.');

            return;
        }

        $dirtyStoreIds = $dirtyStores->pluck('id');
        $awaitsConfirmation = (bool) config('dumos.storefront.rebuild_token');

        if ($awaitsConfirmation && ($pendingSince = $this->pendingRebuildRequestedAt())) {
            $this->info('A rebuild dispatched '.$pendingSince->diffForHumans().' has not confirmed yet - not dispatching another.');

            return;
        }

        $requestedAt = now();
        $failure = $dispatcher->dispatch();

        if ($failure === StorefrontRebuildDispatcher::NOT_CONFIGURED) {
            $this->warn('GITHUB_TOKEN/GITHUB_REPO not configured - skipping rebuild trigger (flags left dirty, will retry next run).');

            return;
        }

        if ($failure !== null) {
            $this->error($failure.' - flags left dirty, will retry next run.');

            return;
        }

        if ($awaitsConfirmation) {
            SystemConfig::setVal(
                self::REQUESTED_AT_KEY,
                $requestedAt->toIso8601String(),
                'When the last storefront rebuild was dispatched; cleared by the workflow\'s success callback.',
            );

            $this->info('Storefront rebuild dispatched for '.$dirtyStoreIds->count().' dirty store(s) - flags stay dirty until the deploy confirms.');

            return;
        }

        DB::table('stores')->whereIn('id', $dirtyStoreIds)->update([
            'storefront_dirty_at' => null,
        ]);
        Storefront::clearStyleDirty($requestedAt);

        $this->info('Storefront rebuild dispatched for '.$dirtyStoreIds->count().' dirty store(s).');
    }

    /**
     * @param  Collection<int, \stdClass>  $dirtyStores
     */
    private function anyRebuildsOnDemand(Collection $dirtyStores, StorefrontEntitlements $entitlements): bool
    {
        return User::whereIn('id', $dirtyStores->pluck('user_id')->filter()->unique())->get()
            ->contains(fn (User $owner) => $entitlements->forOwner($owner)['rebuild_mode'] === 'on_demand');
    }

    /**
     * When the outstanding, unconfirmed rebuild was dispatched - or null when
     * there is none, or the last one has been waiting long enough that the
     * workflow must be assumed dead and worth re-dispatching.
     */
    private function pendingRebuildRequestedAt(): ?Carbon
    {
        $raw = SystemConfig::getVal(self::REQUESTED_AT_KEY);
        if (! $raw) {
            return null;
        }

        $requestedAt = Carbon::parse($raw);
        $timeout = max(1, (int) config('dumos.storefront.rebuild_confirmation_timeout', 45));

        return now()->lt($requestedAt->copy()->addMinutes($timeout)) ? $requestedAt : null;
    }
}
