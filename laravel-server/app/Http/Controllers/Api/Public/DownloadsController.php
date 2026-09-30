<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Services\DownloadsManifestService;
use OpenApi\Attributes as OA;

class DownloadsController extends Controller
{
    public function __construct(private DownloadsManifestService $downloadsManifestService) {}

    #[OA\Get(
        path: '/downloads/manifest',
        summary: 'Public per-platform installer availability, version and size for the marketing Downloads page',
        tags: ['Public'],
        responses: [
            new OA\Response(response: 200, description: 'Manifest', content: new OA\JsonContent(type: 'object')),
        ],
    )]
    public function manifest()
    {
        return response()->json($this->downloadsManifestService->cachedManifest());
    }
}
