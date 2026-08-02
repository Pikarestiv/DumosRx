<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use OpenApi\Attributes as OA;

class BackupController extends Controller
{
    #[OA\Post(
        path: '/backups/upload',
        summary: 'Upload a manual data backup file',
        description: 'SECURITY NOTE: stored in a single shared `backups/` directory with no per-user/store scoping — see `list`/`download`.',
        tags: ['Backups'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\MediaType(mediaType: 'multipart/form-data', schema: new OA\Schema(
            required: ['backup'],
            properties: [new OA\Property(property: 'backup', type: 'string', format: 'binary')],
        ))),
        responses: [
            new OA\Response(response: 200, description: 'Uploaded', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'path', type: 'string'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function upload(Request $request)
    {
        $request->validate([
            'backup' => 'required|file',
        ]);

        $path = $request->file('backup')->store('backups');

        return response()->json(['success' => true, 'path' => $path]);
    }

    #[OA\Get(
        path: '/backups',
        summary: 'List backup files',
        description: 'SECURITY NOTE: not scoped to the caller — returns every filename in the shared `backups/` directory across all stores, not just the caller\'s own uploads.',
        tags: ['Backups'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Filenames', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'string'))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function list()
    {
        $files = Storage::files('backups');
        return response()->json($files);
    }

    #[OA\Get(
        path: '/backups/{backup}/download',
        summary: 'Download a backup file',
        description: 'SECURITY NOTE: does not verify the requested filename belongs to the caller\'s own store — any authenticated user who knows/guesses a filename can download it.',
        tags: ['Backups'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'backup', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'File stream', content: new OA\MediaType(mediaType: 'application/octet-stream')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function download($backup)
    {
        return Storage::download("backups/{$backup}");
    }
}
