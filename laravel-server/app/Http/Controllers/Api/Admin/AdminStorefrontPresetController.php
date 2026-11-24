<?php

namespace App\Http\Controllers\Api\Admin;

use App\Services\Admin\AdminStorefrontPresetService;
use App\Support\StorefrontThemes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use OpenApi\Attributes as OA;

class AdminStorefrontPresetController extends AdminBaseController
{
    public function __construct(private readonly AdminStorefrontPresetService $presets) {}

    #[OA\Get(
        path: '/admin/storefront/pro-presets',
        summary: 'The storefront presets Pro may use, and how many Pro storefronts use each (super admin only)',
        description: '`affected` counts storefronts whose owner is effectively on Pro right now (grace and lapse included) and whose saved theme is that preset. Send `proposed` (comma-separated preset ids) to also get `switching`: how many of them would change look under that list, and the preset they would fall back to.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'proposed', in: 'query', required: false, schema: new OA\Schema(type: 'string'))],
        responses: [
            new OA\Response(response: 200, description: 'presets, allowed, default, affected, and switching when proposed was sent'),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden'),
        ],
    )]
    public function show(Request $request): JsonResponse
    {
        $proposed = $request->query('proposed');

        return response()->json($this->presets->overview(is_string($proposed) ? explode(',', $proposed) : null));
    }

    #[OA\Put(
        path: '/admin/storefront/pro-presets',
        summary: 'Set the storefront presets Pro may use (super admin only)',
        description: 'At least one known preset. A Pro storefront whose saved preset leaves the list keeps its saved theme but is shown the first allowed preset, and is queued for the next rebuild. The change is written to the activity log with the old list, the new list and the number of storefronts switched.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(required: ['presets'], properties: [
            new OA\Property(property: 'presets', type: 'array', items: new OA\Items(type: 'string', enum: StorefrontThemes::PRESET_IDS)),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Saved; allowed and stores_switched'),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError'),
        ],
    )]
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'presets' => ['required', 'array', 'min:1'],
            'presets.*' => ['string', 'distinct', Rule::in(StorefrontThemes::PRESET_IDS)],
        ]);

        return response()->json($this->presets->update($validated['presets']));
    }
}
