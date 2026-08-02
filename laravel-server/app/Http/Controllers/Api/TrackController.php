<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DownloadLog;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class TrackController extends Controller
{
    #[OA\Post(
        path: '/track/download',
        summary: 'Log a desktop/mobile app download event',
        description: 'Public — fired by the marketing site\'s download buttons.',
        tags: ['Tracking'],
        requestBody: new OA\RequestBody(content: new OA\JsonContent(properties: [
            new OA\Property(property: 'platform', type: 'string', maxLength: 50, nullable: true, example: 'macos'),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Logged', content: new OA\JsonContent(properties: [new OA\Property(property: 'success', type: 'boolean')])),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function download(Request $request)
    {
        $request->validate([
            'platform' => 'nullable|string|max:50',
        ]);

        DownloadLog::create([
            'platform' => $request->platform ?? 'unknown',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json(['success' => true]);
    }
}
