<?php

namespace App\Console\Commands;

use App\Models\SystemConfig;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Debounced trigger for the storefront static-export rebuild
 * (.github/workflows/deploy-web.yml): runs every 15 minutes (see
 * routes/console.php), and only fires GitHub's repository_dispatch API when at
 * least one store is dirty (Store::boot()/Product::booted() stamp
 * storefront_dirty_at). Firing one dispatch per scheduled run rather than per
 * change means a store toggling on/off/on three times in two minutes triggers
 * one rebuild ~15 minutes later, not three - a full static rebuild + FTP
 * deploy is expensive enough that per-toggle dispatch isn't worth the
 * near-instant freshness.
 *
 * Clearing the flags is described in laravel-server/AGENTS.md: with a
 * confirmation token configured the workflow calls back on success and the
 * flags survive a failed build; without one it falls back to the older
 * clear-on-dispatch behaviour.
 */
class RebuildStorefrontIfDirty extends Command
{
    public const REQUESTED_AT_KEY = 'storefront_rebuild_requested_at';

    protected $signature = 'storefront:rebuild-if-dirty';

    protected $description = 'Trigger a storefront rebuild via GitHub Actions if any store\'s published storefront data changed since the last check.';

    public function handle()
    {
        $dirtyStoreIds = DB::table('stores')
            ->whereNotNull('storefront_dirty_at')
            ->pluck('id');

        if ($dirtyStoreIds->isEmpty()) {
            $this->info('No dirty stores - nothing to rebuild.');
            return;
        }

        $awaitsConfirmation = (bool) config('dumos.storefront.rebuild_token');

        if ($awaitsConfirmation && ($pendingSince = $this->pendingRebuildRequestedAt())) {
            $this->info('A rebuild dispatched '.$pendingSince->diffForHumans().' has not confirmed yet - not dispatching another.');
            return;
        }

        $token = config('dumos.github.token');
        $repo = config('dumos.github.repo');

        if (! $token || ! $repo) {
            $this->warn('GITHUB_TOKEN/GITHUB_REPO not configured - skipping rebuild trigger (flags left dirty, will retry next run).');
            return;
        }

        $requestedAt = now();

        try {
            $response = Http::withToken($token)
                ->withHeaders([
                    'Accept' => 'application/vnd.github+json',
                    'X-GitHub-Api-Version' => '2022-11-28',
                ])
                ->timeout(10)
                ->post("https://api.github.com/repos/{$repo}/dispatches", [
                    'event_type' => 'storefront-changed',
                ]);

            if (! $response->successful()) {
                Log::error('Storefront rebuild dispatch failed: '.$response->status().' '.$response->body());
                $this->error('Dispatch failed with status '.$response->status().' - flags left dirty, will retry next run.');
                return;
            }
        } catch (\Throwable $e) {
            Log::error('Storefront rebuild dispatch threw: '.$e->getMessage());
            $this->error('Dispatch threw an exception - flags left dirty, will retry next run: '.$e->getMessage());
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

        $this->info('Storefront rebuild dispatched for '.$dirtyStoreIds->count().' dirty store(s).');
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
