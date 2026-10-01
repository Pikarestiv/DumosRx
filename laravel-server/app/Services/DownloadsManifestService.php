<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Server-side probe of the downloads CDN. See docs/DOWNLOADS_MANIFEST.md for
 * why this lives on the server and how the admin/public callers differ.
 */
class DownloadsManifestService
{
    private const CDN_BASE = 'https://downloads.dumosrx.com';

    private const FALLBACK_VERSION = '0.0.35';

    private const PUBLIC_CACHE_KEY = 'downloads_manifest_public';

    private const PUBLIC_CACHE_TTL_SECONDS = 600;

    public function cachedManifest(): array
    {
        return Cache::remember(
            self::PUBLIC_CACHE_KEY,
            self::PUBLIC_CACHE_TTL_SECONDS,
            fn () => $this->manifest()
        );
    }

    public function manifest(): array
    {
        $version = $this->currentVersion();
        $urls = $this->platformUrls($version);

        return [
            'version' => "v{$version}",
            'platforms' => $this->probePlatforms($urls),
        ];
    }

    private function currentVersion(): string
    {
        try {
            $response = Http::timeout(5)->get(self::CDN_BASE.'/updater.json');
            if ($response->successful() && $response->json('version')) {
                return ltrim((string) $response->json('version'), 'v');
            }
        } catch (\Exception $e) {
            Log::warning('Downloads manifest: failed to fetch updater.json, using fallback version: '.$e->getMessage());
        }

        return self::FALLBACK_VERSION;
    }

    private function platformUrls(string $version): array
    {
        $base = self::CDN_BASE."/v{$version}";

        return [
            'windows' => "{$base}/DumosRx_{$version}_x64_en-US.msi",
            'macos' => "{$base}/DumosRx_{$version}_aarch64.dmg",
            'linux' => "{$base}/DumosRx_{$version}_amd64.AppImage",
            'android' => "{$base}/DumosRx-Android.apk",
        ];
    }

    private function probePlatforms(array $urls): array
    {
        try {
            $responses = Http::pool(fn ($pool) => collect($urls)->map(
                fn (string $url, string $platform) => $pool->as($platform)->timeout(5)->head($url)
            )->all());
        } catch (\Exception $e) {
            Log::warning('Downloads manifest: failed to probe platform binaries: '.$e->getMessage());

            return collect($urls)
                ->map(fn (string $url) => ['url' => $url, 'exists' => false, 'sizeBytes' => null])
                ->all();
        }

        $platforms = [];
        foreach ($urls as $platform => $url) {
            $response = $responses[$platform] ?? null;
            $exists = $response instanceof \Illuminate\Http\Client\Response && $response->successful();
            $platforms[$platform] = [
                'url' => $url,
                'exists' => $exists,
                'sizeBytes' => $exists ? ((int) $response->header('Content-Length') ?: null) : null,
            ];
        }

        return $platforms;
    }
}
