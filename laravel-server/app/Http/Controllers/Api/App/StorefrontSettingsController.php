<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Services\Storefront\StorefrontCatalogService;
use App\Services\Storefront\StorefrontStyleService;
use App\Support\StorefrontLocales;
use App\Support\StorefrontSettingsRules;
use App\Support\StorefrontThemes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use OpenApi\Attributes as OA;

/**
 * A store owner's own control over how their storefront looks: preset, accent
 * colour, details and languages. The super admin's equivalent lives in
 * AdminStoreStorefrontController; both validate through StorefrontSettingsRules
 * and write through StorefrontStyleService. Owner-only: staff accounts carry a
 * store_id and are refused, because a storefront's look is the owner's call.
 */
class StorefrontSettingsController extends Controller
{
    public function __construct(
        private StorefrontCatalogService $catalogService,
        private StorefrontStyleService $styleService,
    ) {}

    #[OA\Get(
        path: '/app/storefront-settings',
        summary: "Read the owner's storefront look and details",
        tags: ['Storefront'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Current settings, with the presets an owner may choose'),
            new OA\Response(response: 403, description: 'Not the store owner'),
            new OA\Response(response: 422, description: 'The store has no storefront address yet'),
        ],
    )]
    public function show(Request $request): JsonResponse
    {
        return $this->resolve($request, fn (Store $store) => response()->json($this->payload($store)));
    }

    #[OA\Put(
        path: '/app/storefront-settings',
        summary: "Change the owner's storefront look, details and languages",
        description: "Any subset of theme (a preset only), accent, tagline, whatsapp, pickup_minutes, opening_hours, locale and enabled_locales; null clears one. Needs the plan's custom_branding feature. A change queues the debounced automatic storefront rebuild, since an owner has no rebuild button.",
        tags: ['Storefront'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Saved; returns the new settings'),
            new OA\Response(response: 403, description: 'Not the store owner, or the plan lacks custom_branding'),
            new OA\Response(response: 422, description: 'A malformed value, a theme that is not an owner preset, or no storefront address yet'),
        ],
    )]
    public function update(Request $request): JsonResponse
    {
        $validated = StorefrontSettingsRules::normalise($request->validate([
            'theme' => ['sometimes', 'string', Rule::in(StorefrontThemes::OWNER_IDS)],
            ...StorefrontSettingsRules::rules(),
        ]));

        return $this->resolve($request, function (Store $store) use ($validated) {
            $this->styleService->apply(
                $this->catalogService->storefrontForStore($store),
                $validated,
                " for store: {$store->name} ({$store->id})",
                queueAutomaticRebuild: true,
            );

            return response()->json($this->payload($store));
        });
    }

    private function resolve(Request $request, callable $then): JsonResponse
    {
        $user = $request->user();

        if ($user->store_id) {
            return response()->json(['message' => "Only the store owner can change the storefront's look."], 403);
        }

        $store = Store::where('user_id', $user->id)->whereNotNull('store_slug')->orderBy('created_at')->first();

        if (! $store) {
            return response()->json(['message' => 'Set your storefront address first, then you can change how it looks.'], 422);
        }

        return $then($store);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Store $store): array
    {
        $storefront = $this->catalogService->storefrontForStore($store);

        return [
            'theme' => $storefront->theme,
            'available_themes' => StorefrontThemes::OWNER_IDS,
            'accent' => $storefront->accent,
            'tagline' => $storefront->tagline,
            'whatsapp' => $storefront->whatsapp,
            'pickup_minutes' => $storefront->pickup_minutes,
            'opening_hours' => $storefront->opening_hours,
            'locale' => $storefront->locale ?? StorefrontLocales::DEFAULT,
            'enabled_locales' => $storefront->enabled_locales ?? [$storefront->locale ?? StorefrontLocales::DEFAULT],
            'available_locales' => StorefrontLocales::IDS,
            'store_type' => $store->store_type,
        ];
    }
}
