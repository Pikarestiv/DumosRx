<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemConfig;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class SystemConfigController extends Controller
{
    #[OA\Get(
        path: '/system-configs/{key}',
        summary: 'Get a platform configuration value by key',
        description: 'Public, no auth required. Used by clients to fetch things like subscription plan definitions before login.',
        tags: ['System Config'],
        parameters: [new OA\Parameter(name: 'key', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'Value (null if the key doesn\'t exist)', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'data', description: 'Arbitrary JSON value'),
            ])),
        ],
    )]
    public function show($key)
    {
        $value = SystemConfig::getVal($key, null);

        return response()->json([
            'success' => true,
            'data' => $value
        ]);
    }

    #[OA\Put(
        path: '/admin/system-configs/{key}',
        summary: 'Set a platform configuration value',
        tags: ['System Config'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'key', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['value'],
            properties: [new OA\Property(property: 'value', description: 'Arbitrary JSON value')],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'success', type: 'boolean'),
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'data', description: 'The new value'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function update(Request $request, $key)
    {
        $validated = $request->validate([
            'value' => 'present'
        ]);

        $config = SystemConfig::setVal($key, $validated['value']);

        return response()->json([
            'success' => true,
            'message' => 'Configuration updated successfully',
            'data' => $config->value
        ]);
    }
}
