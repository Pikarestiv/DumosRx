<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Debounced trigger for the storefront static-export rebuild
 * (.github/workflows/deploy-web.yml): runs every 15 minutes (see
 * routes/console.php), and only fires GitHub's repository_dispatch API
 * when at least one store has gone online/offline or changed its slug
 * since the last run (Store::boot()'s saved hook stamps
 * storefront_dirty_at). Firing one dispatch per scheduled run rather than
 * per change means a store toggling on/off/on three times in two minutes
 * triggers one rebuild ~15 minutes later, not three - a full static
 * rebuild + FTP deploy is expensive enough that per-toggle dispatch isn't
 * worth the near-instant freshness.
 */
class RebuildStorefrontIfDirty extends Command
{
    protected $signature = 'storefront:rebuild-if-dirty';

    protected $description = 'Trigger a storefront rebuild via GitHub Actions if any store\'s online/slug settings changed since the last check.';

    public function handle()
    {
        $dirtyStoreIds = DB::table('stores')
            ->whereNotNull('storefront_dirty_at')
            ->pluck('id');

        if ($dirtyStoreIds->isEmpty()) {
            $this->info('No dirty stores - nothing to rebuild.');
            return;
        }

        $token = config('dumos.github.token');
        $repo = config('dumos.github.repo');

        if (! $token || ! $repo) {
            $this->warn('GITHUB_TOKEN/GITHUB_REPO not configured - skipping rebuild trigger (flags left dirty, will retry next run).');
            return;
        }

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

        // Only cleared on a confirmed successful dispatch, so a failed
        // attempt (network blip, bad token) naturally retries on the next
        // scheduled run instead of silently losing the pending rebuild.
        DB::table('stores')->whereIn('id', $dirtyStoreIds)->update([
            'storefront_dirty_at' => null,
        ]);

        $this->info('Storefront rebuild dispatched for '.$dirtyStoreIds->count().' dirty store(s).');
    }
}
