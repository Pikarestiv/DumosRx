<?php

namespace App\Http\Controllers\Api\App;

use App\Http\Controllers\Controller;
use App\Models\Storefront;
use App\Models\User;
use App\Services\Storefront\StorefrontEntitlements;
use App\Services\Storefront\StorefrontPresenter;
use App\Services\Storefront\StorefrontStyleService;
use App\Support\StorefrontLocales;
use App\Support\StorefrontSettingsRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use OpenApi\Attributes as OA;

/** A store owner's own storefront look settings; off per store, see laravel-server/AGENTS.md. */
class StorefrontSettingsController extends Controller
{
    public function __construct(
        private StorefrontStyleService $styleService,
        private StorefrontEntitlements $entitlements,
        private StorefrontPresenter $presenter,
    ) {}

    #[OA\Get(
        path: '/app/storefront-settings',
        summary: "Read the owner's storefront look and details",
        tags: ['Storefront'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'The settings and the presets an owner may choose, or {allowed: false} when the plan lacks owner_self_edit_look or a super admin has not switched owner styling on. Both forms carry the plan\'s storefront `entitlements`, a `checkout_warning` (null, or why customers have no way left to pay but online), `opt_in_required` (the plan, Starter, needs the owner to opt in) and `opted_in`.'),
        ],
    )]
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();
        $storefront = $this->ownerStorefront($user);
        $entitlements = $this->entitlements->forOwner($user);
        $plan = [
            'entitlements' => $entitlements,
            'checkout_warning' => $storefront ? $this->presenter->checkoutWarning($storefront, $entitlements) : null,
            'opt_in_required' => $this->entitlements->requiresOwnerOptIn($this->entitlements->effectivePlan($user)),
            'opted_in' => $this->entitlements->hasOwnerOptedIn($user),
        ];

        return response()->json($storefront?->owner_style_enabled && $entitlements['owner_self_edit_look']
            ? [...$this->payload($storefront, $entitlements), ...$plan]
            : ['allowed' => false, ...$plan]);
    }

    #[OA\Put(
        path: '/app/storefront-settings',
        summary: "Change the owner's storefront look, details and languages",
        description: "Any subset of theme (a preset only), accent, tagline, whatsapp, pickup_minutes, opening_hours, locale and enabled_locales; null clears one. Needs the plan's owner_self_edit_look storefront entitlement (Enterprise) and owner_style_enabled on the store's storefront (a super admin switch, off by default). A change queues the debounced automatic storefront rebuild, since an owner has no rebuild button.",
        tags: ['Storefront'],
        security: [['sanctum' => []]],
        responses: [
            new OA\Response(response: 200, description: 'Saved; returns the new settings'),
            new OA\Response(response: 403, description: 'Not the store owner, owner styling not switched on, or the plan lacks owner_self_edit_look (code UPGRADE_REQUIRED)'),
            new OA\Response(response: 422, description: 'A malformed value or a theme that is not a preset the plan allows'),
        ],
    )]
    public function update(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->store_id) {
            return response()->json(['message' => "Only the store owner can change the storefront's look."], 403);
        }

        $entitlements = $this->entitlements->forOwner($user);
        if (! $entitlements['owner_self_edit_look']) {
            return response()->json([
                'success' => false,
                'message' => 'Changing the storefront look yourself is part of the Enterprise plan. Upgrade, or ask your account manager to change it.',
                'code' => 'UPGRADE_REQUIRED',
            ], 403);
        }

        $validated = StorefrontSettingsRules::normalise($request->validate([
            'theme' => ['sometimes', 'string', Rule::in($entitlements['allowed_presets'])],
            ...StorefrontSettingsRules::rules(),
        ]));

        $storefront = $this->ownerStorefront($user);

        if (! $storefront?->owner_style_enabled) {
            return response()->json(['message' => 'Your account manager manages how your storefront looks. Contact them to change it.'], 403);
        }

        $this->styleService->apply(
            $storefront,
            $validated,
            " for store: {$storefront->primaryStore?->name} ({$storefront->primary_store_id})",
            queueAutomaticRebuild: true,
        );

        return response()->json($this->payload($storefront->refresh(), $entitlements));
    }

    private function ownerStorefront(User $user): ?Storefront
    {
        return $user->store_id ? null : Storefront::where('user_id', $user->id)->first();
    }

    /**
     * @param  array<string, mixed>  $entitlements
     * @return array<string, mixed>
     */
    private function payload(Storefront $storefront, array $entitlements): array
    {
        return [
            'allowed' => true,
            'theme' => $storefront->theme,
            'available_themes' => $entitlements['allowed_presets'],
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
