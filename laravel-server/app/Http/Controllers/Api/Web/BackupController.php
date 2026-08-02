<?php

namespace App\Http\Controllers\Api\Web;

use App\Http\Controllers\Controller;
use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use OpenApi\Attributes as OA;

class BackupController extends Controller
{
    /**
     * The tenant-owning user's ID — matches the scoping convention used
     * throughout SyncController: staff (store_id set) resolve to their
     * store's owner, store owners resolve to themselves.
     */
    private function ownerId(Request $request): string
    {
        $user = $request->user();
        return $user->store_id
            ? Store::where('id', $user->store_id)->value('user_id')
            : $user->id;
    }

    #[OA\Post(
        path: '/backups/upload',
        summary: 'Upload a manual data backup file',
        description: 'Stored under a per-tenant directory (`backups/{owner_id}/`) — not visible to other stores.',
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

        $path = $request->file('backup')->store('backups/' . $this->ownerId($request));

        return response()->json(['success' => true, 'path' => $path]);
    }

    #[OA\Get(
        path: '/backups',
        summary: "List the caller's own backup files",
        tags: ['Backups'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Filenames', content: new OA\JsonContent(type: 'array', items: new OA\Items(type: 'string'))),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
        ],
    )]
    public function list(Request $request)
    {
        $files = Storage::files('backups/' . $this->ownerId($request));
        return response()->json($files);
    }

    #[OA\Get(
        path: '/backups/{backup}/download',
        summary: 'Download one of the caller\'s own backup files',
        description: 'The filename is resolved only within the caller\'s own `backups/{owner_id}/` directory — a filename from another store\'s backups cannot be downloaded regardless of whether it\'s guessed correctly.',
        tags: ['Backups'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'backup', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'File stream', content: new OA\MediaType(mediaType: 'application/octet-stream')),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 404, ref: '#/components/responses/NotFound'),
        ],
    )]
    public function download(Request $request, $backup)
    {
        // basename() strips any directory traversal the client tries to sneak
        // into the path parameter (e.g. "../other-owner-id/file.zip").
        $path = 'backups/' . $this->ownerId($request) . '/' . basename($backup);

        if (!Storage::exists($path)) {
            abort(404);
        }

        return Storage::download($path);
    }
}
