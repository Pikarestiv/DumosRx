<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Storefront;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Storefront\StorefrontEntitlements;
use App\Support\StorefrontThemes;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/** The admin-editable Pro preset list; see laravel-server/AGENTS.md, "Storefront plan entitlements". */
class AdminStorefrontPresetService
{
    public function __construct(private readonly StorefrontEntitlements $entitlements) {}

    /**
     * @param  array<int, string>|null  $proposed
     * @return array<string, mixed>
     */
    public function overview(?array $proposed = null): array
    {
        $proStorefronts = $this->proStorefronts();
        $affected = array_fill_keys(StorefrontThemes::PRESET_IDS, 0);
        foreach ($proStorefronts as $storefront) {
            $affected[$storefront->theme]++;
        }

        $current = $this->entitlements->proAllowedPresets();
        $overview = [
            'presets' => StorefrontThemes::PRESET_IDS,
            'allowed' => $current,
            'default' => array_values(array_intersect(StorefrontThemes::PRESET_IDS, (array) config('storefront_entitlements.plans.pro.allowed_presets'))),
            'affected' => $affected,
        ];

        if ($proposed !== null) {
            $next = $this->canonical($proposed);
            $overview['switching'] = [
                'count' => $this->switchingOwners($proStorefronts, $current, $next)->count(),
                'to' => $next[0] ?? null,
            ];
        }

        return $overview;
    }

    /**
     * @param  array<int, string>  $presets  already validated as known preset ids
     * @return array{allowed: array<int, string>, stores_switched: int}
     */
    public function update(array $presets): array
    {
        return DB::transaction(function () use ($presets) {
            $old = $this->entitlements->proAllowedPresets();
            $new = $this->canonical($presets);
            $switching = $this->switchingOwners($this->proStorefronts(), $old, $new);

            SystemConfig::setVal(
                (string) config('storefront_entitlements.pro_allowed_presets_key'),
                $new,
                'The storefront presets a Pro plan may use; Enterprise always gets every preset.',
            );
            Product::markStorefrontsDirty([], $switching->all());

            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => 'STOREFRONT_PRO_PRESETS_CHANGED',
                'description' => 'Changed the Pro storefront presets from ['.implode(', ', $old).'] to ['.implode(', ', $new).'], switching '.$switching->count().' storefront(s)',
                'properties' => ['old' => $old, 'new' => $new, 'stores_affected' => $switching->count()],
            ]);

            return ['allowed' => $new, 'stores_switched' => $switching->count()];
        });
    }

    /**
     * @return Collection<int, Storefront>
     */
    private function proStorefronts(): Collection
    {
        $storefronts = Storefront::whereIn('theme', StorefrontThemes::PRESET_IDS)->get();
        $owners = User::whereIn('id', $storefronts->pluck('user_id')->unique())->get()->keyBy('id');

        return $storefronts->filter(fn (Storefront $storefront) => isset($owners[$storefront->user_id])
            && $this->entitlements->effectivePlan($owners[$storefront->user_id]) === 'pro')->values();
    }

    /**
     * @param  Collection<int, Storefront>  $proStorefronts
     * @param  array<int, string>  $old
     * @param  array<int, string>  $new
     * @return Collection<int, string> owner ids
     */
    private function switchingOwners(Collection $proStorefronts, array $old, array $new): Collection
    {
        return $proStorefronts
            ->filter(fn (Storefront $storefront) => $this->entitlements->effectiveTheme($storefront->theme, ['allowed_presets' => $old])
                !== $this->entitlements->effectiveTheme($storefront->theme, ['allowed_presets' => $new]))
            ->pluck('user_id')
            ->unique()
            ->values();
    }

    /**
     * @param  array<int, string>  $presets
     * @return array<int, string>
     */
    private function canonical(array $presets): array
    {
        return array_values(array_intersect(StorefrontThemes::PRESET_IDS, $presets));
    }
}
