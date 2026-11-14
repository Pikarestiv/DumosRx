<?php

namespace App\Http\Controllers\Api\Admin;

use App\Exceptions\StoreActionBlockedException;
use App\Services\Admin\AdminStorefrontRebuildService;
use App\Services\Admin\AdminStoreStorefrontService;
use App\Services\Storefront\StorefrontRebuildDispatcher;
use App\Support\StorefrontThemes;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use OpenApi\Attributes as OA;

/**
 * Publish / unpublish a store's public storefront from the admin panel, and
 * (super admin only) set its theme.
 * Separate from AdminStoreController, which is already past the repo's
 * 350-line rule.
 */
class AdminStoreStorefrontController extends AdminBaseController
{
    private const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    private const CLOCK = '/^([01]\d|2[0-3]):[0-5]\d$/';

    public function __construct(
        private AdminStoreStorefrontService $storefrontService,
        private AdminStorefrontRebuildService $rebuildService,
    ) {}

    #[OA\Put(
        path: '/admin/stores/{id}/storefront',
        summary: "Publish or unpublish a store's online storefront, and optionally set its slug",
        description: 'Sets stores.online_store_enabled, and stores.store_slug when `store_slug` is sent. The public endpoints additionally require a slug and the owner\'s current store_url entitlement, so enabling this is necessary but not sufficient for a reachable page. Enabling a store with no slug is still refused. A slug is refused (422) if it slugifies to nothing or over 100 characters, if any other store (including an archived one) already holds it, or if the store\'s 6-month slug-change cooldown is live.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['enabled'],
            properties: [
                new OA\Property(property: 'enabled', type: 'boolean'),
                new OA\Property(property: 'store_slug', type: 'string', description: 'Slugified before storing. Omit to leave the current slug alone.'),
            ],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'online_store_enabled', type: 'boolean'),
                new OA\Property(property: 'store_slug', type: 'string', nullable: true),
            ])),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Missing the manage_account_status permission'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'Enabling a store that has no storefront slug, or a slug that is malformed, taken, or inside the change cooldown'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function update(Request $request, string $id)
    {
        $validated = $request->validate([
            'enabled' => 'required|boolean',
            'store_slug' => 'sometimes|string|max:255',
        ]);

        return $this->withErrorResponse('Storefront Toggle', 'Failed to update the storefront', function () use ($id, $validated) {
            try {
                $store = $this->storefrontService->setEnabled(
                    $id,
                    (bool) $validated['enabled'],
                    $validated['store_slug'] ?? null,
                );
            } catch (StoreActionBlockedException $e) {
                // `message`, not the admin controllers' usual `error` key:
                // base-client.ts only lifts `data.message` onto the thrown
                // Error, so this is the one shape the toast can actually read.
                return response()->json(['message' => $e->getMessage()], 422);
            }

            return response()->json([
                'message' => $store->online_store_enabled
                    ? 'Storefront published'
                    : 'Storefront unpublished',
                'online_store_enabled' => (bool) $store->online_store_enabled,
                'store_slug' => $store->store_slug,
            ]);
        });
    }

    #[OA\Put(
        path: '/admin/stores/{id}/storefront/theme',
        summary: "Set the colour theme of the store owner's public storefront (super admin only)",
        description: "Writes storefronts.theme for the store's owner, creating the storefront row from this store if none exists yet, and stamps storefronts.style_dirty_at so the store shows Pending rebuild. It does not queue an automatic rebuild: use POST /admin/storefront/rebuild. `theme` must be one of App\\Support\\StorefrontThemes::IDS, which the store detail payload also returns as storefront.available_themes. Setting the current theme is a no-op that still returns 200.",
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(
            required: ['theme'],
            properties: [new OA\Property(property: 'theme', type: 'string', enum: StorefrontThemes::IDS)],
        )),
        responses: [
            new OA\Response(response: 200, description: 'Updated', content: new OA\JsonContent(properties: [
                new OA\Property(property: 'message', type: 'string'),
                new OA\Property(property: 'theme', type: 'string'),
            ])),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Not a super admin'),
            new OA\Response(response: 404, description: 'No store with that id'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'A theme outside the allow-list, or a store with no storefront address and no storefront yet'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function updateTheme(Request $request, string $id)
    {
        $validated = $request->validate([
            'theme' => ['required', 'string', Rule::in(StorefrontThemes::IDS)],
        ]);

        return $this->withErrorResponse('Storefront Theme', 'Failed to update the storefront theme', function () use ($id, $validated) {
            try {
                $storefront = $this->storefrontService->setTheme($id, $validated['theme']);
            } catch (ModelNotFoundException) {
                return response()->json(['message' => 'Store not found'], 404);
            } catch (StoreActionBlockedException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }

            return response()->json([
                'message' => 'Storefront theme updated',
                'theme' => $storefront->theme,
            ]);
        });
    }

    #[OA\Put(
        path: '/admin/stores/{id}/storefront/settings',
        summary: "Set the accent colour and store details shown on the owner's public storefront (super admin only)",
        description: "Writes any subset of storefronts.accent, tagline, whatsapp, pickup_minutes and opening_hours for the store's owner (null clears one). Opening hours are keyed mon..sun, each null (closed) or {open, close} as HH:MM with open before close. A change stamps storefronts.style_dirty_at, so the store shows Pending rebuild until the next rebuild ships, but it does not queue an automatic rebuild.",
        tags: ['Admin'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'id', in: 'path', required: true, schema: new OA\Schema(type: 'string'))],
        requestBody: new OA\RequestBody(required: true, content: new OA\JsonContent(properties: [
            new OA\Property(property: 'accent', type: 'string', nullable: true, example: '#F2B705'),
            new OA\Property(property: 'tagline', type: 'string', nullable: true),
            new OA\Property(property: 'whatsapp', type: 'string', nullable: true),
            new OA\Property(property: 'pickup_minutes', type: 'integer', nullable: true),
            new OA\Property(property: 'opening_hours', type: 'object', nullable: true),
        ])),
        responses: [
            new OA\Response(response: 200, description: 'Saved', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Not a super admin'),
            new OA\Response(response: 422, ref: '#/components/responses/ValidationError', description: 'A malformed value, or a store with no storefront address and no storefront yet'),
            new OA\Response(response: 500, ref: '#/components/responses/ServerError'),
        ],
    )]
    public function updateSettings(Request $request, string $id)
    {
        $validated = $request->validate([
            'accent' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'tagline' => ['sometimes', 'nullable', 'string', 'max:140'],
            'whatsapp' => ['sometimes', 'nullable', 'string', 'regex:/^\+?[0-9 ()\-]{6,32}$/'],
            'pickup_minutes' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:1440'],
            'opening_hours' => ['sometimes', 'nullable', 'array', function (string $attribute, mixed $hours, \Closure $fail) {
                foreach ((array) $hours as $day => $range) {
                    if (! in_array($day, self::WEEKDAYS, true)) {
                        $fail("'{$day}' is not a weekday.");

                        return;
                    }
                    if ($range === null) {
                        continue;
                    }
                    $valid = is_array($range)
                        && preg_match(self::CLOCK, (string) ($range['open'] ?? ''))
                        && preg_match(self::CLOCK, (string) ($range['close'] ?? ''))
                        && $range['open'] < $range['close'];
                    if (! $valid) {
                        $fail("The hours for {$day} must be HH:MM times with opening before closing.");

                        return;
                    }
                }
            }],
        ]);

        if (isset($validated['accent'])) {
            $validated['accent'] = strtoupper($validated['accent']);
        }

        return $this->withErrorResponse('Storefront Settings', 'Failed to update the storefront settings', function () use ($id, $validated) {
            try {
                $this->storefrontService->updateSettings($id, $validated);
            } catch (ModelNotFoundException) {
                return response()->json(['message' => 'Store not found'], 404);
            } catch (StoreActionBlockedException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }

            return response()->json(['message' => 'Storefront settings updated']);
        });
    }

    #[OA\Post(
        path: '/admin/storefront/rebuild',
        summary: 'Rebuild every storefront now (super admin only)',
        description: 'Fires the same `storefront-changed` repository_dispatch the scheduled command sends, without waiting for a store to be dirty, so style changes can be shipped on demand. 202 means GitHub accepted the dispatch, not that the deploy has finished.',
        tags: ['Admin'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 202, description: 'Rebuild requested', content: new OA\JsonContent(properties: [new OA\Property(property: 'message', type: 'string')])),
            new OA\Response(response: 403, ref: '#/components/responses/Forbidden', description: 'Not a super admin'),
            new OA\Response(response: 502, description: 'GitHub refused or could not be reached'),
            new OA\Response(response: 503, description: 'GITHUB_TOKEN / GITHUB_REPO are not configured on this server'),
        ],
    )]
    public function rebuild()
    {
        $failure = $this->rebuildService->rebuildNow();

        if ($failure === StorefrontRebuildDispatcher::NOT_CONFIGURED) {
            return response()->json(['message' => 'Rebuilds are not configured on this server (GITHUB_TOKEN and GITHUB_REPO).'], 503);
        }

        if ($failure !== null) {
            return response()->json(['message' => "GitHub did not accept the rebuild request. {$failure}"], 502);
        }

        return response()->json(['message' => 'Rebuild requested. Storefronts update once the deploy finishes.'], 202);
    }
}
