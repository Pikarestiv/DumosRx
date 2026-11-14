<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Storefront;
use App\Models\User;
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
 * and write through StorefrontStyleService. Off by default per store: a super
 * admin switches owner_style_enabled on for a store, because an owner change
 * queues a full automatic rebuild. Owner-only: staff accounts carry a
 * store_id and are refused, because a storefront's look is the owner's call.
 */
class StorefrontSettingsController extends Controller
{
    public function __construct(private StorefrontStyleService $styleService) {}

    #[OA\Get(
        path: '/app/storefront-settings',
        summary: "Read the owner's storefront look and details",
        tags: ['Storefront'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'The settings and the presets an owner may choose, or {allowed: false} when a super admin has not switched owner styling on for this store'),
        ],
    )]
    public function show(Request $request): JsonResponse
    {
        $storefront = $this->ownerStorefront($request->user());

        return response()->json($storefront?->owner_style_enabled ? $this->payload($storefront) : ['allowed' => false]);
    }

    #[OA\Put(
        path: '/app/storefront-settings',
        summary: "Change the owner's storefront look, details and languages",
        description: "Any subset of theme (a preset only), accent, tagline, whatsapp, pickup_minutes, opening_hours, locale and enabled_locales; null clears one. Needs the plan's custom_branding feature and owner_style_enabled on the store's storefront (a super admin switch, off by default). A change queues the debounced automatic storefront rebuild, since an owner has no rebuild button.",
        tags: ['Storefront'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Saved; returns the new settings'),
            new OA\Response(response: 403, description: 'Not the store owner, owner styling not switched on, or the plan lacks custom_branding'),
            new OA\Response(response: 422, description: 'A malformed value or a theme that is not an owner preset'),
        ],
    )]
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->store_id) {
            return response()->json(['message' => "Only the store owner can change the storefront's look."], 403);
        }

        $validated = StorefrontSettingsRules::normalise($request->validate([
            'theme' => ['sometimes', 'string', Rule::in(StorefrontThemes::OWNER_IDS)],
            ...StorefrontSettingsRules::rules(),
        ]));

        $storefront = $this->ownerStorefront($user);

        if (! $storefront?->owner_style_enabled) {
            return response()->json(['message' => "Your account manager manages how your storefront looks. Contact them to change it."], 403);
        }

        $this->styleService->apply(
            $storefront,
            $validated,
            " for store: {$storefront->primaryStore?->name} ({$storefront->primary_store_id})",
            queueAutomaticRebuild: true,
        );

        return response()->json($this->payload($storefront->refresh()));
    }

    private function ownerStorefront(User $user): ?Storefront
    {
        return $user->store_id ? null : Storefront::where('user_id', $user->id)->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Storefront $storefront): array
    {
        return [
            'allowed' => true,
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
            'store_type' => $storefront->primaryStore?->store_type,
        ];
    }
}
