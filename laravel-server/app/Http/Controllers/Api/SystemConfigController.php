<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemConfig;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
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
    /** Highest price, in naira, this endpoint will store for a plan tier.
     * Mirrors MAX_PLAN_PRICE in web/components/admin/views/plan-tier-card.tsx. */
    private const MAX_PLAN_PRICE = 100000000;

    public function update(Request $request, $key)
    {
        $validated = $request->validate([
            'value' => 'present'
        ]);

        // This endpoint stores arbitrary JSON for arbitrary keys, so there is
        // no single schema to validate. `subscription_plans` is the one key
        // that carries money, though, and the superadmin plan editor was the
        // only thing standing between a cleared price field and a live ₦0 (or
        // negative) paid tier. Validate that key specifically.
        if ($key === 'subscription_plans') {
            $this->validatePlanPricing($request);
        }

        $config = SystemConfig::setVal($key, $validated['value']);

        return response()->json([
            'success' => true,
            'message' => 'Configuration updated successfully',
            'data' => $config->value
        ]);
    }

    /**
     * Schema check for the price fields inside the `subscription_plans` blob.
     *
     * Shape (see SystemConfigSeeder): value.tiers.<free|starter|pro|
     * enterprise>.{price_monthly, price_yearly, active, limits, features}.
     */
    private function validatePlanPricing(Request $request): void
    {
        $request->validate([
            'value' => 'required|array',
            'value.tiers' => 'required|array',
            'value.tiers.*.price_monthly' => 'required|numeric|min:0|max:' . self::MAX_PLAN_PRICE,
            'value.tiers.*.price_yearly' => 'required|numeric|min:0|max:' . self::MAX_PLAN_PRICE,
        ]);

        // min:0 above stops a negative price; this stops the other half of the
        // same bug - an *active, non-free* tier published at ₦0, which is what
        // `Number("") === 0` produced when the price field was cleared.
        foreach ((array) $request->input('value.tiers', []) as $tierKey => $tier) {
            if ($tierKey === 'free' || !is_array($tier)) {
                continue;
            }
            if (!($tier['active'] ?? false)) {
                continue;
            }

            foreach (['price_monthly', 'price_yearly'] as $field) {
                if ((float) ($tier[$field] ?? 0) <= 0) {
                    throw ValidationException::withMessages([
                        "value.tiers.{$tierKey}.{$field}" =>
                            "The {$tierKey} plan is active, so its {$field} must be greater than 0.",
                    ]);
                }
            }
        }
    }
}
