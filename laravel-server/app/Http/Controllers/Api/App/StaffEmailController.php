<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;

class StaffEmailController extends Controller
{
    #[OA\Get(
        path: '/app/staff/email-available',
        summary: 'Whether an email address is free for a staff account',
        description: 'Archived accounts do not hold their address (archiving suffixes it), so only a live account makes an address unavailable. `ignore_id` excludes the account being edited.',
        tags: ['Staff'],
        security: [['sanctum' => []]],
        parameters: [
            new OA\Parameter(name: 'email', in: 'query', required: true, schema: new OA\Schema(type: 'string', format: 'email')),
            new OA\Parameter(name: 'ignore_id', in: 'query', schema: new OA\Schema(type: 'string')),
        ],
        responses: [
            new OA\Response(response: 200, description: 'Availability', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'available', type: 'boolean'),
            ])),
            new OA\Response(response: 401, ref: '#/components/responses/Unauthorized'),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function available(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email|max:255',
            'ignore_id' => 'sometimes|nullable|string',
        ]);

        $taken = User::query()
            ->whereRaw('LOWER(email) = ?', [strtolower($data['email'])])
            ->when($data['ignore_id'] ?? null, fn ($q, $id) => $q->where('id', '!=', $id))
            ->exists();

        return response()->json(['available' => ! $taken]);
    }
}
