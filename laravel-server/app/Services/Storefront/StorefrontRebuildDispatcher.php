<?php

namespace App\Services\Storefront;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * The one place that asks GitHub for a storefront rebuild
 * (.github/workflows/deploy-web.yml listens for the `storefront-changed`
 * repository_dispatch). Used by the scheduled RebuildStorefrontIfDirty command
 * and by the admin's manual "Rebuild storefronts now" button.
 */
class StorefrontRebuildDispatcher
{
    public const NOT_CONFIGURED = 'not_configured';

    public function configured(): bool
    {
        return (bool) config('dumos.github.token') && (bool) config('dumos.github.repo');
    }

    /**
     * @return string|null null when GitHub accepted the dispatch, otherwise why it did not
     */
    public function dispatch(): ?string
    {
        if (! $this->configured()) {
            return self::NOT_CONFIGURED;
        }

        $repo = config('dumos.github.repo');

        try {
            $response = Http::withToken(config('dumos.github.token'))
                ->withHeaders([
                    'Accept' => 'application/vnd.github+json',
                    'X-GitHub-Api-Version' => '2022-11-28',
                ])
                ->timeout(10)
                ->post("https://api.github.com/repos/{$repo}/dispatches", [
                    'event_type' => 'storefront-changed',
                ]);
        } catch (\Throwable $e) {
            Log::error('Storefront rebuild dispatch threw: '.$e->getMessage());

            return 'Dispatch threw an exception: '.$e->getMessage();
        }

        if (! $response->successful()) {
            Log::error('Storefront rebuild dispatch failed: '.$response->status().' '.$response->body());

            return 'Dispatch failed with status '.$response->status();
        }

        return null;
    }
}
