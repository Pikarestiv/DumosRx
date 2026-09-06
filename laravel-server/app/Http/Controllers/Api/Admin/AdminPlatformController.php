<?php

namespace App\Http\Controllers\Api\Admin;

use App\Models\Product;
use App\Services\Admin\AdminPlatformService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use OpenApi\Attributes as OA;

class AdminPlatformController extends AdminBaseController
{
    protected $adminPlatformService;

    public function __construct(AdminPlatformService $adminPlatformService)
    {
        $this->adminPlatformService = $adminPlatformService;
    }

    #[OA\Get(
        path: '/admin/summary',
        summary: 'Platform-wide summary metrics',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Summary', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function summary(Request $request)
    {
        return $this->withErrorResponse('Dashboard', 'Failed to fetch admin summary', function () {
            return response()->json($this->adminPlatformService->getGlobalSummary());
        });
    }

    #[OA\Get(
        path: '/admin/products',
        summary: 'Global product catalog view (across all stores) + catalog metrics',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'page', in: 'query', schema: new OA\Schema(type: 'integer', default: 1)),
            new OA\Parameter(name: 'search', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'category', in: 'query', schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Paginated products (flat `data`/`meta`, matching every other admin list endpoint) + metrics + distinct generic-name categories', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'data', type: 'array', items: new OA\Items(type: 'object')),
                new OA\Property(property: 'meta', type: 'object'),
                new OA\Property(property: 'metrics', type: 'object'),
                new OA\Property(property: 'categories', type: 'array', items: new OA\Items(type: 'string')),
            ])),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
        ],
    )]
    public function products(Request $request)
    {
        $page = $request->get('page', 1);
        $search = $request->get('search');
        $category = $request->get('category');

        $products = $this->adminPlatformService->getGlobalProducts($page, $search, $category);

        return response()->json([
            ...$products,
            'metrics' => $this->adminPlatformService->getProductMetrics(),
            'categories' => Product::select('generic_name')
                ->whereNotNull('generic_name')
                ->distinct()
                ->pluck('generic_name')
        ]);
    }

    #[OA\Post(
        path: '/admin/products/standardize',
        summary: 'Run catalog standardization (dedupe/normalize product names) across all stores',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Standardization result', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function standardize(Request $request)
    {
        return $this->withErrorResponse('Standardize', 'Failed to standardize catalog', function () {
            return response()->json($this->adminPlatformService->standardizeCatalog());
        });
    }

    #[OA\Get(
        path: '/admin/health',
        summary: 'Platform system health snapshot',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Health data', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function health(Request $request)
    {
        return $this->withErrorResponse('Health', 'Failed to fetch system health', function () {
            return response()->json($this->adminPlatformService->getSystemHealth());
        });
    }

    #[OA\Get(
        path: '/admin/errors',
        summary: 'Recent unresolved Sentry issues across client + server projects',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Issues', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function errors(Request $request)
    {
        return $this->withErrorResponse('Errors', 'Failed to fetch recent errors', function () {
            return response()->json($this->adminPlatformService->getRecentErrors());
        });
    }

    #[OA\Get(
        path: '/admin/downloads/manifest',
        summary: 'Real per-platform desktop/mobile binary availability + size, probed live against the downloads CDN',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Manifest', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
        ],
    )]
    public function downloadsManifest(Request $request)
    {
        // downloads.dumosrx.com sends no Access-Control-Allow-Origin header on
        // updater.json or the binaries themselves, so the superadmin panel
        // (a statically-exported Next.js app with no server runtime of its
        // own in production) can never read them via a browser-side fetch —
        // confirmed live: fetch() always rejects with a CORS network error,
        // even on a 200 response. This backend endpoint does the real
        // cross-origin work server-side (no browser, no CORS) and reports
        // back real existence + Content-Length per platform.
        //
        // updater.json's own `platforms` key only lists Tauri auto-update
        // targets (currently just darwin-aarch64) — not the full set of raw
        // installers actually uploaded to the CDN, so it's used here only to
        // read the current version string. Per-platform existence is
        // determined by directly HEAD-probing each platform's conventional
        // per-version URL, which is the complete, authoritative signal.
        $base = 'https://downloads.dumosrx.com';
        // Fallback version if updater.json is unreachable — mirrors the
        // frontend's own hardcoded APP_VERSION constant (web/lib/constants.ts).
        $version = '0.0.35';

        try {
            $manifestResponse = Http::timeout(5)->get("{$base}/updater.json");
            if ($manifestResponse->successful() && $manifestResponse->json('version')) {
                $version = ltrim((string) $manifestResponse->json('version'), 'v');
            }
        } catch (\Exception $e) {
            Log::warning('Admin Downloads Manifest: failed to fetch updater.json, using fallback version: ' . $e->getMessage());
        }

        $urls = [
            'windows' => "{$base}/v{$version}/DumosRx_{$version}_x64_en-US.msi",
            'macos' => "{$base}/v{$version}/DumosRx_{$version}_aarch64.dmg",
            'linux' => "{$base}/v{$version}/DumosRx_{$version}_amd64.AppImage",
            'android' => "{$base}/v{$version}/DumosRx-Android.apk",
        ];

        $platforms = [];
        try {
            $responses = Http::pool(fn ($pool) => collect($urls)->map(
                fn (string $url, string $platform) => $pool->as($platform)->timeout(5)->head($url)
            )->all());

            foreach ($urls as $platform => $url) {
                $response = $responses[$platform] ?? null;
                $exists = $response instanceof \Illuminate\Http\Client\Response && $response->successful();
                $sizeBytes = $exists ? (int) $response->header('Content-Length') ?: null : null;
                $platforms[$platform] = [
                    'url' => $url,
                    'exists' => $exists,
                    'sizeBytes' => $sizeBytes,
                ];
            }
        } catch (\Exception $e) {
            Log::warning('Admin Downloads Manifest: failed to probe platform binaries: ' . $e->getMessage());
            foreach ($urls as $platform => $url) {
                $platforms[$platform] = ['url' => $url, 'exists' => false, 'sizeBytes' => null];
            }
        }

        return response()->json([
            'version' => "v{$version}",
            'platforms' => $platforms,
        ]);
    }

    #[OA\Get(
        path: '/admin/activity-logs',
        summary: 'Platform-wide activity/audit log',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'page', in: 'query', schema: new OA\Schema(type: 'integer', default: 1)),
            new OA\Parameter(name: 'search', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'action', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'store_id', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'user_id', in: 'query', schema: new OA\Schema(type: 'string')),
            new OA\Parameter(name: 'date_from', in: 'query', schema: new OA\Schema(type: 'string', format: 'date')),
            new OA\Parameter(name: 'date_to', in: 'query', schema: new OA\Schema(type: 'string', format: 'date')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Activity logs', content: new OA\JsonContent(type: 'object')),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function activityLogs(Request $request)
    {
        return $this->withErrorResponse('Activity Logs', 'Failed to fetch activity logs', function () use ($request) {
            return response()->json($this->adminPlatformService->getActivityLogs(
                $request->query('page', 1),
                $request->query('search'),
                $request->query('action'),
                $request->query('store_id'),
                $request->query('user_id'),
                $request->query('date_from'),
                $request->query('date_to'),
            ));
        });
    }

    #[OA\Get(
        path: '/admin/search',
        summary: 'Global platform search (stores, users, etc.)',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'query', in: 'query', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Search results (empty array if no query given)', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'object'))),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Non-super_admin'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function search(Request $request)
    {
        return $this->withErrorResponse('Search', 'Search failed', function () use ($request) {
            $query = $request->query('query');
            if (!$query) return response()->json([]);

            return response()->json($this->adminPlatformService->globalSearch($query));
        });
    }
}
