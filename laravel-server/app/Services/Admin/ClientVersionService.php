<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ClientVersionService
{
    public const CACHE_KEY = 'admin_client_version_manifest';

    public const CACHE_TTL_SECONDS = 300;

    public function getVersion(bool $fresh = false): array
    {
        if ($fresh) {
            $manifest = $this->probe();
            $ttl = ! empty($manifest['build_sha']) ? self::CACHE_TTL_SECONDS : 30;
            Cache::put(self::CACHE_KEY, $manifest, $ttl);

            return $manifest;
        }

        $cached = Cache::get(self::CACHE_KEY);
        if (is_array($cached)) {
            return $cached;
        }

        $manifest = $this->probe();
        $ttl = ! empty($manifest['build_sha']) ? self::CACHE_TTL_SECONDS : 30;
        Cache::put(self::CACHE_KEY, $manifest, $ttl);

        return $manifest;
    }

    public function probe(): array
    {
        $baseUrl = rtrim((string) config('dumos.client_app_url', 'https://app.dumosrx.com'), '/');
        $url = "{$baseUrl}/version.json";

        try {
            $response = Http::timeout(4)->withoutVerifying()->get($url);
            if ($response->successful()) {
                $data = $response->json();
                if (is_array($data) && ! empty($data['build_sha'])) {
                    return [
                        'app_version' => isset($data['app_version']) && is_string($data['app_version'])
                            ? trim($data['app_version'])
                            : null,
                        'build_sha' => substr(trim((string) $data['build_sha']), 0, 8),
                        'built_at' => isset($data['built_at']) && is_string($data['built_at'])
                            ? trim($data['built_at'])
                            : null,
                    ];
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Client version manifest probe failed: '.$e->getMessage());
        }

        return [
            'app_version' => null,
            'build_sha' => null,
            'built_at' => null,
        ];
    }
}

